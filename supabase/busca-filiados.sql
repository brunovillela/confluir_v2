-- Confluir — Busca de filiados sem acento + por tokens (2026-07-28)
--
-- Torna a busca por nome insensível a acento. O PostgREST não aplica
-- unaccent() inline sobre a coluna, então criamos uma coluna NORMALIZADA gerada
-- (sem acento + minúscula) + índice trigram, e o app busca nela passando o termo
-- já sem acento (helper `semAcento` em lib/formato.ts). unaccent() é STABLE →
-- precisamos de um wrapper IMMUTABLE p/ poder usar em coluna gerada.

create extension if not exists unaccent;
create extension if not exists pg_trgm;

create or replace function public.f_unaccent(text)
  returns text
  language sql
  immutable
  parallel safe
  strict
as $$ select public.unaccent('public.unaccent', $1) $$;

-- Filiados
alter table public.filiacoes
  add column if not exists nome_completo_norm text
  generated always as (public.f_unaccent(lower(nome_completo))) stored;
create index if not exists filiacoes_nome_norm_trgm
  on public.filiacoes using gin (nome_completo_norm gin_trgm_ops);

-- Aptos a votar (busca dentro das assembleias)
alter table public.voto_assembleias_aptos
  add column if not exists nome_completo_norm text
  generated always as (public.f_unaccent(lower(nome_completo))) stored;
create index if not exists voto_aptos_nome_norm_trgm
  on public.voto_assembleias_aptos using gin (nome_completo_norm gin_trgm_ops);
