-- Confluir — Avisos opt-in + escolha do celular (2026-10-07)
--
-- Até aqui as preferências de aviso eram opt-out: sem chave = ligado, e todo
-- mundo recebia por e-mail/Telegram/celular tudo o que chegava. Agora:
--   • nascem DESMARCADAS (opt-in): só `true` liga (lib/telegram-eventos.ts);
--   • o celular (Web Push) ganha preferência própria por tipo de aviso;
--   • Meu perfil → Avisos só oferece os avisos das áreas em que a pessoa tem
--     permissão.
--
-- Este script cria a coluna do celular e DESMARCA TUDO de todos os usuários
-- (e-mail, Telegram e celular) — cada pessoa escolhe de novo o que quer
-- receber e por onde. O sino e a caixa de entrada do painel não mudam.
--
-- Executar UMA VEZ no SQL Editor do Supabase. A coluna é idempotente; o
-- UPDATE zera as escolhas a cada execução — não rode de novo depois que as
-- pessoas começarem a marcar.

alter table public.usuarios add column if not exists push_notif_prefs jsonb;
comment on column public.usuarios.push_notif_prefs is
  'Preferências de aviso no celular (Web Push) por evento (opt-in: chave=true liga). Ver lib/telegram-eventos.ts.';

comment on column public.usuarios.notif_email_prefs is
  'Preferências de aviso por e-mail por evento (opt-in: chave=true liga). Ver lib/telegram-eventos.ts.';

update public.usuarios
   set notif_email_prefs = '{}'::jsonb,
       telegram_notif_prefs = '{}'::jsonb,
       push_notif_prefs = '{}'::jsonb;

-- Conferência: deve dar 0 em todas as colunas.
select
  count(*) filter (where notif_email_prefs::text like '%true%')    as email_ligados,
  count(*) filter (where telegram_notif_prefs::text like '%true%') as telegram_ligados,
  count(*) filter (where push_notif_prefs::text like '%true%')     as celular_ligados
from public.usuarios;
