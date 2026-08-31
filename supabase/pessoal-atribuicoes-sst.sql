-- Confluir — Pessoal › Atribuições / SST (2026-08-30)
--
-- Cria o schema da nova área "Atribuições" do módulo Pessoal: catálogo de
-- TAREFAS (atividades) com a árvore SST completa (recorrência, presença física,
-- ferramentas, perigos, riscos ocupacionais + residual, medidas = treinamento e
-- EPI), executores por funcionário (com tempo médio/mês), FUNÇÕES com plano de
-- cargos (tarefas esperadas do cargo) e vínculo funcionário↔função.
--
-- IMPORTANTE: 7 tabelas já existiam como STUBS (só id + emp_proprietaria_id, e
-- em alguns casos algumas colunas soltas) — reservadas no RLS mas sem schema
-- real. Por isso este script é DEFENSIVO: cria o mínimo e adiciona cada coluna
-- com "add column if not exists", funcionando qualquer que seja o estado atual.
--
-- Sem funções auxiliares (o RLS é aplicado inline por tabela, padrão noticias.sql)
-- para não depender de dollar-quoting aninhado. Idempotente — pode rodar de novo.
-- Executar UMA VEZ no SQL Editor do Supabase.

-- 1. Funções (cargo SST) ------------------------------------------------------
create table if not exists pessoal_funcoes (id uuid primary key default gen_random_uuid());
alter table pessoal_funcoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_funcoes add column if not exists nome text;
alter table pessoal_funcoes add column if not exists descricao text;
alter table pessoal_funcoes add column if not exists ativo boolean not null default true;
alter table pessoal_funcoes add column if not exists created_at timestamptz not null default now();
alter table pessoal_funcoes add column if not exists updated_at timestamptz;
create index if not exists idx_pessoal_funcoes_emp on pessoal_funcoes (emp_proprietaria_id);

-- 2. Vínculo funcionário↔função ----------------------------------------------
create table if not exists pessoal_funcionario_funcao (id uuid primary key default gen_random_uuid());
alter table pessoal_funcionario_funcao add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_funcionario_funcao add column if not exists funcionario_id uuid references usuarios(id);
alter table pessoal_funcionario_funcao add column if not exists funcao_id uuid references pessoal_funcoes(id) on delete cascade;
alter table pessoal_funcionario_funcao add column if not exists created_at timestamptz not null default now();
create unique index if not exists ux_pessoal_func_funcao_pessoa
  on pessoal_funcionario_funcao (emp_proprietaria_id, funcionario_id);
create index if not exists idx_pessoal_func_funcao_funcao on pessoal_funcionario_funcao (funcao_id);

-- 3. Atividades (tarefas) — itens 1,2,4 ---------------------------------------
create table if not exists pessoal_atividades (id uuid primary key default gen_random_uuid());
alter table pessoal_atividades add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_atividades add column if not exists funcao_id uuid references pessoal_funcoes(id) on delete set null;
alter table pessoal_atividades add column if not exists nome text;
alter table pessoal_atividades add column if not exists descricao text;
alter table pessoal_atividades add column if not exists recorrencia text;      -- rotineira | nao_rotineira
alter table pessoal_atividades add column if not exists frequencia text;
alter table pessoal_atividades add column if not exists presenca text;         -- presencial | remota | hibrida
alter table pessoal_atividades add column if not exists avaliada_em date;
alter table pessoal_atividades add column if not exists observacoes text;
alter table pessoal_atividades add column if not exists created_at timestamptz not null default now();
alter table pessoal_atividades add column if not exists updated_at timestamptz;
create index if not exists idx_pessoal_atividades_emp on pessoal_atividades (emp_proprietaria_id);
create index if not exists idx_pessoal_atividades_funcao on pessoal_atividades (funcao_id);

