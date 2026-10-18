-- Confluir — Eventos: token do inscrito e código de confirmação (2026-09-05)
--
-- Espelha o que a ficha de filiação pública já faz: a pessoa recebe um CÓDIGO
-- de 6 dígitos por e-mail e um TOKEN que é o endereço privado dela
-- (/inscricao/<token>), por onde confirma o e-mail, envia a foto e responde ao
-- RSVP. O código é guardado como HASH salgado pelo token — nunca em texto.
--
-- Executar UMA VEZ no SQL Editor do Supabase, depois de `eventos.sql`.

alter table eventos_inscricoes add column if not exists token uuid default gen_random_uuid();
alter table eventos_inscricoes add column if not exists codigo_hash text;
alter table eventos_inscricoes add column if not exists codigo_expira_em timestamptz;
alter table eventos_inscricoes add column if not exists codigo_tentativas integer not null default 0;

create unique index if not exists ux_eventos_insc_token
  on eventos_inscricoes (token);
-- O link do RSVP também é buscado por token próprio.
create index if not exists idx_eventos_insc_rsvp_token
  on eventos_inscricoes (rsvp_token);
