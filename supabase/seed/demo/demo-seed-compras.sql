-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Compras) — 2026-08-02
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/compras),
-- presos ao tenant demo (emp_proprietaria_id = 11111111-…). Reaproveita a
-- empresa/tenant e o operador do seed do Pessoal. Cobre: Fornecedor (dados +
-- endereços + dados bancários), Contrato (vigência + aditivo + ordens +
-- resumo), e o Hub (processo em cotação, ordem em autorização, fornecimento).
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; idempotente
-- (apaga os dados demo do módulo e reinsere). TODA tabela tenant-owned recebe
-- `emp_proprietaria_id = demo` EXPLÍCITO. EXCEÇÃO: `dados_bancarios` NÃO tem a
-- coluna (escopada pelo pai `fornecedor_id`). Situações/tipos são TEXTO livre
-- (bater exatamente: tipo 'Contrato'/'Compras', situacao 'Paga'/'A pagar'/
-- 'Em autorização'). Muitos booleans.
--
-- Tabelas compartilhadas (empresa, ordens_pagamento) são limpas por ID FIXO
-- para NÃO tocar nos dados de outros módulos da demo.
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   operador .......... 22222222-2222-4222-8222-222222222222
--   fornecedor ........ f0f0f0f0-0000-4000-8000-000000000004
--   departamentos ..... de100000-…  contrato c1100000-…  ordens ec100000-…
-- ===========================================================================

-- 0) Garante a empresa/tenant demo.
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('11111111-1111-4111-8111-111111111111',
  'Sindicato Demonstração (dados fictícios)', 'Confluir Demo', '00.000.000/0001-91', null)
on conflict (id) do nothing;
insert into tenants (empresa_id, slug, status)
values ('11111111-1111-4111-8111-111111111111', 'demo', 'trial')
on conflict (empresa_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1) LIMPEZA dos dados de COMPRAS da demo (filhos antes dos pais).
--    ordens_pagamento e empresa: por ID FIXO (tabelas compartilhadas).
-- ---------------------------------------------------------------------------
delete from compras_fornecimentos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from ordens_pagamento where id in (
  'ec100000-0000-4000-8000-000000000001','ec100000-0000-4000-8000-000000000002','ec100000-0000-4000-8000-000000000003');
delete from compras_solicitacoes where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from contratos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111' and aditivo = true;
delete from contratos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from contratos_categorias where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from dados_bancarios where fornecedor_id = 'f0f0f0f0-0000-4000-8000-000000000004';
delete from enderecos where empresa_id = 'f0f0f0f0-0000-4000-8000-000000000004';
delete from empresa_departamentos where id in (
  'de100000-0000-4000-8000-000000000001','de100000-0000-4000-8000-000000000002');
delete from empresa where id = 'f0f0f0f0-0000-4000-8000-000000000004';

-- ---------------------------------------------------------------------------
-- 2) Departamentos (para os selects e nomes)
-- ---------------------------------------------------------------------------
insert into empresa_departamentos (id, emp_proprietaria_id, departamento) values
  ('de100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Administrativo'),
  ('de100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Operacional');

-- ---------------------------------------------------------------------------
-- 3) Fornecedor (empresa) + endereços + dados bancários
-- ---------------------------------------------------------------------------
insert into empresa (
  id, emp_proprietaria_id, nome_razao, nome_fantasia, cnpj_cpf,
  pessoa_juridica, inativa, bloqueado, fornecedor_bloqueado, empresa
) values (
  'f0f0f0f0-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111',
  'Tech Suprimentos e Serviços Ltda','Tech Suprimentos','44.555.666/0001-77',
  true, false, false, false, false);

insert into enderecos (
  id, emp_proprietaria_id, empresa_id, nome_endereco, cep, logradouro, numero, bairro, cidade, estado
) values
  ('ed100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','f0f0f0f0-0000-4000-8000-000000000004',
   'Sede','25000-000','Rua da Indústria','500','Distrito Industrial','Duque de Caxias','RJ'),
  ('ed100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','f0f0f0f0-0000-4000-8000-000000000004',
   'Depósito','25010-000','Rua dos Galpões','88','Jardim Primavera','Duque de Caxias','RJ');

-- dados_bancarios NÃO tem emp_proprietaria_id (escopada por fornecedor_id).
insert into dados_bancarios (
  id, fornecedor_id, banco, agencia, conta, tipo_conta, pix, favorecido
) values (
  'db100000-0000-4000-8000-000000000001','f0f0f0f0-0000-4000-8000-000000000004',
  'Banco do Brasil','1234-5','98765-4','Corrente','44.555.666/0001-77','Tech Suprimentos e Serviços Ltda');

