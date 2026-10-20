-- Confluir — SEED do tenant de DEMONSTRAÇÃO (Tributos) — 2026-10-20
--
-- Dados 100% FICTÍCIOS para as telas e os prints do manual
-- (/painel/financeiro/tributos), presos ao tenant demo
-- (emp_proprietaria_id = 11111111-…). Valores inventados.
--
-- MESMAS REGRAS dos demais seeds: sem begin/commit; idempotente (apaga os
-- dados demo do módulo e reinsere); TODA tabela tenant-owned recebe
-- `emp_proprietaria_id = demo` EXPLÍCITO.
--
-- PRÉ-REQUISITO: migração 20261020003556_tributos; seeds de Pessoal e
-- Financeiro (empresa/tenant e centros de custo cc000000-…).
--
-- IDs FIXOS (hex):
--   órgãos ............ e7000000-0000-4000-8000-00000000000N
--   tributos .......... 7a000000-0000-4000-8000-00000000000N
--   guias ............. 7b000000-0000-4000-8000-0000000000NN
--   ordens ............ 7c000000-0000-4000-8000-0000000000NN
--
-- Quadro em 20/10/2026: FGTS e DARF mensais (dia 20) com o histórico pago, a
-- guia de setembro do DARF já lançada ("A pagar"), a do FGTS ainda prevista e
-- as de outubro previstas; IPTU e alvará anuais, pagos.

delete from ordens_pagamento
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111'
    and tipo = 'Tributo';
delete from financeiro_tributos
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from empresa
  where id in ('e7000000-0000-4000-8000-000000000001', 'e7000000-0000-4000-8000-000000000002', 'e7000000-0000-4000-8000-000000000003');

-- Órgãos (favorecidos das ordens)
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, pessoa_juridica, empresa, bloqueado, inativa, fornecedor_bloqueado, emp_proprietaria_id) values
  ('e7000000-0000-4000-8000-000000000001', 'MINISTERIO DA FAZENDA', 'RECEITA FEDERAL', '00394460005887', true, false, false, false, false, '11111111-1111-4111-8111-111111111111'),
  ('e7000000-0000-4000-8000-000000000002', 'CAIXA ECONOMICA FEDERAL', 'CAIXA (FGTS)', '00360305000104', true, false, false, false, false, '11111111-1111-4111-8111-111111111111'),
  ('e7000000-0000-4000-8000-000000000003', 'PREFEITURA MUNICIPAL DE EXEMPLO', 'PREFEITURA DE EXEMPLO', null, true, false, false, false, false, '11111111-1111-4111-8111-111111111111');

