-- Confirmação de telefone do Telegram, por usuário.
--
-- Fluxo: o usuário (já vinculado ao bot) informa o telefone no painel → recebe
-- um código PELO Telegram → digita o código no Confluir. Só então o telefone
-- fica CONFIRMADO (telegram_telefone preenchido). O bot só responde — e o push
-- só sai — para quem tem telefone confirmado.
--
-- telegram_telefone        = telefone CONFIRMADO (só dígitos). null = não confirmado.
-- telegram_tel_pendente    = telefone aguardando confirmação.
-- telegram_tel_codigo      = código de 6 dígitos enviado pelo Telegram.
-- telegram_tel_expira      = validade do código.

alter table usuarios
  add column if not exists telegram_telefone text,
  add column if not exists telegram_tel_pendente text,
  add column if not exists telegram_tel_codigo text,
  add column if not exists telegram_tel_expira timestamptz;

comment on column usuarios.telegram_telefone is
  'Telefone confirmado via Telegram (só dígitos). Ativa o bot para o usuário.';