-- 4. Executores — item 3 (tempo médio/mês por FUNCIONÁRIO) ---------------------
create table if not exists pessoal_atividades_executores (id uuid primary key default gen_random_uuid());
alter table pessoal_atividades_executores add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_atividades_executores add column if not exists atividade_id uuid;
alter table pessoal_atividades_executores add column if not exists funcionario_id uuid references usuarios(id);
alter table pessoal_atividades_executores add column if not exists tempo_min_mes integer;
alter table pessoal_atividades_executores add column if not exists avaliado_em date;
alter table pessoal_atividades_executores add column if not exists created_at timestamptz not null default now();
alter table pessoal_atividades_executores add column if not exists updated_at timestamptz;
create unique index if not exists ux_pessoal_ativ_exec_par
  on pessoal_atividades_executores (atividade_id, funcionario_id);
create index if not exists idx_pessoal_ativ_exec_func on pessoal_atividades_executores (funcionario_id);

-- 5. Plano de cargos — item 5 (tarefas esperadas da FUNÇÃO) --------------------
create table if not exists pessoal_atribuicoes_cargo (id uuid primary key default gen_random_uuid());
alter table pessoal_atribuicoes_cargo add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_atribuicoes_cargo add column if not exists funcao_id uuid references pessoal_funcoes(id) on delete cascade;
alter table pessoal_atribuicoes_cargo add column if not exists descricao text;
alter table pessoal_atribuicoes_cargo add column if not exists atividade_id uuid;
alter table pessoal_atribuicoes_cargo add column if not exists created_at timestamptz not null default now();
create index if not exists idx_pessoal_atrib_cargo_funcao on pessoal_atribuicoes_cargo (funcao_id);

-- 6. Ferramentas e equipamentos — item 6 --------------------------------------
create table if not exists pessoal_atividades_ferramentas (id uuid primary key default gen_random_uuid());
alter table pessoal_atividades_ferramentas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_atividades_ferramentas add column if not exists atividade_id uuid;
alter table pessoal_atividades_ferramentas add column if not exists nome text;
alter table pessoal_atividades_ferramentas add column if not exists tipo text;
alter table pessoal_atividades_ferramentas add column if not exists created_at timestamptz not null default now();
create index if not exists idx_pessoal_ativ_ferr_ativ on pessoal_atividades_ferramentas (atividade_id);

-- 7. Perigos associados — item 7 ----------------------------------------------
create table if not exists pessoal_atividades_perigos (id uuid primary key default gen_random_uuid());
alter table pessoal_atividades_perigos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_atividades_perigos add column if not exists atividade_id uuid;
alter table pessoal_atividades_perigos add column if not exists descricao text;
alter table pessoal_atividades_perigos add column if not exists fonte text;
alter table pessoal_atividades_perigos add column if not exists severidade integer;
alter table pessoal_atividades_perigos add column if not exists norma text;
alter table pessoal_atividades_perigos add column if not exists created_at timestamptz not null default now();
create index if not exists idx_pessoal_ativ_perigos_ativ on pessoal_atividades_perigos (atividade_id);

-- 8. Riscos ocupacionais + residual — itens 8 e 10 ----------------------------
create table if not exists pessoal_atividades_riscos (id uuid primary key default gen_random_uuid());
alter table pessoal_atividades_riscos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_atividades_riscos add column if not exists atividade_id uuid;
alter table pessoal_atividades_riscos add column if not exists perigo_id uuid references pessoal_atividades_perigos(id) on delete set null;
alter table pessoal_atividades_riscos add column if not exists categoria text;  -- acidente|fisico|quimico|biologico|ergonomico|psicossocial
alter table pessoal_atividades_riscos add column if not exists probabilidade integer;
alter table pessoal_atividades_riscos add column if not exists severidade integer;
alter table pessoal_atividades_riscos add column if not exists probabilidade_residual integer;
alter table pessoal_atividades_riscos add column if not exists severidade_residual integer;
alter table pessoal_atividades_riscos add column if not exists observacao text;
alter table pessoal_atividades_riscos add column if not exists created_at timestamptz not null default now();
create index if not exists idx_pessoal_ativ_riscos_ativ on pessoal_atividades_riscos (atividade_id);

