-- ============================================================================
-- Comunicação › Aniversariantes: parabéns e aviso à equipe no dia ou na
-- véspera (30/09/2026). Rodar depois de comunicacao-aniversario-modelos.sql.
--
--  • parabens_antecedencia — 0 = o e-mail do filiado chega no dia do
--    aniversário; 1 = chega na véspera, na hora configurada.
--  • aviso_antecedencia — o mesmo para o aviso à equipe (na véspera, a
--    equipe se prepara para mandar os WhatsApps no dia).
-- Idempotente.
-- ============================================================================

alter table comunicacao_aniversario_config add column if not exists parabens_antecedencia smallint not null default 0;
alter table comunicacao_aniversario_config add column if not exists aviso_antecedencia smallint not null default 0;

do $$ begin
  alter table comunicacao_aniversario_config add constraint comunicacao_aniversario_config_antecedencia_check
    check (parabens_antecedencia in (0, 1) and aviso_antecedencia in (0, 1));
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';
