-- Confluir — Abono pecuniário como PEDIDO do funcionário (2026-07-31)
--
-- A solicitação de férias (autosserviço) pode pedir a venda de 1/3 (abono
-- pecuniário). O pedido fica no gozo (abono_solicitado) e SÓ é aplicado ao
-- período (pessoal_ferias.abono_pecuniario) quando o gestor AUTORIZA o gozo.

alter table public.pessoal_ferias_gozo
  add column if not exists abono_solicitado boolean not null default false;
