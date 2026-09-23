-- Telefone do apto a votar.
--
-- Serve para dois caminhos quando o e-mail não chega: mandar o link pessoal
-- por WhatsApp/Telegram à mão (a secretaria copia da lista) e, adiante, o
-- vínculo do eleitor com o bot do Telegram.
--
-- `telegram_chat_id` guarda a conversa com o bot, quando o eleitor se vincula;
-- `telegram_vinculado_em` é quando isso aconteceu. Nada disso é obrigatório.
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.voto_assembleias_aptos
  add column if not exists telefone text,
  add column if not exists telegram_chat_id text,
  add column if not exists telegram_vinculado_em timestamptz;

create index if not exists voto_aptos_telegram_chat_idx
  on public.voto_assembleias_aptos (telegram_chat_id)
  where telegram_chat_id is not null;

notify pgrst, 'reload schema';
