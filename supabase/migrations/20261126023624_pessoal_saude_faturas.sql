-- Confluir — Pessoal: fatura da operadora do plano de saúde (Fase 3, 25/11/2026)
--
-- POR QUÊ: depois de calcular o mês (Fase 1), falta conferir com o que a
-- operadora cobrou. A fatura chega em PDF ou planilha, com uma linha por
-- beneficiário (mensalidade, coparticipação, pró-rata, taxas). Hoje a
-- conferência é feita à mão, linha a linha.
--
-- COMO: a fatura é lida por IA (src/lib/db/plano-saude-fatura.ts); cada linha
-- é casada com um beneficiário (carteirinha, CPF ou nome) e gravada aqui, sem o
-- arquivo e sem CPF — só nome, carteirinha, valores e o beneficiário casado.
-- A tela compara com a conferência do mês (src/lib/plano-saude-fatura.ts) e
-- pode lançar a coparticipação da fatura em pessoal_saude_coparticipacoes.
-- Uma fatura por contrato e mês (ler de novo substitui). O procedimento da
-- coparticipação nunca é guardado (seria dado de saúde).
-- RLS tenant_isolation, set_emp_from_jwt e auditoria. Idempotente.

create table if not exists public.pessoal_saude_faturas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  contrato_id uuid not null references public.pessoal_saude_contratos(id) on delete cascade,
  competencia text not null,
  arquivo_nome text,
  total numeric(12,2),
  linhas jsonb not null default '[]'::jsonb,
  conferida_em timestamptz,
  conferida_por uuid references public.usuarios(id) on delete set null,
  observacao text,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_saude_faturas_competencia_check check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint pessoal_saude_faturas_linhas_check check (jsonb_typeof(linhas) = 'array'),
  constraint pessoal_saude_faturas_unica unique (contrato_id, competencia)
);

create index if not exists pessoal_saude_faturas_emp_idx on public.pessoal_saude_faturas (emp_proprietaria_id, competencia);

alter table public.pessoal_saude_faturas enable row level security;
drop policy if exists tenant_isolation on public.pessoal_saude_faturas;
create policy tenant_isolation on public.pessoal_saude_faturas to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.pessoal_saude_faturas;
create trigger set_emp_from_jwt before insert on public.pessoal_saude_faturas
  for each row execute function public.set_emp_from_jwt();
drop trigger if exists auditoria_registrar on public.pessoal_saude_faturas;
create trigger auditoria_registrar after insert or update or delete on public.pessoal_saude_faturas
  for each row execute function public.registrar_auditoria();
revoke all on table public.pessoal_saude_faturas from public, anon;
grant select, insert, update, delete on table public.pessoal_saude_faturas to authenticated;
grant all on table public.pessoal_saude_faturas to service_role;

comment on table public.pessoal_saude_faturas is 'Fatura da operadora do plano de saúde lida por IA, por contrato e mês, para conferir com o cálculo do sistema. Sem o arquivo e sem CPF. [lgpd:financeiro|titulares:funcionários, dependentes]';
comment on column public.pessoal_saude_faturas.contrato_id is 'Contrato de plano de saúde.';
comment on column public.pessoal_saude_faturas.competencia is 'Mês da fatura (AAAA-MM).';
comment on column public.pessoal_saude_faturas.arquivo_nome is 'Nome do arquivo lido (o arquivo não é guardado).';
comment on column public.pessoal_saude_faturas.total is 'Total cobrado na fatura.';
comment on column public.pessoal_saude_faturas.linhas is 'Linhas da fatura: nome, carteirinha, mensalidade, coparticipação (só o valor), outros valores e o beneficiário casado. [lgpd:identificacao,financeiro]';
comment on column public.pessoal_saude_faturas.conferida_em is 'Quando a fatura foi marcada como conferida.';
comment on column public.pessoal_saude_faturas.conferida_por is 'Quem marcou como conferida. [lgpd:identificacao]';
comment on column public.pessoal_saude_faturas.observacao is 'Observação de quem conferiu.';
comment on column public.pessoal_saude_faturas.criado_por is 'Quem enviou a fatura. [lgpd:identificacao]';
