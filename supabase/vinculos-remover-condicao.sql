-- ============================================================================
-- Remove a condição sindical do VÍNCULO (2026-09-09).
--
-- O filiado tem UMA condição, em filiacoes.filiacao_condicao (é o campo
-- FILIAÇÃO CONDIÇÃO do Bubble e o que move a esteira de etapas). A coluna
-- homônima em filiacao_vinculos nasceu aqui, sem par no Bubble, e só foi
-- preenchida em 10 vínculos, 4 deles em conflito com o cadastro. O app já
-- não lê nem grava a coluna; os 10 valores foram zerados por script.
--
-- Rodar no SQL Editor do Supabase. Idempotente.
-- ============================================================================

alter table public.filiacao_vinculos drop column if exists filiacao_condicao;
