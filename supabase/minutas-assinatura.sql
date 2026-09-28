-- Confluir — Assinatura eletrônica das minutas de contrato (2026-09-28)
--
-- Reaproveita o envelope genérico (documento_assinaturas, ver
-- supabase/assinatura-generalizada.sql) e o endurece para contrato:
--
-- • CPF do assinante: quem envia informa; na hora de assinar a pessoa digita
--   o nome completo e o CPF, e o sistema só aceita se o CPF bater. Junto com o
--   código de uso único no e-mail, liga a assinatura a UMA pessoa física.
-- • Testemunhas (opcional, duas): contrato assinado pelas partes e por duas
--   testemunhas é título executivo extrajudicial.
-- • Conteúdo congelado: o SHA-256 do texto vai para o envelope; a minuta fica
--   travada para edição enquanto houver envio ativo ou assinatura.
-- • Alternativa de maior força probatória: anexar o PDF assinado por fora com
--   certificado ICP-Brasil ou pelo gov.br.
--
-- Pré-requisito: supabase/contratos-minutas.sql e assinatura-generalizada.sql.
-- Idempotente.

-- ── 1. O envelope aceita minuta e os papéis de contrato ─────────────────────

alter table documento_assinaturas drop constraint if exists ck_doc_assinaturas_tipo;
alter table documento_assinaturas add constraint ck_doc_assinaturas_tipo
  check (documento_tipo is null or documento_tipo in ('oficio', 'cessao', 'minuta')) not valid;

alter table documento_assinaturas drop constraint if exists ck_doc_assinaturas_papel;
alter table documento_assinaturas add constraint ck_doc_assinaturas_papel
  check (papel is null or papel in ('cedente', 'concessionario', 'assinante', 'contratante', 'contratada', 'testemunha')) not valid;

-- CPF informado por quem envia (só dígitos) e o que o assinante declarou.
alter table documento_assinaturas add column if not exists cpf text;
alter table documento_assinaturas add column if not exists nome_declarado text;
alter table documento_assinaturas add column if not exists cpf_conferido_em timestamptz;

comment on column documento_assinaturas.cpf is
  'CPF do assinante (só dígitos), informado no envio. Na assinatura da minuta a pessoa digita o CPF e ele precisa bater.';

-- ── 2. Estado da assinatura na minuta ────────────────────────────────────────

alter table contratos_minutas add column if not exists assinatura_hash text;
alter table contratos_minutas add column if not exists assinatura_enviada_em timestamptz;
alter table contratos_minutas add column if not exists assinada_em timestamptz;
-- PDF assinado por fora (ICP-Brasil / gov.br), no bucket privado `documentos`.
alter table contratos_minutas add column if not exists arquivo_assinado text;
alter table contratos_minutas add column if not exists arquivo_assinado_em timestamptz;
alter table contratos_minutas add column if not exists arquivo_assinado_por_id uuid references usuarios(id);

comment on column contratos_minutas.assinatura_hash is
  'SHA-256 do texto enviado para assinatura. Enquanto houver envio ativo ou assinatura, o texto não pode mudar.';
