-- Confluir — Veículos: horário de saída e entrada + situação atual da frota (2026-09-13)
--
-- 1. HORÁRIO. `data_retirada`/`data_devolucao` são DATE (o horário do Bubble se
--    perdeu na migração). As colunas novas guardam o instante; as de data
--    continuam, porque filtros e indicadores trabalham por dia. O horário das
--    movimentações antigas vem do Bubble pelo scripts/migrar-veiculos-bubble.mjs.
--
-- 2. SITUAÇÃO ATUAL. A view `veiculos_ultima_movimentacao` traz a movimentação
--    mais recente de cada veículo: aberta = em uso (desde a saída); fechada =
--    disponível na sede da entrada (desde a entrada). Assim as 221 saídas
--    antigas nunca fechadas no Bubble não contam, e as saídas registradas no
--    Bubble enquanto ele segue em uso contam.
--
-- 3. `manutencao_desde` / `inativo_desde` em veiculos: quando a situação começou.
--
-- Idempotente. Executar no SQL Editor do Supabase.

alter table veiculos_disponibilidade
  add column if not exists retirada_em timestamptz,
  add column if not exists devolucao_em timestamptz;

alter table veiculos
  add column if not exists manutencao_desde timestamptz,
  add column if not exists inativo_desde timestamptz;

-- Saídas e entradas do fluxo novo: o registro é feito na hora em que o veículo
-- passa pela portaria, então o carimbo do registro é o horário.
update veiculos_disponibilidade
set retirada_em = created_at
where retirada_em is null and registrado_por_id is not null;

update veiculos_disponibilidade
set devolucao_em = updated_at
where devolucao_em is null and registrado_por_id is not null and data_devolucao is not null;

create index if not exists idx_veiculos_disponibilidade_ultima
  on veiculos_disponibilidade (veiculo_id, data_retirada desc, retirada_em desc, created_at desc);

-- security_invoker: a view respeita o RLS por tenant de veiculos_disponibilidade.
create or replace view veiculos_ultima_movimentacao
with (security_invoker = true) as
select distinct on (veiculo_id)
  id, veiculo_id, emp_proprietaria_id, condutor_id, destino, motivo,
  data_retirada, retirada_em, sede_retirada, sede_retirada_os, hodometro_retirada,
  data_devolucao, devolucao_em, sede_devolucao, sede_devolucao_os, hodometro_devolucao,
  previsao_retorno, registrado_por_id, created_at
from veiculos_disponibilidade
where veiculo_id is not null
order by veiculo_id, data_retirada desc nulls last, retirada_em desc nulls last, created_at desc;

grant select on veiculos_ultima_movimentacao to authenticated;

notify pgrst, 'reload schema';
