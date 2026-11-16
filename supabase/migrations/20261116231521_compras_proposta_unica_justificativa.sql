-- Confluir — Justificativa da compra com uma só proposta
--
-- POR QUÊ: a auditoria das ordens (regra proposta_unica) alerta quando a
-- compra pelo setor de Aquisição passa do limite configurado com uma só
-- proposta, mas quem autoriza via o alerta sem o porquê (fornecedor
-- exclusivo, urgência, item sem concorrente). Desde 16/11/2026 o comprador
-- justifica ao registrar a compra, e o texto vai junto no alerta.
--
-- COMO: texto livre no processo. Só é pedido quando a regra está ativa e o
-- valor passa do limite com uma proposta; nos demais casos fica nulo.
-- Idempotente.

alter table public.compras_solicitacoes
  add column if not exists proposta_unica_justificativa text;

comment on column public.compras_solicitacoes.proposta_unica_justificativa is 'Por que a compra seguiu com uma só proposta acima do limite da auditoria (texto do comprador). [lgpd:nenhum]';
