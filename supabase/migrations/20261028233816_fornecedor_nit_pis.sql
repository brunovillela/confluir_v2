-- Confluir — NIT/PIS do fornecedor pessoa física (28/10/2026)
--
-- POR QUÊ: o autônomo pago por RPA é declarado no eSocial (S-1200) e na
-- DCTFWeb pelo NIT/PIS. A aba RPAs da Exportação contábil precisa dele, e o
-- cadastro de fornecedor não tinha onde guardar.
--
-- COMO: coluna nullable em `empresa` (os fornecedores), só dígitos (11).
-- Idempotente.

alter table public.empresa add column if not exists nit_pis text;

comment on column public.empresa.nit_pis is 'NIT/PIS/PASEP do fornecedor pessoa física (autônomo pago por RPA), só os 11 dígitos — vai para o relatório de RPAs da contabilidade (eSocial/DCTFWeb). [lgpd:identificacao]';
