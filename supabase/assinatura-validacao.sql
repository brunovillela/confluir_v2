-- Confluir — Validação da assinatura gov.br/ICP-Brasil nos PDFs (2026-10-05, onda 5 / A4)
--
-- Ao subir o PDF assinado (ficha de filiação pública, carta de oposição,
-- minuta assinada por fora), o sistema lê as assinaturas PAdES do arquivo e
-- grava o resultado (integridade, assinatura, cadeia, validade, CPF do
-- signatário × cadastro) em jsonb. A fila de conferência mostra o selo e só
-- pede olhar humano quando não é "válida". Lógica em src/lib/assinatura-pdf.ts.
-- O código tolera as colunas ausentes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

alter table public.filiacao_solicitacoes add column if not exists assinatura_validacao jsonb;
alter table public.oposicao_opositor add column if not exists assinatura_validacao jsonb;
alter table public.contratos_minutas add column if not exists assinatura_validacao jsonb;
comment on column public.filiacao_solicitacoes.assinatura_validacao is 'Resultado da validação PAdES do PDF assinado (lib/assinatura-pdf.ts).';
