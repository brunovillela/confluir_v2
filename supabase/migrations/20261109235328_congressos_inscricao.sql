-- Confluir — Congressos: inscrição pública e link pessoal (Fase 1, parte 2)
--
-- POR QUÊ: a inscrição em congresso hoje é feita por formulário do Google e
-- PDF por e-mail. O módulo passa a ter uma página pública de inscrição e um
-- link pessoal para cada participante acompanhar a situação, sem criar conta
-- (decisão 5 do plano: link pessoal). O link será, nas próximas fases, a
-- credencial para assinar moções depois do credenciamento.
--
-- COMO:
--   congressos.slug / inscricao_publica   endereço da página pública e chave
--                                         que abre a inscrição pelo link
--   congresso_papeis.inscricao_publica     quais papéis a pessoa pode escolher
--                                         ao se inscrever sozinha
--   congresso_participantes.token_hash    hash SHA-256 do link pessoal (o
--                                         token em claro nunca é gravado)
--   congresso_participantes.aceite_em /   ciência do tratamento de dados e IP
--   inscricao_ip                          na inscrição pública
-- Idempotente.

alter table public.congressos
  add column if not exists slug text,
  add column if not exists inscricao_publica boolean not null default false;
create unique index if not exists congressos_slug
  on public.congressos (emp_proprietaria_id, slug) where slug is not null;

alter table public.congresso_papeis
  add column if not exists inscricao_publica boolean not null default false;

alter table public.congresso_participantes
  add column if not exists token_hash text,
  add column if not exists token_gerado_em timestamptz,
  add column if not exists aceite_em timestamptz,
  add column if not exists inscricao_ip text;
create unique index if not exists congresso_participantes_token
  on public.congresso_participantes (token_hash) where token_hash is not null;

comment on column public.congressos.slug is 'Endereço da página pública de inscrição (/congresso/<slug>), único na entidade. [lgpd:nenhum]';
comment on column public.congressos.inscricao_publica is 'Liga a inscrição pela página pública; a janela de datas vem da configuração (inscricao.abre/fecha). [lgpd:nenhum]';
comment on column public.congresso_papeis.inscricao_publica is 'O papel aparece como opção na inscrição pública (ex.: delegado, observador). [lgpd:nenhum]';
comment on column public.congresso_participantes.token_hash is 'SHA-256 do token do link pessoal (/congresso/eu/<token>). O token em claro só existe no link enviado. [lgpd:credencial]';
comment on column public.congresso_participantes.token_gerado_em is 'Quando o link pessoal atual foi gerado; gerar outro invalida o anterior. [lgpd:nenhum]';
comment on column public.congresso_participantes.aceite_em is 'Ciência do tratamento de dados na inscrição pública. [lgpd:nenhum]';
comment on column public.congresso_participantes.inscricao_ip is 'IP da inscrição pública, para apurar abuso (ex.: inscrições em massa). [lgpd:identificacao]';
