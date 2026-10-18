-- ============================================================================
-- Reembolsos do ACT com permissão própria (17/10/2026). Idempotente — rodar no
-- SQL Editor ANTES do deploy (`atualizarAcesso` grava todas as chaves do
-- catálogo: a coluna precisa existir antes).
--
-- Até aqui só "Gestão de Pessoal" abria a área. Com a chave dedicada, dá para
-- delegar a avaliação dos reembolsos sem liberar o resto do Pessoal.
-- ============================================================================

alter table public.permissoes
  add column if not exists pessoal_reembolsos boolean;

comment on column public.permissoes.pessoal_reembolsos is
  'Reembolsos do ACT: avaliar os pedidos, tipos do ACT e o histórico por funcionário (sem a Gestão de Pessoal inteira).';

notify pgrst, 'reload schema';
