-- Confluir — Pessoal: marcos de acerto do banco de horas (27/11/2026)
--
-- POR QUÊ: o banco de horas é zerado em certos meses (pago em folha,
-- compensado em folga, vencido pelo prazo de compensação do art. 59 da CLT,
-- rescisão, acordo coletivo), de uma pessoa, de algumas ou de todas. Hoje isso
-- só se faz editando números à mão, sem rastro de quanto foi zerado nem por
-- quê. Saldo negativo zerado é descontado em folha.
--
-- COMO (src/lib/ponto-acertos.ts calcula; src/lib/db/ponto-acertos.ts grava):
--   pessoal_ponto_acertos ........ o marco: mês, faixas zeradas, motivo,
--                                  observação e alcance (individual, parcial
--                                  ou em massa)
--   pessoal_ponto_acerto_itens ... quem foi zerado e quanto (o saldo de cada
--                                  faixa no fechamento do mês do acerto)
--   pessoal_folha_config ......... acerto recorrente da entidade: os meses
--                                  (o ACT pode fixá-los), as faixas e o motivo
-- A remessa seguinte ao mês do acerto começa com saldo anterior zero nas
-- faixas zeradas (lib/db/ponto-cascata e saldosAnterioresPonto).
-- RLS tenant_isolation, set_emp_from_jwt e auditoria. Idempotente.

create table if not exists public.pessoal_ponto_acertos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  competencia text not null,
  faixas text not null default 'ambas',
  motivo text not null,
  observacao text,
  alcance text not null default 'parcial',
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_ponto_acertos_competencia_check check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint pessoal_ponto_acertos_faixas_check check (faixas in ('ambas', 'faixa1', 'faixa2')),
  constraint pessoal_ponto_acertos_motivo_check check (motivo in ('pago', 'compensado', 'vencido', 'rescisao', 'acordo', 'outro')),
  constraint pessoal_ponto_acertos_alcance_check check (alcance in ('individual', 'parcial', 'massa'))
);

create index if not exists pessoal_ponto_acertos_emp_idx on public.pessoal_ponto_acertos (emp_proprietaria_id, competencia);

create table if not exists public.pessoal_ponto_acerto_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  acerto_id uuid not null references public.pessoal_ponto_acertos(id) on delete cascade,
  funcionario_id uuid not null references public.usuarios(id),
  competencia text not null,
  saldo_70 numeric(8,2),
  saldo_100 numeric(8,2),
  created_at timestamptz not null default now(),
  constraint pessoal_ponto_acerto_itens_unica unique (acerto_id, funcionario_id),
  -- Um acerto por pessoa e mês.
  constraint pessoal_ponto_acerto_itens_mes_unico unique (funcionario_id, competencia)
);

create index if not exists pessoal_ponto_acerto_itens_func_idx on public.pessoal_ponto_acerto_itens (emp_proprietaria_id, funcionario_id);

do $$
declare t text;
begin
  foreach t in array array['pessoal_ponto_acertos', 'pessoal_ponto_acerto_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I to authenticated
         using (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)
         with check (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('drop trigger if exists auditoria_registrar on public.%I', t);
    execute format('create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- Acerto recorrente (por entidade).
alter table public.pessoal_folha_config add column if not exists acerto_meses smallint[];
alter table public.pessoal_folha_config add column if not exists acerto_faixas text not null default 'ambas';
alter table public.pessoal_folha_config add column if not exists acerto_motivo text not null default 'compensado';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pessoal_folha_config_acerto_faixas_check') then
    alter table public.pessoal_folha_config
      add constraint pessoal_folha_config_acerto_faixas_check check (acerto_faixas in ('ambas', 'faixa1', 'faixa2'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pessoal_folha_config_acerto_motivo_check') then
    alter table public.pessoal_folha_config
      add constraint pessoal_folha_config_acerto_motivo_check check (acerto_motivo in ('pago', 'compensado', 'vencido', 'rescisao', 'acordo', 'outro'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pessoal_folha_config_acerto_meses_check') then
    alter table public.pessoal_folha_config
      add constraint pessoal_folha_config_acerto_meses_check check (acerto_meses is null or acerto_meses <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[]);
  end if;
end $$;

comment on table public.pessoal_ponto_acertos is 'Marco de acerto do banco de horas: no fechamento do mês, o saldo das pessoas do acerto é zerado (pago, compensado, vencido, rescisão, acordo). Saldo negativo zerado é descontado em folha. [lgpd:trabalhista|titulares:funcionarios]';
comment on column public.pessoal_ponto_acertos.competencia is 'Mês do acerto (AAAA-MM): o saldo no fechamento dele é zerado; a remessa seguinte começa do zero.';
comment on column public.pessoal_ponto_acertos.faixas is 'Faixas zeradas: ambas, faixa1 (colunas *_70) ou faixa2 (colunas *_100).';
comment on column public.pessoal_ponto_acertos.motivo is 'pago (em folha), compensado (em folga), vencido (prazo de compensação), rescisao, acordo ou outro.';
comment on column public.pessoal_ponto_acertos.observacao is 'Explicação do acerto (cláusula do ACT, acordo individual).';
comment on column public.pessoal_ponto_acertos.alcance is 'individual, parcial (algumas pessoas) ou massa (todos).';
comment on column public.pessoal_ponto_acertos.criado_por is 'Quem lançou o acerto. [lgpd:identificacao]';
comment on table public.pessoal_ponto_acerto_itens is 'Quem foi zerado num acerto do banco de horas e quanto. [lgpd:trabalhista|titulares:funcionarios]';
comment on column public.pessoal_ponto_acerto_itens.acerto_id is 'Acerto a que pertence.';
comment on column public.pessoal_ponto_acerto_itens.funcionario_id is 'Funcionário zerado. [lgpd:identificacao]';
comment on column public.pessoal_ponto_acerto_itens.competencia is 'Mês do acerto (cópia, para impedir dois acertos da mesma pessoa no mesmo mês).';
comment on column public.pessoal_ponto_acerto_itens.saldo_70 is 'Saldo da faixa 1 zerado (negativo = horas a descontar). Null = faixa não zerada. [lgpd:trabalhista]';
comment on column public.pessoal_ponto_acerto_itens.saldo_100 is 'Saldo da faixa 2 zerado (negativo = horas a descontar). Null = faixa não zerada. [lgpd:trabalhista]';
comment on column public.pessoal_folha_config.acerto_meses is 'Meses (1 a 12) em que a entidade zera o banco de horas (o ACT pode fixá-los); a caixa de entrada lembra. Vazio = sem acerto recorrente.';
comment on column public.pessoal_folha_config.acerto_faixas is 'Acerto recorrente: faixas zeradas (ambas, faixa1, faixa2).';
comment on column public.pessoal_folha_config.acerto_motivo is 'Acerto recorrente: motivo padrão.';
