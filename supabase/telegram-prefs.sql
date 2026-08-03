-- Preferências de notificação push do Telegram, por usuário.
--
-- Opt-out: a AUSÊNCIA de chave significa LIGADO. Cada chave (contracheque,
-- ponto, ferias, diarias — ver src/lib/telegram-eventos.ts) recebe `false`
-- só quando o usuário desmarca o aviso em Meu perfil → Telegram.
--
-- Ex.: {"diarias": false} = recebe tudo, menos diárias.

alter table usuarios
  add column if not exists telegram_notif_prefs jsonb;

comment on column usuarios.telegram_notif_prefs is
  'Preferências de push do Telegram (opt-out). Chaves: contracheque/ponto/ferias/diarias → boolean. Ausência = ligado.';
