-- ===========================================================================
-- SEED DEMO — Fluxos públicos (para o print da /ficha/<token>)
-- ---------------------------------------------------------------------------
-- As telas públicas /filiar, /portal/oposicao (entrada) e /votar/<id> são
-- anônimas e não precisam de seed. A /ficha/<token> é sem-login, mas precisa de
-- um token real — este seed cria uma solicitação em "aguardando_assinatura"
-- (estado em que a ficha mostra: baixar PDF + assinar no gov.br + enviar).
--
-- A votação usa uma assembleia já existente do seed de representação
-- (voto_assembleias ac000000-…001). A oposição pública renderiza sem seed.
--
-- Token fixo para o print:  a4a4a4a4-0000-4000-8000-000000000001
--   → capturar em /ficha/a4a4a4a4-0000-4000-8000-000000000001
--
-- Convenção: sem begin/commit, idempotente. Espelha o insert do seed de
-- filiados (sexo é TEXT aqui, sem cast). Reusa o empregador f0f0f0f0-…001.
-- ===========================================================================

insert into filiacao_solicitacoes (
  id, emp_proprietaria_id, token, nome_completo, cpf, nascimento_data, sexo, email,
  telefone_1, telefone_1_whatsapp,
  endereco_cep, endereco_logradouro, endereco_numero, endereco_bairro,
  endereco_cidade, endereco_estado,
  empregador_id, matricula, cargo, lotacao,
  aceite_lgpd_data, aceite_desconto_data, tl_lgpd_id, tl_desconto_id,
  situacao, documento_assinado_url, protocolo, email_verificado_em, created_at
) values (
  '40400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'a4a4a4a4-0000-4000-8000-000000000001',
  'Gabriel Souza Martins','98765432100', date '1991-04-22','Masculino','gabriel.demo@exemplo.com',
  '(21) 99900-1003', true,
  '24040-000','Rua das Acácias','512','São Francisco','Niterói','RJ',
  'f0f0f0f0-0000-4000-8000-000000000001','2103','Operador de Produção','Refinaria',
  now() - interval '1 days', now() - interval '1 days',
  'a1a1a1a1-0000-4000-8000-000000000001','a2a2a2a2-0000-4000-8000-000000000001',
  'aguardando_assinatura', null, 1051, now() - interval '1 days', now() - interval '1 days')
on conflict (id) do nothing;

-- ===========================================================================
-- Depois de rodar, capture com:  node scripts/manual-prints.mjs
-- Conferência:
--   select situacao, token from filiacao_solicitacoes where id='40400000-0000-4000-8000-000000000001';
--   -- aguardando_assinatura | a4a4a4a4-0000-4000-8000-000000000001
-- ===========================================================================
