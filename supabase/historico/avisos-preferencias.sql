-- Confluir — Preferências de aviso por e-mail (2026-10-04, onda 2 / U3)
--
-- O Telegram já tinha preferência por evento (usuarios.telegram_notif_prefs).
-- O e-mail passa a ter a sua, com o mesmo modelo opt-out: ausência de chave
-- = ligado; `false` desliga aquele evento. Lista de eventos em
-- src/lib/telegram-eventos.ts. O código tolera a coluna ausente.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

alter table public.usuarios add column if not exists notif_email_prefs jsonb;
comment on column public.usuarios.notif_email_prefs is
  'Preferências de aviso por e-mail por evento (opt-out: chave=false desliga). Ver lib/telegram-eventos.ts.';
