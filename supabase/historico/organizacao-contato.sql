-- Confluir — Organização: site, e-mail de contato e feed de notícias (2026-07-24)
--
-- Multitenant: valores que eram HARDCODED como "sindipetronf.org.br" no código
-- (link do site no painel, e-mail de contato da LGPD, e as URLs do feed de
-- notícias do dashboard) passam a ser CONFIGURÁVEIS por organização, na tabela
-- `empresa` (o registro do tenant é o de id = EMP_PROPRIETARIA_ID). Cada
-- organização edita os seus em Configurações → Organização.
--
-- O backfill abaixo preenche o tenant Sindipetro-NF com os valores que estavam
-- fixos no código, para nada mudar de comportamento na virada.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Colunas de contato/site na organização
-- ---------------------------------------------------------------------------
alter table public.empresa
  add column if not exists site_url text,
  add column if not exists email_contato text,
  add column if not exists noticias_url text,
  add column if not exists noticias_feed_url text;

comment on column public.empresa.site_url is
  'Site institucional público da organização (link no painel).';
comment on column public.empresa.email_contato is
  'E-mail de contato/encarregado (exibido na política de privacidade — LGPD).';
comment on column public.empresa.noticias_url is
  'Página HTML de notícias para o widget do painel (fallback quando a tabela '
  '`noticias` está vazia). Opcional.';
comment on column public.empresa.noticias_feed_url is
  'Feed RSS de notícias para o widget do painel (fallback). Opcional.';

-- ---------------------------------------------------------------------------
-- 2) Backfill do tenant atual (Sindipetro-NF) com os valores antes fixos
-- ---------------------------------------------------------------------------
update public.empresa set
  site_url          = coalesce(site_url,          'https://sindipetronf.org.br'),
  email_contato     = coalesce(email_contato,     'contato@sindipetronf.org.br'),
  noticias_url      = coalesce(noticias_url,      'https://sindipetronf.org.br/todas-as-editoriais/'),
  noticias_feed_url = coalesce(noticias_feed_url, 'https://sindipetronf.org.br/feed/')
where id = 'c763cb99-edfd-4840-8453-ed3fcb66d4a1';