-- Tributos
insert into financeiro_tributos (id, emp_proprietaria_id, nome, abreviacao, esfera, beneficiario_empresa_id, centro_custo_despesa_id, periodicidade, dia_vencimento, valor_esperado, forma_pagamento, observacoes) values
  ('7a000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Fundo de Garantia do Tempo de Serviço', 'FGTS', 'trabalhista', 'e7000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000004', 'mensal', 20, null, 'Boleto', 'Guia gerada no FGTS Digital a partir da folha do mês.'),
  ('7a000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'Imposto de Renda Retido na Fonte', 'DARF IRRF', 'federal', 'e7000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000004', 'mensal', 20, null, 'Boleto', null),
  ('7a000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'Imposto Predial e Territorial Urbano — sede', 'IPTU', 'municipal', 'e7000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000001', 'anual', null, null, 'Boleto', 'Cota única com desconto, paga em fevereiro.'),
  ('7a000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'Taxa de fiscalização de funcionamento', 'Alvará', 'municipal', 'e7000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000001', 'anual', null, 412.30, 'Boleto', null);

-- Guias (primeiro sem a ordem; a ordem aponta para a guia e a guia é ligada depois)
insert into financeiro_tributos_lancamentos (id, emp_proprietaria_id, tributo_id, competencia_inicio, competencia_fim, valor, vencimento, situacao) values
  ('7b000000-0000-4000-8000-000000000011', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000001', '2026-06-01', '2026-06-30', 3820.15, '2026-07-20', 'lancado'),
  ('7b000000-0000-4000-8000-000000000012', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000001', '2026-07-01', '2026-07-31', 3911.40, '2026-08-20', 'lancado'),
  ('7b000000-0000-4000-8000-000000000013', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000001', '2026-08-01', '2026-08-31', 3874.02, '2026-09-18', 'lancado'),
  ('7b000000-0000-4000-8000-000000000014', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000001', '2026-09-01', '2026-09-30', null, '2026-10-20', 'aguardando_guia'),
  ('7b000000-0000-4000-8000-000000000015', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000001', '2026-10-01', '2026-10-31', null, '2026-11-20', 'aguardando_guia'),
  ('7b000000-0000-4000-8000-000000000021', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000002', '2026-07-01', '2026-07-31', 5240.33, '2026-08-20', 'lancado'),
  ('7b000000-0000-4000-8000-000000000022', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000002', '2026-08-01', '2026-08-31', 5198.70, '2026-09-18', 'lancado'),
  ('7b000000-0000-4000-8000-000000000023', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000002', '2026-09-01', '2026-09-30', 5302.11, '2026-10-20', 'lancado'),
  ('7b000000-0000-4000-8000-000000000024', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000002', '2026-10-01', '2026-10-31', null, '2026-11-20', 'aguardando_guia'),
  ('7b000000-0000-4000-8000-000000000031', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000003', '2026-01-01', '2026-12-31', 2860.00, '2026-02-10', 'lancado'),
  ('7b000000-0000-4000-8000-000000000041', '11111111-1111-4111-8111-111111111111', '7a000000-0000-4000-8000-000000000004', '2026-01-01', '2026-12-31', 412.30, '2026-03-31', 'lancado');

-- Ordens das guias lançadas
insert into ordens_pagamento (id, codigo, tipo, descricao, situacao, valor_inicial_cobranca, vencimento, valor_pago, data_pagamento, forma_pagamento, beneficiario_fornecedor_id, centro_custo_despesa_id, autorizacao_esta_autorizado, autorizacao_data, tributo_lancamento_id, excluido, emp_proprietaria_id) values
  ('7c000000-0000-4000-8000-000000000011', '2026.0715.0930.0011', 'Tributo', 'Tributo FGTS — competência 06/2026 (Fundo de Garantia do Tempo de Serviço).', 'Paga', 3820.15, '2026-07-20', 3820.15, '2026-07-18', 'Boleto', 'e7000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000004', true, '2026-07-16', '7b000000-0000-4000-8000-000000000011', false, '11111111-1111-4111-8111-111111111111'),
  ('7c000000-0000-4000-8000-000000000012', '2026.0814.1010.0012', 'Tributo', 'Tributo FGTS — competência 07/2026 (Fundo de Garantia do Tempo de Serviço).', 'Paga', 3911.40, '2026-08-20', 3911.40, '2026-08-19', 'Boleto', 'e7000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000004', true, '2026-08-17', '7b000000-0000-4000-8000-000000000012', false, '11111111-1111-4111-8111-111111111111'),
  ('7c000000-0000-4000-8000-000000000013', '2026.0914.1100.0013', 'Tributo', 'Tributo FGTS — competência 08/2026 (Fundo de Garantia do Tempo de Serviço).', 'Paga', 3874.02, '2026-09-18', 3874.02, '2026-09-17', 'Boleto', 'e7000000-0000-4000-8000-000000000002', 'cc000000-0000-4000-8000-000000000004', true, '2026-09-15', '7b000000-0000-4000-8000-000000000013', false, '11111111-1111-4111-8111-111111111111'),
  ('7c000000-0000-4000-8000-000000000021', '2026.0814.1015.0021', 'Tributo', 'Tributo DARF IRRF — competência 07/2026 (Imposto de Renda Retido na Fonte).', 'Paga', 5240.33, '2026-08-20', 5240.33, '2026-08-19', 'Boleto', 'e7000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000004', true, '2026-08-17', '7b000000-0000-4000-8000-000000000021', false, '11111111-1111-4111-8111-111111111111'),
  ('7c000000-0000-4000-8000-000000000022', '2026.0914.1105.0022', 'Tributo', 'Tributo DARF IRRF — competência 08/2026 (Imposto de Renda Retido na Fonte).', 'Paga', 5198.70, '2026-09-18', 5198.70, '2026-09-17', 'Boleto', 'e7000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000004', true, '2026-09-15', '7b000000-0000-4000-8000-000000000022', false, '11111111-1111-4111-8111-111111111111'),
  ('7c000000-0000-4000-8000-000000000023', '2026.1015.0945.0023', 'Tributo', 'Tributo DARF IRRF — competência 09/2026 (Imposto de Renda Retido na Fonte).', 'A pagar', 5302.11, '2026-10-20', null, null, 'Boleto', 'e7000000-0000-4000-8000-000000000001', 'cc000000-0000-4000-8000-000000000004', true, '2026-10-16', '7b000000-0000-4000-8000-000000000023', false, '11111111-1111-4111-8111-111111111111'),
  ('7c000000-0000-4000-8000-000000000031', '2026.0203.1400.0031', 'Tributo', 'Tributo IPTU — competência 01/01/2026 a 31/12/2026 (Imposto Predial e Territorial Urbano — sede).', 'Paga', 2860.00, '2026-02-10', 2860.00, '2026-02-09', 'Boleto', 'e7000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000001', true, '2026-02-04', '7b000000-0000-4000-8000-000000000031', false, '11111111-1111-4111-8111-111111111111'),
  ('7c000000-0000-4000-8000-000000000041', '2026.0320.1530.0041', 'Tributo', 'Tributo Alvará — competência 01/01/2026 a 31/12/2026 (Taxa de fiscalização de funcionamento).', 'Paga', 412.30, '2026-03-31', 412.30, '2026-03-30', 'Boleto', 'e7000000-0000-4000-8000-000000000003', 'cc000000-0000-4000-8000-000000000001', true, '2026-03-21', '7b000000-0000-4000-8000-000000000041', false, '11111111-1111-4111-8111-111111111111');

update financeiro_tributos_lancamentos g
  set ordem_pagamento_id = o.id
  from ordens_pagamento o
  where o.tributo_lancamento_id = g.id
    and g.emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
