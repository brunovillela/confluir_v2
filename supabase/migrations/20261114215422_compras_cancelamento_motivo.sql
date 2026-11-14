-- Confluir — Motivo do cancelamento da solicitação de compra
--
-- POR QUÊ: o solicitante e o comprador passam a poder cancelar a solicitação
-- Via Aquisição, sempre justificando a causa (14/11/2026). O processo já
-- guardava quem e quando (cancelado_por_id, cancelado_quando), mas não o
-- porquê; `justificativa` (legado) é a justificativa da COMPRA, não do
-- cancelamento.
--
-- COMO: coluna de texto livre, obrigatória pela aplicação ao cancelar.
-- Processos cancelados antes ficam sem motivo. Idempotente.

alter table public.compras_solicitacoes
  add column if not exists cancelado_motivo text;

comment on column public.compras_solicitacoes.cancelado_motivo is 'Por que a solicitação de compra foi cancelada (texto de quem cancelou). [lgpd:nenhum]';
