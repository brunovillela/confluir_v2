-- ============================================================================
-- Veículos: a recepção reserva em nome de outra pessoa (2026-09-18).
-- Idempotente — rodar no SQL Editor.
--
-- Pedido do Bruno: quem registra saída e entrada (veiculos_recepcao) também
-- agenda para terceiros — um diretor ou funcionário pede, e a recepção faz a
-- solicitação em nome dele. solicitado_por_id guarda quem lançou; vazio = o
-- próprio condutor (o caso de sempre).
-- ============================================================================

alter table veiculos_agendamentos
  add column if not exists solicitado_por_id uuid references usuarios(id);
comment on column veiculos_agendamentos.solicitado_por_id is
  'Quem registrou a solicitação em nome do condutor (recepção). Nulo = o próprio condutor.';

notify pgrst, 'reload schema';
