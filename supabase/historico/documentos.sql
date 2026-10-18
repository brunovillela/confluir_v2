-- Confluir — Documentos: bucket de storage (2026-08-01)
--
-- Os arquivos de Documentos já foram migrados do CDN do Bubble para o bucket
-- privado `documentos` em 2026-07-21 (fa_documentos_versao.arquivo_url guarda o
-- CAMINHO no bucket). O bucket havia sido criado À MÃO — este arquivo apenas o
-- codifica para reprodutibilidade em deploy/novo tenant (idempotente).
--
-- As tabelas fa_documentos / fa_documentos_versao / fa_documentos_categorias /
-- _junction vieram da migração do Bubble (não há create table versionado); a RLS
-- delas já está em rls-tenant-isolation.sql (+ junction em rls-tenant-por-pai).
-- O acesso ao arquivo é sempre server-side (createAdminClient + signed URL 1h),
-- então o bucket é PRIVADO.

insert into storage.buckets (id, name, public)
values ('documentos', 'documentos', false)
on conflict (id) do nothing;