-- ---------------------------------------------------------------------------
-- 4) Categoria + contrato (vigente) + aditivo
-- ---------------------------------------------------------------------------
insert into contratos_categorias (id, emp_proprietaria_id, nome, sigiloso)
values ('cf100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Serviços continuados', false);

insert into contratos (
  id, emp_proprietaria_id, codigo, objeto, valor, vigencia_inicio, vigencia_termino,
  ativo, deletado, aditivo, apoio_institucional, sob_demanda,
  fornecedor_id, departamento_id, categoria_id, responsavel_id, created_at
) values (
  'c1100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '2025.0801.0900.0001','Fornecimento contínuo de material de limpeza e higiene', 1500.00,
  (now() - interval '165 days')::date, (now() + interval '200 days')::date,
  true, false, false, false, false,
  'f0f0f0f0-0000-4000-8000-000000000004','de100000-0000-4000-8000-000000000001',
  'cf100000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222', now() - interval '165 days');

insert into contratos (
  id, emp_proprietaria_id, codigo, objeto, valor, vigencia_inicio, vigencia_termino,
  ativo, deletado, aditivo, contrato_principal_id, apoio_institucional, sob_demanda,
  fornecedor_id, departamento_id, categoria_id, created_at
) values (
  'c1100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  '2026.0201.1000.0002','Aditivo de prorrogação de prazo e reajuste', 1575.00,
  (now() + interval '200 days')::date, (now() + interval '365 days')::date,
  true, false, true, 'c1100000-0000-4000-8000-000000000001', false, false,
  'f0f0f0f0-0000-4000-8000-000000000004','de100000-0000-4000-8000-000000000001',
  'cf100000-0000-4000-8000-000000000001', now() - interval '10 days');

-- Ordens do contrato (contrato_id) → resumo Previsto 3000 / Pago 1500 / Aberto 1500.
insert into ordens_pagamento (
  id, emp_proprietaria_id, codigo, descricao, tipo, situacao,
  valor_inicial_cobranca, valor_pago, vencimento, data_pagamento,
  beneficiario_fornecedor_id, contrato_id, autorizacao_esta_autorizado, excluido, created_at
) values
  ('ec100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'OP-C-001','Parcela do contrato — junho','Contrato','Paga',
   1500.00, 1500.00, (now() - interval '30 days')::date, (now() - interval '28 days')::date,
   'f0f0f0f0-0000-4000-8000-000000000004','c1100000-0000-4000-8000-000000000001', true, false, now() - interval '35 days'),
  ('ec100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'OP-C-002','Parcela do contrato — julho','Contrato','A pagar',
   1500.00, null, (now() + interval '15 days')::date, null,
   'f0f0f0f0-0000-4000-8000-000000000004','c1100000-0000-4000-8000-000000000001', false, false, now() - interval '5 days');

-- ---------------------------------------------------------------------------
-- 5) Hub: processo em cotação + processo comprado (com fornecimento a receber)
--    + ordem de Compras "Em autorização".
-- ---------------------------------------------------------------------------
insert into compras_solicitacoes (
  id, emp_proprietaria_id, codigo, aquisicao_direta, solicitacao_produto, solicitacao_e_produto,
  solicitacao_departamento_id, cancelado, comprado, em_cotacao, cotacao_inicio, estocavel, created_at
) values
  ('c5100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   '2026.0725.0900.0001', false, 'Aquisição de 10 computadores', true,
   'de100000-0000-4000-8000-000000000001', false, false, true, (now() - interval '5 days')::date, false, now() - interval '5 days'),
  ('c5100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   '2026.0715.0900.0002', true, 'Material de escritório (compra direta)', true,
   'de100000-0000-4000-8000-000000000001', false, true, false, null, false, now() - interval '12 days');

insert into ordens_pagamento (
  id, emp_proprietaria_id, codigo, descricao, tipo, situacao,
  valor_inicial_cobranca, beneficiario_fornecedor_id, processo_compra_id, excluido, created_at
) values (
  'ec100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
  'OP-C-003','Pagamento da aquisição de computadores','Compras','Em autorização',
  42000.00, 'f0f0f0f0-0000-4000-8000-000000000004','c5100000-0000-4000-8000-000000000002', false, now() - interval '3 days');

insert into compras_fornecimentos (
  id, emp_proprietaria_id, processo_id, fornecedor_id, valor, forma_pagamento, recebido, created_at
) values (
  'c6100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'c5100000-0000-4000-8000-000000000002','f0f0f0f0-0000-4000-8000-000000000004', 800.00, 'Pix', false, now() - interval '3 days');

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs.
--   select count(*) from contratos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 2
-- ===========================================================================
