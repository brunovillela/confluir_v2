-- Confluir — Pessoal › Atribuições / SST: risco por EXECUTOR (2026-08-31)
--
-- Reestrutura o modelo entregue em pessoal-atribuicoes-sst.sql:
--   1. Recorrência/frequência saem da TAREFA e passam ao EXECUTOR (cada
--      funcionário pode executar a mesma tarefa com cadência diferente).
--   2. A tarefa deixa de pertencer a uma função (funcao_id) — o desvio de
--      função passa a ser analisado POR EXECUTOR, comparando as tarefas que a
--      pessoa executa com o plano de cargos da função dela.
--   3. O RISCO (inicial e residual) sai da tarefa e vai para o EXECUTOR: a
--      probabilidade depende da exposição de cada pessoa. A tarefa mantém só
--      os PERIGOS (inerentes à atividade).
--   4. Jornada de trabalho contratada por funcionário (dias + horários) —
--      base do % de consumo da disponibilidade e do alerta fora de horário.
--   5. Grupo Homogêneo de Exposição (GHE): grupos de trabalhadores com
--      exposição semelhante, montados a partir de tarefas × tempo.
--
-- Defensivo e idempotente (padrão add-column-if-not-exists). RLS inline por
-- tabela, sem funções com dollar-quoting aninhado. Executar UMA VEZ no SQL
-- Editor do Supabase, DEPOIS de pessoal-atribuicoes-sst.sql.

-- 1. Executor ganha recorrência/frequência próprias -----------------------------
alter table pessoal_atividades_executores add column if not exists recorrencia text; -- rotineira | nao_rotineira
alter table pessoal_atividades_executores add column if not exists frequencia text;

-- Backfill: herda o que a tarefa declarava (só onde o executor ainda não tem).
-- Condicional à coluna ainda existir na tarefa (o passo 3 a derruba), para o
-- script continuar idempotente numa segunda execução.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'pessoal_atividades' and column_name = 'recorrencia'
  ) then
    update pessoal_atividades_executores e
    set recorrencia = a.recorrencia
    from pessoal_atividades a
    where a.id = e.atividade_id and e.recorrencia is null and a.recorrencia is not null;

    update pessoal_atividades_executores e
    set frequencia = a.frequencia
    from pessoal_atividades a
    where a.id = e.atividade_id and e.frequencia is null and a.frequencia is not null;
  end if;
end $$;

-- 2. Risco vinculado ao executor ------------------------------------------------
alter table pessoal_atividades_riscos add column if not exists executor_id uuid
  references pessoal_atividades_executores(id) on delete cascade;
create index if not exists idx_pessoal_ativ_riscos_exec
  on pessoal_atividades_riscos (executor_id);

-- Backfill dos riscos existentes (avaliados no nível da tarefa):
--  a) o registro original é ATRIBUÍDO ao primeiro executor da tarefa (update,
--     preservando o vínculo medida→risco);
--  b) para os demais executores da tarefa, o risco é REPLICADO (insert);
--  c) riscos de tarefa SEM executor ficam com executor_id null — a tela os
--     mostra como "avaliação antiga" até serem reatribuídos ou excluídos.
with primeiro as (
  select distinct on (atividade_id) atividade_id, id as executor_id
  from pessoal_atividades_executores
  order by atividade_id, created_at
)
update pessoal_atividades_riscos r
set executor_id = p.executor_id
from primeiro p
where r.executor_id is null and r.atividade_id = p.atividade_id;

insert into pessoal_atividades_riscos
  (emp_proprietaria_id, atividade_id, perigo_id, categoria, probabilidade,
   severidade, probabilidade_residual, severidade_residual, observacao, executor_id)
select r.emp_proprietaria_id, r.atividade_id, r.perigo_id, r.categoria,
       r.probabilidade, r.severidade, r.probabilidade_residual,
       r.severidade_residual, r.observacao, e.id
