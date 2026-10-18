-- ===========================================================================
-- SEED DEMO — Área do Hotel (Pousada Mar Azul, 40010000-…001)
-- ---------------------------------------------------------------------------
-- Complementa demo-seed-hospedagem.sql para que TODAS as telas da área do
-- hotel (/hotel) saiam cheias nos prints do manual:
--   Início · Reservas (detalhe) · Faturamento · Dados bancários · Acordo.
--
-- Pré-requisitos JÁ existentes:
--   • demo-seed-hospedagem.sql .. hotel + tarifas + 1 serviço FINALIZADO já
--     faturado (40030000-…001) + fatura "Em autorização" + cupons.
--   • demo-seed-portal.sql ...... cupom do Roberto aguardando no hotel.
--   • scripts/demo-interfaces-setup.mjs .. vínculo demo@confluir.local ↔ hotel
--     (hospedagem_hotel_usuarios) — necessário para logar em /hotel.
--
-- O que este seed acrescenta:
--   1. Vigência do acordo no hotel (tela Acordo).
--   2. Contas bancárias (Pix + Depósito) — tela Dados bancários + selects da
--      Nova fatura.
--   3. Uma reserva ABERTA em andamento com 2 hóspedes que compareceram —
--      indicadores do Início, detalhe com ações, e item faturável na Nova
--      fatura.
--   4. Uma 2ª fatura já PAGA — preenche "Faturas fechadas".
--
-- Convenção: sem begin/commit, idempotente (on conflict do nothing). IDs 40x.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. Vigência do acordo (colunas do próprio hotel).
-- ---------------------------------------------------------------------------
update hospedagem_hotel set
  acordo_vigencia_inicio = date '2026-01-01',
  acordo_vigencia_fim    = date '2026-12-31'
where id = '40010000-0000-4000-8000-000000000001'
  and acordo_vigencia_inicio is null;

-- ---------------------------------------------------------------------------
-- 2. Contas bancárias do hotel (TEM emp_proprietaria_id).
-- ---------------------------------------------------------------------------
insert into hospedagem_hotel_contas (
  id, emp_proprietaria_id, hotel_id, tipo, titular, documento, banco,
  agencia, conta, chave_pix, ativo
) values
  ('40320000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   '40010000-0000-4000-8000-000000000001','pix','Pousada Mar Azul Ltda',
   '12.345.678/0001-90', null, null, null, 'financeiro@pousadamarazul.com.br', true),
  ('40320000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   '40010000-0000-4000-8000-000000000001','deposito','Pousada Mar Azul Ltda',
   '12.345.678/0001-90','Banco do Brasil','1234-5','12345-6', null, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. Reserva ABERTA em andamento (checkin ontem, checkout em 3 dias) com 2
--    hóspedes que compareceram. custo_entidade preenchido e SEM fatura_id →
--    entra como faturável. Reusa os filiados hóspedes 7f…001/002.
-- ---------------------------------------------------------------------------
insert into hospedagem_servico (
  id, emp_proprietaria_id, codigo, checkin_date, checkout_date, coletivo,
  finalizado, quant_ocupantes, custo_entidade, fatura_id, hotel_id, created_at
) values (
  '40310000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '2026.DEMO.ABERTA.0001', current_date - 1, current_date + 3, false,
  false, 2, 200.00, null,'40010000-0000-4000-8000-000000000001', now() - interval '1 days')
on conflict (id) do nothing;

insert into hospedagem_cupom (
  id, check_in, sexo, cancelado, compareceu, aceita_quarto_coletivo,
  tarifa_hospede, servico_id, filiado_id, hotel_id, created_at
) values
  ('40350000-0000-4000-8000-000000000001', current_date - 1,'Masculino', false, true, false,
   100.00,'40310000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000001',
   '40010000-0000-4000-8000-000000000001', now() - interval '3 days'),
  ('40350000-0000-4000-8000-000000000002', current_date - 1,'Feminino', false, true, false,
   100.00,'40310000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000002',
   '40010000-0000-4000-8000-000000000001', now() - interval '3 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. Fatura já PAGA (ordem 'Paga') → preenche "Faturas fechadas". Um serviço
--    finalizado do mês passado ligado a essa fatura.
-- ---------------------------------------------------------------------------
insert into ordens_pagamento (
  id, emp_proprietaria_id, codigo, descricao, tipo, situacao,
  valor_inicial_cobranca, vencimento, beneficiario_fornecedor_id,
  autorizacao_esta_autorizado, excluido, created_at
) values (
  '40330000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '2026.0705.1100.0003','Faturamento de hospedagem — Pousada Mar Azul','Hospedagem','Paga',
  120.00, date '2026-07-15','f0f0f0f0-0000-4000-8000-000000000005', true, false, now() - interval '40 days')
on conflict (id) do nothing;

insert into hospedagem_fatura (id, codigo, nota_fiscal, hotel_id, ordem_pagamento_id, created_at)
values ('40340000-0000-4000-8000-000000000001','2026.0705.1100.0003','danfe/demo-fatura-1.pdf',
  '40010000-0000-4000-8000-000000000001','40330000-0000-4000-8000-000000000001', now() - interval '40 days')
on conflict (id) do nothing;

insert into hospedagem_servico (
  id, emp_proprietaria_id, codigo, checkin_date, checkout_date, coletivo,
  finalizado, quant_ocupantes, custo_entidade, fatura_id, hotel_id, created_at
) values (
  '40310000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
  '2026.0628.1000.0002', date '2026-06-28', date '2026-06-30', false,
  true, 1, 120.00,'40340000-0000-4000-8000-000000000001','40010000-0000-4000-8000-000000000001',
  now() - interval '45 days')
on conflict (id) do nothing;

-- ===========================================================================
-- Depois de rodar, capture com:  node scripts/manual-prints.mjs
-- Conferências:
--   select count(*) from hospedagem_hotel_contas where hotel_id='40010000-0000-4000-8000-000000000001' and ativo; -- 2
--   select count(*) from hospedagem_servico where hotel_id='40010000-0000-4000-8000-000000000001' and finalizado=false; -- 1
--   select situacao from ordens_pagamento where id='40330000-0000-4000-8000-000000000001'; -- Paga
--   select acordo_vigencia_inicio from hospedagem_hotel where id='40010000-0000-4000-8000-000000000001'; -- 2026-01-01
-- ===========================================================================
