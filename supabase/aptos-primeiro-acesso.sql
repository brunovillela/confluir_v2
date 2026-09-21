-- ============================================================================
-- Aptos a votar: dados informados no PRIMEIRO ACESSO (2026-09-21). Idempotente.
--
-- As empregadoras não enviam CPF na lista de aptos (LGPD) — o CPF já é
-- opcional desde supabase/filiacao-coletiva.sql. Para não haver duplicidade,
-- quem entra pelo e-mail corporativo informa, antes da cédula, CPF, nome
-- completo e data de nascimento. O CPF vai para `cpf` (é ele que casa a pessoa
-- nas duas portas de votação); nome e nascimento ficam como DECLARADOS.
--
-- Quando o CPF já está em outro apto da mesma votação e os dados não conferem
-- (ou o outro já votou), o voto não abre: o caso fica marcado em cpf_conflito
-- para a gestão resolver na lista de aptos.
-- ============================================================================

alter table voto_assembleias_aptos
  add column if not exists nome_informado text,
  add column if not exists nascimento_informado date,
  add column if not exists dados_informados_em timestamptz,
  add column if not exists cpf_conflito text,
  add column if not exists conflito_motivo text,
  add column if not exists conflito_em timestamptz;

comment on column voto_assembleias_aptos.nascimento_informado is
  'Data de nascimento DECLARADA pelo eleitor no primeiro acesso.';
comment on column voto_assembleias_aptos.cpf_conflito is
  'CPF informado que colidiu com outro apto da mesma votação — a gestão resolve.';

notify pgrst, 'reload schema';
