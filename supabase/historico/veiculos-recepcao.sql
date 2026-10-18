-- ============================================================================
-- Veículos: recepção (controle de acesso) registra entrada e saída
-- (2026-09-10). Idempotente — rodar no SQL Editor do Supabase.
--
-- Decisões do Bruno:
-- • Quem registra saída e entrada do veículo é a RECEPÇÃO, na página do
--   veículo: fora → entrada (devolução); na garagem → saída, com destino e
--   previsão de retorno facultativos.
-- • Qualquer condutor solicita veículo no painel inicial, sem permissão ao
--   módulo; os agendamentos em aberto ficam lá, com edição e cancelamento.
-- • A recepção gerencia os agendamentos: transfere o veículo, vincula a saída
--   ao agendamento (baixa) e cancela. Cancelar NÃO exclui: fica 'cancelada'.
-- ============================================================================

-- Permissão nova (flag plana + perfis via chave no catálogo).
alter table permissoes add column if not exists veiculos_recepcao boolean;

-- Quem cancelou (condutor ou recepção) e quando — o registro permanece.
alter table veiculos_agendamentos
  add column if not exists cancelado_por_id uuid references usuarios(id),
  add column if not exists cancelado_em timestamptz;

comment on column veiculos_agendamentos.cancelado_por_id is
  'Usuário que cancelou (o próprio condutor ou a recepção). Cancelar não exclui: situacao = cancelada.';

-- previsao_retorno já existe em veiculos_disponibilidade (legado do Bubble);
-- passa a ser preenchida pela recepção na saída, quando informada.
comment on column veiculos_disponibilidade.previsao_retorno is
  'Previsão de retorno informada pela recepção na saída (facultativa).';
