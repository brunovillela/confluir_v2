# Linha de base do schema — contagens de produção

Gerado por `scripts/linha-de-base-schema.mjs` em 2026-10-18, junto com `supabase/migrations/20261018000000_linha_de_base.sql`.
Serve para conferir a restauração de um banco do zero (Onda A6): aplicada a
linha de base num Supabase vazio, as contagens devem bater (exceto objetos que
o próprio Supabase cria).

Postgres de origem: 17.6

| Objeto | Produção |
|---|---|
| Tabelas (public) | 346 |
| Views (public) | 2 |
| Views materializadas (public) | 4 |
| Funções (public) | 28 |
| Triggers (public) | 322 |
| Policies (public) | 318 |
| Tabelas com RLS ligado (public) | 346 |
| Índices (public) | 1010 |
| Tipos enum (public) | 10 |
| Sequências (public) | 2 |
| Buckets (storage) | 21 |
| Policies (storage) | 0 |
| Triggers em auth.users | 0 |

Extensões: `pg_stat_statements` (extensions), `pg_trgm` (extensions), `pgcrypto` (extensions), `supabase_vault` (vault), `unaccent` (extensions), `uuid-ossp` (extensions)
