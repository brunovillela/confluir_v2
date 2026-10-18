-- Confluir — Módulo Representação Sindical: permissões (Fase A) (2026-07-25)
--
-- Assembleias, Oposição à Contribuição Assistencial e Acordos Coletivos passam
-- a ser um módulo próprio (Representação Sindical), fora de Filiação. Aqui só a
-- reestruturação de PERMISSÕES; as rotas foram movidas no código e os redirects
-- estão em next.config.ts. As tabelas de Acordos Coletivos vêm em supabase/acordos.sql (Fase B).
--
-- Idempotente-ish: o rename só roda uma vez (a coluna origem some depois).

-- 1. `filiacao_oposicao` → `oposicao` (tira o "filiacao_" enganoso; preserva o valor).
alter table public.permissoes
  rename column filiacao_oposicao to oposicao;

-- 2. Nova flag do submódulo Acordos Coletivos.
alter table public.permissoes
  add column if not exists acordos_coletivos boolean not null default false;

-- Concede as flags do novo módulo ao(s) admin(s) atual(is) — só o Bruno tem
-- usuario_id hoje. (`oposicao` já herdou o valor de `filiacao_oposicao`.)
update public.permissoes set acordos_coletivos = true where usuario_id is not null;
