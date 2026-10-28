-- Confluir — Veículos: histórico do contrato de locação (28/10/2026)
--
-- POR QUÊ: o contrato de locação não podia ser corrigido nem prorrogado depois
-- de registrado; só finalizado. Uma locação de poucos dias prorrogada no mesmo
-- mês ficava sem como estender a vigência, e a cobrança dos dias extras
-- esbarrava na regra "Contrato fora da vigência". A edição e a prorrogação
-- passam a existir, e cada uma precisa deixar rastro: quem, quando, o antes e
-- o depois, e o aditivo assinado, quando houver.
--
-- COMO:
--  1. `veiculos_contratos_historico`: uma linha por evento ('editado' ou
--     'prorrogado') com motivo, campos antes/depois (jsonb) e o caminho do
--     aditivo no bucket `veiculos`.
--  2. RLS por tenant + gatilho set_emp_from_jwt, como a trilha das infrações
--     (`veiculos_infracoes_historico`).
-- Idempotente.

create table if not exists public.veiculos_contratos_historico (
  id uuid primary key default gen_random_uuid(),
  contrato_id uuid not null references public.veiculo_contratos_aluguel(id) on delete cascade,
  evento text not null check (evento in ('editado', 'prorrogado')),
  usuario_id uuid references public.usuarios(id),
  motivo text,
  antes jsonb,
  depois jsonb,
  arquivo_aditivo_url text,
  created_at timestamptz not null default now(),
  emp_proprietaria_id uuid references public.empresa(id)
);

create index if not exists idx_veiculos_contratos_historico
  on public.veiculos_contratos_historico (contrato_id, created_at);

alter table public.veiculos_contratos_historico enable row level security;
drop policy if exists tenant_isolation on public.veiculos_contratos_historico;
create policy tenant_isolation on public.veiculos_contratos_historico to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.veiculos_contratos_historico;
create trigger set_emp_from_jwt before insert on public.veiculos_contratos_historico
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.veiculos_contratos_historico from public, anon;
grant select, insert on table public.veiculos_contratos_historico to authenticated;
grant all on table public.veiculos_contratos_historico to service_role;

comment on table public.veiculos_contratos_historico is 'Trilha do contrato de locação de veículos: edições e prorrogações, com quem fez, motivo, antes/depois e o aditivo. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.veiculos_contratos_historico.contrato_id is 'Contrato de locação (veiculo_contratos_aluguel). [lgpd:nenhum]';
comment on column public.veiculos_contratos_historico.evento is 'editado: correção dos dados cadastrais; prorrogado: novo término (e, se mudou, novo valor mensal). [lgpd:nenhum]';
comment on column public.veiculos_contratos_historico.usuario_id is 'Quem fez a alteração. [lgpd:identificacao]';
comment on column public.veiculos_contratos_historico.motivo is 'Motivo informado (obrigatório na edição; opcional na prorrogação). [lgpd:nenhum]';
comment on column public.veiculos_contratos_historico.antes is 'Valores das colunas alteradas antes da mudança. [lgpd:nenhum]';
comment on column public.veiculos_contratos_historico.depois is 'Valores das colunas alteradas depois da mudança. [lgpd:nenhum]';
comment on column public.veiculos_contratos_historico.arquivo_aditivo_url is 'Caminho do aditivo assinado no bucket veiculos (prorrogação). [lgpd:nenhum]';
comment on column public.veiculos_contratos_historico.created_at is 'Quando a alteração foi feita. [lgpd:nenhum]';
comment on column public.veiculos_contratos_historico.emp_proprietaria_id is 'Entidade dona (tenant). [lgpd:nenhum]';
