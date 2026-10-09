-- Confluir — Assinatura eletrônica do RPA por link no e-mail (2026-10-09)
--
-- O prestador recebe um link pessoal, lê o recibo, pede um código de uso
-- único no e-mail e assina digitando nome completo e CPF (que precisa bater
-- com o CPF do cadastro do fornecedor). Reaproveita o envelope genérico
-- (documento_assinaturas), como ofícios, cessões e minutas.
--
-- Alternativa para quem tem dificuldade com tecnologia: anexar o recibo
-- assinado à mão (digitalizado ou foto) ou pelo gov.br. Ao anexar, o link
-- enviado por e-mail é cancelado e a página do link avisa o prestador.
--
-- Pré-requisito: supabase/minutas-assinatura.sql. Idempotente.

-- ── 1. O envelope aceita RPA e o papel de prestador ─────────────────────────

alter table documento_assinaturas drop constraint if exists ck_doc_assinaturas_tipo;
alter table documento_assinaturas add constraint ck_doc_assinaturas_tipo
  check (documento_tipo is null or documento_tipo in ('oficio', 'cessao', 'minuta', 'rpa')) not valid;

alter table documento_assinaturas drop constraint if exists ck_doc_assinaturas_papel;
alter table documento_assinaturas add constraint ck_doc_assinaturas_papel
  check (papel is null or papel in ('cedente', 'concessionario', 'assinante', 'contratante', 'contratada', 'testemunha', 'prestador')) not valid;

-- ── 2. Estado da assinatura no RPA ──────────────────────────────────────────

-- SHA-256 do conteúdo do recibo enviado (número, prestador, serviço, valores).
alter table compras_rpa add column if not exists assinatura_hash text;
alter table compras_rpa add column if not exists assinatura_enviada_em timestamptz;
-- Como o recibo assinado chegou: 'eletronica' (pelo link) ou 'anexo'
-- (assinado à mão ou pelo gov.br e anexado no painel).
alter table compras_rpa add column if not exists assinatura_origem text;
alter table compras_rpa drop constraint if exists ck_compras_rpa_assinatura_origem;
alter table compras_rpa add constraint ck_compras_rpa_assinatura_origem
  check (assinatura_origem is null or assinatura_origem in ('eletronica', 'anexo')) not valid;
-- Validação PAdES/ICP-Brasil do PDF anexado (assinado pelo gov.br).
alter table compras_rpa add column if not exists assinatura_validacao jsonb;

comment on column compras_rpa.assinatura_origem is
  'eletronica = assinado pelo link do e-mail; anexo = recibo assinado à mão ou pelo gov.br, anexado no painel (cancela o link).';

notify pgrst, 'reload schema';
