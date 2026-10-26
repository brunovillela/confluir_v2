-- Confluir — Controle de ponto: isenção de registro (26/10/2026)
--
-- POR QUÊ: há funcionários que não registram ponto por um período (cargo de
-- confiança, afastamento longo, teletrabalho por produção…). Sem registro da
-- isenção, eles aparecem todo mês como pendentes na remessa de ponto.
--
-- COMO: uma linha por isenção, com funcionário, período (início e, se houver,
-- fim) e justificativa. As linhas não são apagadas ao encerrar: o fim é
-- preenchido e o histórico fica. Quem estiver isento no mês inteiro da remessa
-- sai da lista de "ativos sem registro" (src/lib/db/ponto-isencoes.ts).
-- Idempotente.

create table if not exists public.pessoal_ponto_isencoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  funcionario_id uuid not null references public.usuarios(id),
  inicio date not null,
  fim date,
  justificativa text not null,
  registrado_por uuid references public.usuarios(id),
  encerrado_por uuid references public.usuarios(id),
  encerrado_em timestamptz,
  created_at timestamptz not null default now(),
  constraint pessoal_ponto_isencoes_periodo check (fim is null or fim >= inicio),
  constraint pessoal_ponto_isencoes_justificativa check (length(btrim(justificativa)) > 0)
);

create index if not exists pessoal_ponto_isencoes_funcionario_idx
  on public.pessoal_ponto_isencoes (emp_proprietaria_id, funcionario_id, inicio desc);

alter table public.pessoal_ponto_isencoes enable row level security;
drop policy if exists tenant_isolation on public.pessoal_ponto_isencoes;
create policy tenant_isolation on public.pessoal_ponto_isencoes to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

drop trigger if exists set_emp_from_jwt on public.pessoal_ponto_isencoes;
create trigger set_emp_from_jwt before insert on public.pessoal_ponto_isencoes
  for each row execute function public.set_emp_from_jwt();

revoke all on table public.pessoal_ponto_isencoes from public, anon;
grant select, insert, update, delete on table public.pessoal_ponto_isencoes to authenticated;
grant all on table public.pessoal_ponto_isencoes to service_role;

comment on table public.pessoal_ponto_isencoes is 'Isenções de registro de ponto: funcionário, período e justificativa; quem está isento no mês da remessa não aparece como pendente (src/lib/db/ponto-isencoes.ts). [lgpd:identificacao,trabalhista|titulares:funcionários]';
comment on column public.pessoal_ponto_isencoes.id is 'Identificador da isenção.';
comment on column public.pessoal_ponto_isencoes.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_ponto_isencoes.funcionario_id is 'Funcionário isento (usuarios.id). [lgpd:identificacao]';
comment on column public.pessoal_ponto_isencoes.inicio is 'Primeiro dia da isenção.';
comment on column public.pessoal_ponto_isencoes.fim is 'Último dia da isenção; vazio = sem prazo definido.';
comment on column public.pessoal_ponto_isencoes.justificativa is 'Por que o funcionário não registra ponto no período. [lgpd:trabalhista]';
comment on column public.pessoal_ponto_isencoes.registrado_por is 'Quem registrou a isenção. [lgpd:identificacao]';
comment on column public.pessoal_ponto_isencoes.encerrado_por is 'Quem encerrou a isenção (preencheu o fim). [lgpd:identificacao]';
comment on column public.pessoal_ponto_isencoes.encerrado_em is 'Quando a isenção foi encerrada.';
comment on column public.pessoal_ponto_isencoes.created_at is 'Criação do registro.';
