-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Hospedagem) — 2026-08-02
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/hospedagem),
-- presos ao tenant demo (emp_proprietaria_id = 11111111-…). As 3 telas são
-- capturadas NO PAINEL (não precisa da interface /hotel):
--   hub         → /painel/hospedagem
--   reserva     → /painel/hospedagem/servicos/{servico}
--   faturamento → /painel/hospedagem/hoteis/{hotel}
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; idempotente.
-- emp_proprietaria_id EXPLÍCITO nas tenant-owned: hospedagem_hotel,
-- hospedagem_servico, ordens_pagamento, filiacoes, empresa.
-- OMITIR emp nas por-pai: hospedagem_tarifas, hospedagem_cupom,
-- hospedagem_fatura (escopadas por hotel_id/servico_id).
-- Tabelas compartilhadas (empresa, ordens_pagamento, filiacoes) limpas por ID
-- FIXO para não tocar outros módulos.
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   hotel empresa ..... f0f0f0f0-0000-4000-8000-000000000005
--   hotel ............. 40010000-…  tarifas 40020000-…  servico 40030000-…
--   cupons 40040000-…  fatura 40050000-…  ordem ea000000-…  hóspedes 7f000000-…
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
-- 1) LIMPEZA (filhos antes dos pais).
-- ---------------------------------------------------------------------------
delete from hospedagem_cupom where hotel_id in (
  select id from hospedagem_hotel where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from hospedagem_servico where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from hospedagem_fatura where hotel_id in (
  select id from hospedagem_hotel where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from ordens_pagamento where id = 'ea000000-0000-4000-8000-000000000001';
delete from hospedagem_tarifas where hotel_id in (
  select id from hospedagem_hotel where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from hospedagem_hotel where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from empresa where id = 'f0f0f0f0-0000-4000-8000-000000000005';
delete from filiacoes where id in (
  '7f000000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- 2) Hóspedes (filiados) + empresa fiscal do hotel
-- ---------------------------------------------------------------------------
insert into filiacoes (id, emp_proprietaria_id, nome_completo, cpf, matricula_sindical, filiacao_condicao, filiacao_excluida)
values
  ('7f000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Ricardo Nunes Pereira','21321321301','5001','Ativo', false),
  ('7f000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Vanessa Lima Sampaio','32143214302','5002','Ativo', false);

insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('f0f0f0f0-0000-4000-8000-000000000005',
  'Pousada Mar Azul Hotelaria Ltda','Pousada Mar Azul','55.666.777/0001-88','11111111-1111-4111-8111-111111111111');

-- ---------------------------------------------------------------------------
-- 3) Hotel (TEM emp) + tarifas (por-pai, SEM emp)
-- ---------------------------------------------------------------------------
insert into hospedagem_hotel (
  id, emp_proprietaria_id, nome, ativo, exige_relatorio_para_faturar, empresa_id,
  quant_quartos_dedicados, max_hospedes_por_quarto, max_hospedes_por_dia
) values (
  '40010000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Pousada Mar Azul', true, false, 'f0f0f0f0-0000-4000-8000-000000000005', 10, 2, 20);

insert into hospedagem_tarifas (id, hotel_id, pessoas_por_quarto, custo_por_filiado, custo_entidade) values
  ('40020000-0000-4000-8000-000000000001','40010000-0000-4000-8000-000000000001', 1, 120.00, 120.00),
  ('40020000-0000-4000-8000-000000000002','40010000-0000-4000-8000-000000000001', 2, 100.00, 200.00);

-- ---------------------------------------------------------------------------
-- 4) Ordem de pagamento + fatura (por-pai) — o faturamento.
-- ---------------------------------------------------------------------------
insert into ordens_pagamento (
  id, emp_proprietaria_id, codigo, descricao, tipo, situacao,
  valor_inicial_cobranca, vencimento, beneficiario_fornecedor_id,
  autorizacao_esta_autorizado, excluido, created_at
) values (
  'ea000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '2026.0725.1100.0001','Faturamento de hospedagem — Pousada Mar Azul','Hospedagem','Em autorização',
  200.00, date '2026-08-25', 'f0f0f0f0-0000-4000-8000-000000000005', false, false, now() - interval '8 days');

insert into hospedagem_fatura (id, codigo, nota_fiscal, hotel_id, ordem_pagamento_id, created_at)
values ('40050000-0000-4000-8000-000000000001','2026.0725.1100.0001','danfe/demo-fatura-1.pdf',
  '40010000-0000-4000-8000-000000000001','ea000000-0000-4000-8000-000000000001', now() - interval '8 days');

-- ---------------------------------------------------------------------------
-- 5) Serviço (a RESERVA, TEM emp) — faturado (fatura_id) + cupons dos hóspedes.
-- ---------------------------------------------------------------------------
insert into hospedagem_servico (
  id, emp_proprietaria_id, codigo, checkin_date, checkout_date, coletivo,
  finalizado, quant_ocupantes, custo_entidade, fatura_id, hotel_id, created_at
) values (
  '40030000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '2026.0720.1000.0001', date '2026-07-20', date '2026-07-22', false,
  true, 2, 200.00, '40050000-0000-4000-8000-000000000001','40010000-0000-4000-8000-000000000001', now() - interval '15 days');

insert into hospedagem_cupom (
  id, check_in, sexo, cancelado, compareceu, tarifa_hospede, servico_id, filiado_id, hotel_id, created_at
) values
  ('40040000-0000-4000-8000-000000000001', date '2026-07-20','Masculino', false, true, 100.00,
   '40030000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000001','40010000-0000-4000-8000-000000000001', now() - interval '20 days'),
  ('40040000-0000-4000-8000-000000000002', date '2026-07-20','Feminino', false, true, 100.00,
   '40030000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000002','40010000-0000-4000-8000-000000000001', now() - interval '20 days'),
  -- cupom aguardando reserva (servico_id null) — alimenta o indicador do hub
  ('40040000-0000-4000-8000-000000000003', date '2026-08-15','Masculino', false, null, null,
   null,'7f000000-0000-4000-8000-000000000001','40010000-0000-4000-8000-000000000001', now() - interval '2 days');

-- ===========================================================================
-- Depois de rodar: suba o DANFE placeholder e capture com manual-prints.mjs.
--   select count(*) from hospedagem_servico where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 1
-- ===========================================================================
