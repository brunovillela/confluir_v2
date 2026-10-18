-- Nome do trabalhador como veio na relação de pagamentos (13/10/2026).
--
-- O lançamento (filiacao_recebe) guardava só CPF, matrícula na fonte e valor.
-- Quem não é encontrado no cadastro fica sem nome — e para cadastrá-lo direto
-- da lista de "Não encontrados no cadastro" o nome é o dado que falta.
-- Gravado pelo Relatório (IA) e pelo CSV com coluna "nome". Só informativo:
-- quem foi identificado continua com o nome do cadastro. Idempotente.

alter table public.filiacao_recebe
  add column if not exists nome text;

comment on column public.filiacao_recebe.nome is
  'Nome do trabalhador como veio na relação de pagamentos da fonte (informativo; vale para os não encontrados no cadastro).';
