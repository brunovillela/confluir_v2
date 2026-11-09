-- Confluir — jornadas de trabalho configuradas e vinculadas ao funcionário
--
-- POR QUÊ: a jornada ficava gravada em cada funcionário
-- (`pessoal_funcionario_jornada`, uma linha por dia da semana). Uma mudança
-- geral de horário (ex.: a entidade passa a abrir às 7h) obrigava a editar
-- funcionário por funcionário.
--
-- COMO: a jornada vira um cadastro da entidade (`pessoal_jornadas`, com os
-- horários de cada dia em `pessoal_jornada_dias`) e o funcionário aponta para
-- uma delas (`pessoal_jornada_funcionarios`, uma por funcionário). Alterar a
-- jornada altera de uma vez todos os vinculados.
--
-- DADOS: cada combinação distinta de horários já gravada vira uma jornada
-- ("Jornada 1 (40h00 por semana)"…), e os funcionários que a tinham ficam
-- vinculados a ela. Só roda se ainda não houver vínculo nenhum. A tabela
-- antiga fica como estava (legado, sem uso pelo sistema).
--
-- Auditoria: os triggers entram DEPOIS da carga, para a migração não aparecer
-- no movimento da folha como "Jornada de trabalho alterada". Idempotente.

create table if not exists public.pessoal_jornadas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists pessoal_jornadas_nome
  on public.pessoal_jornadas (emp_proprietaria_id, lower(trim(nome)));

create table if not exists public.pessoal_jornada_dias (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  jornada_id uuid not null references public.pessoal_jornadas(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  hora_inicio time not null,
  hora_fim time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_jornada_dias_horario check (hora_fim > hora_inicio)
);
create unique index if not exists pessoal_jornada_dias_dia
  on public.pessoal_jornada_dias (jornada_id, dia_semana);

create table if not exists public.pessoal_jornada_funcionarios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  funcionario_id uuid not null references public.usuarios(id) on delete cascade,
  jornada_id uuid not null references public.pessoal_jornadas(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists pessoal_jornada_funcionarios_um
  on public.pessoal_jornada_funcionarios (emp_proprietaria_id, funcionario_id);
create index if not exists pessoal_jornada_funcionarios_jornada
  on public.pessoal_jornada_funcionarios (jornada_id);

do $$
declare
  t text;
begin
  foreach t in array array['pessoal_jornadas', 'pessoal_jornada_dias', 'pessoal_jornada_funcionarios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I to authenticated
         using (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)
         with check (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- Carga: uma jornada por combinação distinta de horários, por entidade.
do $$
declare
  r record;
  jid uuid;
begin
  if exists (select 1 from public.pessoal_jornada_funcionarios) then
    return;
  end if;
  for r in
    with validos as (
      select emp_proprietaria_id as emp, funcionario_id, dia_semana, hora_inicio, hora_fim
        from public.pessoal_funcionario_jornada
       where emp_proprietaria_id is not null
         and funcionario_id is not null
         and dia_semana between 0 and 6
         and hora_inicio is not null
         and hora_fim is not null
         and hora_fim > hora_inicio
    ),
    assinatura as (
      select emp, funcionario_id,
             string_agg(dia_semana || '|' || hora_inicio || '|' || hora_fim, ',' order by dia_semana) as sig,
             sum(extract(epoch from (hora_fim - hora_inicio)) / 60)::int as minutos
        from validos
       group by emp, funcionario_id
    )
    select emp, sig, max(minutos) as minutos, array_agg(funcionario_id) as funcs,
           row_number() over (partition by emp order by count(*) desc, sig) as n
      from assinatura
     group by emp, sig
  loop
    insert into public.pessoal_jornadas (emp_proprietaria_id, nome, observacao)
    values (
      r.emp,
      format('Jornada %s (%sh%s por semana)', r.n, r.minutos / 60, lpad((r.minutos % 60)::text, 2, '0')),
      'Criada a partir das jornadas gravadas em cada funcionário (09/11/2026). Renomeie à vontade.'
    )
    returning id into jid;

    insert into public.pessoal_jornada_dias (emp_proprietaria_id, jornada_id, dia_semana, hora_inicio, hora_fim)
    select r.emp, jid, j.dia_semana, j.hora_inicio, j.hora_fim
      from public.pessoal_funcionario_jornada j
     where j.emp_proprietaria_id = r.emp
       and j.funcionario_id = r.funcs[1]
       and j.dia_semana between 0 and 6
       and j.hora_inicio is not null
       and j.hora_fim is not null
       and j.hora_fim > j.hora_inicio;

    insert into public.pessoal_jornada_funcionarios (emp_proprietaria_id, funcionario_id, jornada_id)
    select r.emp, f, jid from unnest(r.funcs) as f;
  end loop;
end $$;

-- Auditoria (alimenta o movimento da folha), só depois da carga.
drop trigger if exists auditoria_registrar on public.pessoal_jornada_dias;
create trigger auditoria_registrar after insert or update or delete on public.pessoal_jornada_dias
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria_registrar on public.pessoal_jornada_funcionarios;
create trigger auditoria_registrar after insert or update or delete on public.pessoal_jornada_funcionarios
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria_registrar on public.pessoal_jornadas;
create trigger auditoria_registrar after insert or update or delete on public.pessoal_jornadas
  for each row execute function public.registrar_auditoria();

comment on table public.pessoal_jornadas is 'Jornadas de trabalho da entidade (ex.: "Administrativo 8h–17h"): configuradas uma vez e vinculadas aos funcionários. Alterar a jornada altera todos os vinculados (09/11/2026). [lgpd:nenhum]';
comment on column public.pessoal_jornadas.nome is 'Nome da jornada, único na entidade. [lgpd:nenhum]';
comment on column public.pessoal_jornadas.observacao is 'Observação livre (ex.: cláusula do acordo que a define). [lgpd:nenhum]';
comment on table public.pessoal_jornada_dias is 'Horário de cada dia da semana de uma jornada (0=domingo … 6=sábado). Dia sem linha = sem expediente. [lgpd:nenhum]';
comment on table public.pessoal_jornada_funcionarios is 'Jornada de trabalho de cada funcionário (uma por funcionário). Alterações entram no movimento da folha. [lgpd:trabalhista|titulares:funcionários]';
comment on column public.pessoal_jornada_funcionarios.funcionario_id is 'Funcionário. [lgpd:identificacao]';
comment on column public.pessoal_jornada_funcionarios.jornada_id is 'Jornada a que está vinculado. [lgpd:trabalhista]';
comment on table public.pessoal_funcionario_jornada is 'LEGADO (até 09/11/2026): jornada gravada em cada funcionário, por dia da semana. Substituída por pessoal_jornadas + pessoal_jornada_funcionarios; o sistema não lê nem grava mais aqui. [lgpd:trabalhista|titulares:funcionários]';
