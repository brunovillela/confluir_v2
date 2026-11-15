-- POR QUÊ: no pedido de reembolso do ACT o funcionário passa a informar a data
-- da despesa (coluna despesa_paga_em, que já existia e só vinha do Bubble), e
-- a gestão de Pessoal define até quantos dias depois dessa data o pedido é
-- aceito (14/11/2026).
-- COMO: prazo na configuração do Pessoal da entidade (pessoal_folha_config,
-- uma linha por entidade). Null = sem limite. Idempotente.

ALTER TABLE public.pessoal_folha_config
  ADD COLUMN IF NOT EXISTS reembolso_prazo_dias integer;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'pessoal_folha_config_reembolso_prazo_dias_check'
  ) THEN
    ALTER TABLE public.pessoal_folha_config
      ADD CONSTRAINT pessoal_folha_config_reembolso_prazo_dias_check
      CHECK (reembolso_prazo_dias IS NULL OR (reembolso_prazo_dias BETWEEN 1 AND 3650));
  END IF;
END $$;

COMMENT ON COLUMN public.pessoal_folha_config.reembolso_prazo_dias IS
  'Reembolso do ACT: até quantos dias depois da data da despesa o pedido é aceito (null = sem limite). Vale para o pedido do funcionário (Meu perfil e Telegram).';
COMMENT ON COLUMN public.pessoal_reembolsos_act.despesa_paga_em IS
  'Data da despesa (quando o funcionário pagou), obrigatória no pedido desde 14/11/2026; o pagamento pela entidade é pago_em.';
