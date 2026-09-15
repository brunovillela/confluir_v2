-- ============================================================================
-- Assinatura de ofícios pelo TELEGRAM (2026-09-15). Complementa
-- supabase/oficios-assinatura.sql. Idempotente.
--
-- Pedido do Bruno: o Coordenador Geral não tem e-mail, mas a diretoria usa o
-- bot do Telegram. O envelope passa a guardar por onde o convite e o código de
-- uso único foram entregues; o resto do fluxo (link com token, hash do
-- conteúdo, trilha, certificado) é o mesmo.
--
-- `canal`: 'email' (padrão) ou 'telegram'. No Telegram guardamos o chat e o
-- telefone confirmado no momento do envio — a trilha e o certificado precisam
-- dizer para ONDE foi, mesmo que o vínculo mude depois.
-- ============================================================================

alter table oficios_assinaturas add column if not exists canal text not null default 'email';
alter table oficios_assinaturas add column if not exists telegram_chat_id text;
alter table oficios_assinaturas add column if not exists telegram_telefone text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oficios_assinaturas_canal_check') then
    alter table oficios_assinaturas add constraint oficios_assinaturas_canal_check
      check (canal in ('email', 'telegram'));
  end if;
end $$;

comment on column oficios_assinaturas.canal is
  'Por onde o convite e o código de uso único foram entregues: email ou telegram.';

notify pgrst, 'reload schema';