-- 9. Medidas (treinamento + EPI) — item 9 -------------------------------------
create table if not exists pessoal_atividade_medidas_seguranca (id uuid primary key default gen_random_uuid());
alter table pessoal_atividade_medidas_seguranca add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_atividade_medidas_seguranca add column if not exists atividade_id uuid;
alter table pessoal_atividade_medidas_seguranca add column if not exists tipo text;         -- treinamento | epi
alter table pessoal_atividade_medidas_seguranca add column if not exists descricao text;
alter table pessoal_atividade_medidas_seguranca add column if not exists treinamento_id uuid references pessoal_treinamentos(id) on delete set null;
alter table pessoal_atividade_medidas_seguranca add column if not exists recorrencia_meses integer;
alter table pessoal_atividade_medidas_seguranca add column if not exists epi_ca text;
alter table pessoal_atividade_medidas_seguranca add column if not exists risco_id uuid references pessoal_atividades_riscos(id) on delete set null;
alter table pessoal_atividade_medidas_seguranca add column if not exists created_at timestamptz not null default now();
create index if not exists idx_pessoal_ativ_medidas_ativ on pessoal_atividade_medidas_seguranca (atividade_id);

-- 9b. Stubs antigos podem ter colunas NOT NULL que o app não preenche. Como a
--     validação de obrigatoriedade é feita na APLICAÇÃO, tornamos nuláveis todas
--     as colunas pré-existentes (exceto id/created_at/ativo, que têm default).
do $$
declare r record;
begin
  for r in
    select table_name, column_name
    from information_schema.columns
    where table_schema = 'public'
      and table_name in (
        'pessoal_funcoes','pessoal_funcionario_funcao','pessoal_atividades',
        'pessoal_atividades_executores','pessoal_atribuicoes_cargo',
        'pessoal_atividades_ferramentas','pessoal_atividades_perigos',
        'pessoal_atividades_riscos','pessoal_atividade_medidas_seguranca')
      and is_nullable = 'NO'
      and column_name not in ('id','created_at','ativo')
  loop
    execute format('alter table %I alter column %I drop not null', r.table_name, r.column_name);
  end loop;
end $$;

-- 9c. Cascade de exclusão: as tabelas-stub que já tinham `atividade_id` vieram
--     com FK SEM "on delete cascade" (add-column-if-not-exists não recria FK de
--     coluna existente). Aqui removemos qualquer FK de atividade_id e recriamos
--     com ON DELETE CASCADE, para excluir a tarefa apagar sua árvore SST.
do $$
declare r record;
begin
  for r in
    select tc.table_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and kcu.column_name = 'atividade_id'
      and tc.table_name in (
        'pessoal_atividades_executores','pessoal_atividades_perigos',
        'pessoal_atividades_ferramentas','pessoal_atividades_riscos',
        'pessoal_atividade_medidas_seguranca','pessoal_atribuicoes_cargo')
  loop
    execute format('alter table %I drop constraint %I', r.table_name, r.constraint_name);
  end loop;
end $$;

alter table pessoal_atividades_executores
  add constraint pessoal_atividades_executores_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atividades_perigos
  add constraint pessoal_atividades_perigos_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atividades_ferramentas
  add constraint pessoal_atividades_ferramentas_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atividades_riscos
  add constraint pessoal_atividades_riscos_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atividade_medidas_seguranca
  add constraint pessoal_atividade_medidas_seguranca_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atribuicoes_cargo
  add constraint pessoal_atribuicoes_cargo_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete set null;

