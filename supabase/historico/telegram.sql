-- Confluir — Bot do Telegram: vínculo chat↔usuário (2026-08-02)
--
-- Um único bot para toda a plataforma (um TELEGRAM_BOT_TOKEN). Cada pessoa
-- vincula o próprio Telegram à sua conta do Confluir: o painel gera um CÓDIGO
-- temporário e um deep link `t.me/<bot>?start=<codigo>`; ao abrir, o webhook
-- (`/api/telegram/webhook`) casa o `chat_id` do Telegram com o `usuarios.id`.
--
-- Não precisa de n8n nem de Edge Function: a rota do Next.js recebe o webhook e
-- responde pela API do Telegram. O webhook é CROSS-TENANT (identifica a pessoa
-- pelo chat_id, sem contexto de tenant) → usa service role.

alter table public.usuarios
  add column if not exists telegram_chat_id text;
alter table public.usuarios
  add column if not exists telegram_vinculo_codigo text;
alter table public.usuarios
  add column if not exists telegram_vinculo_expira timestamptz;

-- Um chat pertence a no máximo um usuário.
create unique index if not exists usuarios_telegram_chat_id_idx
  on public.usuarios (telegram_chat_id)
  where telegram_chat_id is not null;

-- Busca do código pendente no /start.
create index if not exists usuarios_telegram_vinculo_codigo_idx
  on public.usuarios (telegram_vinculo_codigo)
  where telegram_vinculo_codigo is not null;

-- Variáveis de ambiente necessárias (não vão no banco):
--   TELEGRAM_BOT_TOKEN      — token do @BotFather (habilita tudo; sem ela, degrada)
--   TELEGRAM_WEBHOOK_SECRET — segredo que valida o webhook (secret_token do setWebhook)
--   TELEGRAM_BOT_USERNAME   — @usuario do bot (para montar o deep link do vínculo)
--
-- Registrar o webhook UMA VEZ (após o deploy), com o mesmo segredo:
--   curl "https://api.telegram.org/bot<TOKEN>/setWebhook" \
--     -d "url=https://<DOMINIO>/api/telegram/webhook" \
--     -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>"