from pessoal_atividades_riscos r
join pessoal_atividades_executores e on e.atividade_id = r.atividade_id
where r.executor_id is not null
  and e.id <> r.executor_id
  and not exists (
    select 1 from pessoal_atividades_riscos r2
    where r2.atividade_id = r.atividade_id
      and r2.executor_id = e.id
      and r2.categoria is not distinct from r.categoria
      and r2.perigo_id is not distinct from r.perigo_id
  );

-- 3. Tarefa vira catálogo neutro: sai função e recorrência ----------------------
alter table pessoal_atividades drop column if exists funcao_id;
alter table pessoal_atividades drop column if exists recorrencia;
alter table pessoal_atividades drop column if exists frequencia;

-- 4. Jornada de trabalho contratada (por funcionário, por dia da semana) --------
create table if not exists pessoal_funcionario_jornada (id uuid primary key default gen_random_uuid());
alter table pessoal_funcionario_jornada add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_funcionario_jornada add column if not exists funcionario_id uuid references usuarios(id);
alter table pessoal_funcionario_jornada add column if not exists dia_semana smallint; -- 0=domingo … 6=sábado
alter table pessoal_funcionario_jornada add column if not exists hora_inicio time;
alter table pessoal_funcionario_jornada add column if not exists hora_fim time;
alter table pessoal_funcionario_jornada add column if not exists created_at timestamptz not null default now();
alter table pessoal_funcionario_jornada add column if not exists updated_at timestamptz;
create unique index if not exists ux_pessoal_jornada_dia
  on pessoal_funcionario_jornada (emp_proprietaria_id, funcionario_id, dia_semana);
create index if not exists idx_pessoal_jornada_func
  on pessoal_funcionario_jornada (funcionario_id);

-- 5. Grupo Homogêneo de Exposição (GHE) -----------------------------------------
create table if not exists pessoal_ghe (id uuid primary key default gen_random_uuid());
alter table pessoal_ghe add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_ghe add column if not exists nome text;
alter table pessoal_ghe add column if not exists descricao text;
alter table pessoal_ghe add column if not exists created_at timestamptz not null default now();
alter table pessoal_ghe add column if not exists updated_at timestamptz;
create index if not exists idx_pessoal_ghe_emp on pessoal_ghe (emp_proprietaria_id);

create table if not exists pessoal_ghe_membros (id uuid primary key default gen_random_uuid());
alter table pessoal_ghe_membros add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_ghe_membros add column if not exists ghe_id uuid references pessoal_ghe(id) on delete cascade;
alter table pessoal_ghe_membros add column if not exists funcionario_id uuid references usuarios(id);
alter table pessoal_ghe_membros add column if not exists created_at timestamptz not null default now();
create unique index if not exists ux_pessoal_ghe_membro
  on pessoal_ghe_membros (ghe_id, funcionario_id);
create index if not exists idx_pessoal_ghe_membros_func
  on pessoal_ghe_membros (funcionario_id);

-- 6. RLS por tenant (inline — mesmo padrão de pessoal-atribuicoes-sst.sql) ------
-- pessoal_funcionario_jornada
alter table pessoal_funcionario_jornada enable row level security;
drop policy if exists tenant_isolation on pessoal_funcionario_jornada;
create policy tenant_isolation on pessoal_funcionario_jornada for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on pessoal_funcionario_jornada to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_funcionario_jornada;
create trigger set_emp_from_jwt before insert on pessoal_funcionario_jornada
  for each row execute function public.set_emp_from_jwt();

-- pessoal_ghe
alter table pessoal_ghe enable row level security;
drop policy if exists tenant_isolation on pessoal_ghe;
create policy tenant_isolation on pessoal_ghe for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on pessoal_ghe to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_ghe;
create trigger set_emp_from_jwt before insert on pessoal_ghe
  for each row execute function public.set_emp_from_jwt();

-- pessoal_ghe_membros
alter table pessoal_ghe_membros enable row level security;
drop policy if exists tenant_isolation on pessoal_ghe_membros;
create policy tenant_isolation on pessoal_ghe_membros for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on pessoal_ghe_membros to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_ghe_membros;
create trigger set_emp_from_jwt before insert on pessoal_ghe_membros
  for each row execute function public.set_emp_from_jwt();
