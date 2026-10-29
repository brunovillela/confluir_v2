-- Confluir — Veículos: histórico de veículos do contrato de locação (29/10/2026)
--
-- POR QUÊ: ao finalizar um contrato de locação, os veículos sumiam dele. O
-- veículo só guarda o contrato ATUAL (`veiculos.contrato_aluguel_id`), e o
-- "Finalizar" zera esse campo — o contrato finalizado ficava sem nenhum carro.
-- Os 180 contratos da entidade estão finalizados e nenhum mostrava veículo,
-- embora 165 tenham o vínculo registrado na tabela que veio do Bubble
-- (`veiculo_contrato_aluguel_vinculo`, 172 vínculos com início, término e
-- franquia de km) — tabela que o Confluir nunca usou e que, sem a coluna do
-- tenant nem policy, a aplicação não conseguia ler.
--
-- COMO: a tabela de vínculos vira o HISTÓRICO do contrato. Vincular abre um
-- vínculo; desvincular o fecha como desvinculado; finalizar fecha o período e
-- MANTÉM o veículo no contrato. `veiculos.contrato_aluguel_id` segue sendo só
-- o contrato atual.
--  1. Coluna `emp_proprietaria_id` (preenchida pelo contrato), gatilho
--     set_emp_from_jwt e policy por tenant — como as demais tabelas da frota.
--  2. Tira o acesso do `anon` (a linha de base tinha GRANT ALL).
--  3. Índices por contrato e por veículo.
-- Idempotente.

alter table public.veiculo_contrato_aluguel_vinculo
  add column if not exists emp_proprietaria_id uuid references public.empresa(id);

update public.veiculo_contrato_aluguel_vinculo v
set emp_proprietaria_id = c.emp_proprietaria_id
from public.veiculo_contratos_aluguel c
where c.id = v.contrato_id
  and v.emp_proprietaria_id is null;

drop trigger if exists set_emp_from_jwt on public.veiculo_contrato_aluguel_vinculo;
create trigger set_emp_from_jwt before insert on public.veiculo_contrato_aluguel_vinculo
  for each row execute function public.set_emp_from_jwt();

alter table public.veiculo_contrato_aluguel_vinculo enable row level security;
drop policy if exists tenant_isolation on public.veiculo_contrato_aluguel_vinculo;
create policy tenant_isolation on public.veiculo_contrato_aluguel_vinculo to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

revoke all on table public.veiculo_contrato_aluguel_vinculo from anon;
grant select, insert, update on table public.veiculo_contrato_aluguel_vinculo to authenticated;
grant all on table public.veiculo_contrato_aluguel_vinculo to service_role;

create index if not exists idx_veiculo_contrato_aluguel_vinculo_contrato
  on public.veiculo_contrato_aluguel_vinculo (contrato_id, inicio);
create index if not exists idx_veiculo_contrato_aluguel_vinculo_veiculo
  on public.veiculo_contrato_aluguel_vinculo (veiculo_id, inicio);

comment on table public.veiculo_contrato_aluguel_vinculo is 'Histórico dos veículos de cada contrato de locação: um vínculo por período em que o veículo esteve no contrato (início, término, franquia de km). Finalizar o contrato fecha o período e mantém o veículo no histórico; desvincular antes do fim marca desvinculado. Origem Bubble; usado pela tela do contrato desde 29/10/2026. [lgpd:nenhum]';
comment on column public.veiculo_contrato_aluguel_vinculo.emp_proprietaria_id is 'Entidade dona (tenant), herdada do contrato. [lgpd:nenhum]';
comment on column public.veiculo_contrato_aluguel_vinculo.inicio is 'Quando o veículo entrou no contrato. [lgpd:nenhum]';
comment on column public.veiculo_contrato_aluguel_vinculo.termino is 'Quando saiu (desvinculado ou contrato finalizado); nulo = segue no contrato. [lgpd:nenhum]';
comment on column public.veiculo_contrato_aluguel_vinculo.desvinculado is 'true = tirado do contrato antes do fim; false com término = ficou até a finalização. [lgpd:nenhum]';
comment on column public.veiculo_contrato_aluguel_vinculo.km_mensal_franquia is 'Km mensal incluído no aluguel. [lgpd:nenhum]';