-- 10. RLS por tenant (inline por tabela — mesmo padrão de noticias.sql) --------
-- pessoal_funcoes
alter table pessoal_funcoes enable row level security;
drop policy if exists tenant_isolation on pessoal_funcoes;
create policy tenant_isolation on pessoal_funcoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_funcoes to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_funcoes;
create trigger set_emp_from_jwt before insert on pessoal_funcoes
  for each row execute function public.set_emp_from_jwt();

-- pessoal_funcionario_funcao
alter table pessoal_funcionario_funcao enable row level security;
drop policy if exists tenant_isolation on pessoal_funcionario_funcao;
create policy tenant_isolation on pessoal_funcionario_funcao for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_funcionario_funcao to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_funcionario_funcao;
create trigger set_emp_from_jwt before insert on pessoal_funcionario_funcao
  for each row execute function public.set_emp_from_jwt();

-- pessoal_atividades
alter table pessoal_atividades enable row level security;
drop policy if exists tenant_isolation on pessoal_atividades;
create policy tenant_isolation on pessoal_atividades for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_atividades to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_atividades;
create trigger set_emp_from_jwt before insert on pessoal_atividades
  for each row execute function public.set_emp_from_jwt();

-- pessoal_atividades_executores
alter table pessoal_atividades_executores enable row level security;
drop policy if exists tenant_isolation on pessoal_atividades_executores;
create policy tenant_isolation on pessoal_atividades_executores for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_atividades_executores to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_atividades_executores;
create trigger set_emp_from_jwt before insert on pessoal_atividades_executores
  for each row execute function public.set_emp_from_jwt();

-- pessoal_atribuicoes_cargo
alter table pessoal_atribuicoes_cargo enable row level security;
drop policy if exists tenant_isolation on pessoal_atribuicoes_cargo;
create policy tenant_isolation on pessoal_atribuicoes_cargo for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_atribuicoes_cargo to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_atribuicoes_cargo;
create trigger set_emp_from_jwt before insert on pessoal_atribuicoes_cargo
  for each row execute function public.set_emp_from_jwt();

-- pessoal_atividades_ferramentas
alter table pessoal_atividades_ferramentas enable row level security;
drop policy if exists tenant_isolation on pessoal_atividades_ferramentas;
create policy tenant_isolation on pessoal_atividades_ferramentas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_atividades_ferramentas to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_atividades_ferramentas;
create trigger set_emp_from_jwt before insert on pessoal_atividades_ferramentas
  for each row execute function public.set_emp_from_jwt();

-- pessoal_atividades_perigos
alter table pessoal_atividades_perigos enable row level security;
drop policy if exists tenant_isolation on pessoal_atividades_perigos;
create policy tenant_isolation on pessoal_atividades_perigos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_atividades_perigos to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_atividades_perigos;
create trigger set_emp_from_jwt before insert on pessoal_atividades_perigos
  for each row execute function public.set_emp_from_jwt();

-- pessoal_atividades_riscos
alter table pessoal_atividades_riscos enable row level security;
drop policy if exists tenant_isolation on pessoal_atividades_riscos;
create policy tenant_isolation on pessoal_atividades_riscos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_atividades_riscos to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_atividades_riscos;
create trigger set_emp_from_jwt before insert on pessoal_atividades_riscos
  for each row execute function public.set_emp_from_jwt();

-- pessoal_atividade_medidas_seguranca
alter table pessoal_atividade_medidas_seguranca enable row level security;
drop policy if exists tenant_isolation on pessoal_atividade_medidas_seguranca;
create policy tenant_isolation on pessoal_atividade_medidas_seguranca for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant insert, update, delete on pessoal_atividade_medidas_seguranca to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_atividade_medidas_seguranca;
create trigger set_emp_from_jwt before insert on pessoal_atividade_medidas_seguranca
  for each row execute function public.set_emp_from_jwt();

-- 11. Configuração do limiar de recorrência (por tenant) ----------------------
-- Frequências AO MENOS tão frequentes quanto esta sugerem "rotineira".
alter table empresa
  add column if not exists sst_rotina_frequencia text not null default 'mensal';
