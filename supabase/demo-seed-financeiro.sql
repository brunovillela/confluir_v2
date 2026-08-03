-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Financeiro) — 2026-08-02
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/financeiro),
-- presos ao tenant demo (emp_proprietaria_id = 11111111-…). Reaproveita a
-- empresa/tenant e o operador (demo@confluir.local) do seed do Pessoal.
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; cada INSERT é
-- autossuficiente; idempotente (apaga os dados demo do módulo e reinsere);
-- TODA tabela tenant-owned recebe `emp_proprietaria_id = demo` EXPLÍCITO
-- (senão o trigger set_emp_from_jwt marca com o tenant real e some da demo).
--
-- Situações são TEXTO livre (não enum). Colunas boolean: autorizacao_esta_
-- autorizado, excluido (ordens); usavel (centros); ativa (caixa).
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   operador .......... 22222222-2222-4222-8222-222222222222
--   fornecedor ........ f0f0f0f0-0000-4000-8000-000000000002
--   centros de custo .. cc000000-0000-4000-8000-00000000000N
--   caixa ............. ca100000-0000-4000-8000-000000000001
--   ordens ............ ee000000-0000-4000-8000-00000000000N
-- ===========================================================================

-- 0) Garante a empresa/tenant demo (não apaga se já existir).
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('11111111-1111-4111-8111-111111111111',
  'Sindicato Demonstração (dados fictícios)', 'Confluir Demo', '00.000.000/0001-91', null)
on conflict (id) do nothing;
insert into tenants (empresa_id, slug, status)
values ('11111111-1111-4111-8111-111111111111', 'demo', 'trial')
on conflict (empresa_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1) LIMPEZA dos dados de FINANCEIRO da demo (filhos antes dos pais).
-- ---------------------------------------------------------------------------
delete from caixa_movimentacoes
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from caixa_contas
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from ordens_pagamento
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from centros_de_custo
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from empresa
  where id = 'f0f0f0f0-0000-4000-8000-000000000002';

-- ---------------------------------------------------------------------------
-- 2) Fornecedor fictício (favorecido das ordens)
-- ---------------------------------------------------------------------------
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('f0f0f0f0-0000-4000-8000-000000000002',
  'Gráfica Modelo Comércio e Serviços Ltda', 'Gráfica Modelo',
  '22.333.444/0001-55', '11111111-1111-4111-8111-111111111111');

-- ---------------------------------------------------------------------------
-- 3) Centros de custo (plano de contas do tenant). usavel = true → "Usável".
-- ---------------------------------------------------------------------------
insert into centros_de_custo (
  id, emp_proprietaria_id, nome_da_conta, acesso, classificador, tipo_da_conta, usavel
) values
  ('cc000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'Despesas Administrativas','1.1','Despesa','Administrativa', true),
  ('cc000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'Serviços de Terceiros','1.2','Despesa','Serviços', true),
  ('cc000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'Material de Escritório','1.3','Despesa','Material', true),
  ('cc000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111',
   'Despesas com Pessoal','1.4','Despesa','Pessoal', true),
  ('cc000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111',
   'Receitas de Contribuição','2.1','Receita','Contribuição', true);

-- ---------------------------------------------------------------------------
-- 4) Ordens de pagamento. A #1 fica "Em autorização" (é o print do detalhe).
--    autorizacao_esta_autorizado / excluido são BOOLEAN.
-- ---------------------------------------------------------------------------
insert into ordens_pagamento (
  id, emp_proprietaria_id, codigo, descricao, tipo, situacao,
  valor_inicial_cobranca, valor_pago, vencimento, data_pagamento,
  fornecedor_id, centro_custo_despesa_id,
  autorizacao_esta_autorizado, autorizacao_data, autorizacao_autorizador_id,
  excluido, created_at
) values
  ('ee000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'OP-2026-001','Impressão de materiais gráficos para a campanha','Despesa avulsa','Em autorização',
   2500.00, null, date '2026-08-20', null,
   'f0f0f0f0-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000002',
   false, null, null, false, now() - interval '2 days'),
  ('ee000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'OP-2026-002','Aquisição de material de escritório','Despesa avulsa','Paga',
   1800.00, 1800.00, date '2026-07-25', date '2026-07-24',
   'f0f0f0f0-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000003',
   true, date '2026-07-23', '22222222-2222-4222-8222-222222222222', false, now() - interval '20 days'),
  ('ee000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'OP-2026-003','Serviço de manutenção predial','Despesa avulsa','A pagar',
   900.00, null, date '2026-08-30', null,
   'f0f0f0f0-0000-4000-8000-000000000002','cc000000-0000-4000-8000-000000000001',
   true, date '2026-08-01', '22222222-2222-4222-8222-222222222222', false, now() - interval '5 days');

-- ---------------------------------------------------------------------------
-- 5) Caixa (conta aberta) + movimentação. Saldo = soma dos aportes menos os
--    débitos, só das linhas 'confirmada'. Aqui: 5000 - 1200 - 350 - 100 = 3350.
-- ---------------------------------------------------------------------------
insert into caixa_contas (
  id, emp_proprietaria_id, responsavel_usuario_id, nome, situacao, ativa
) values (
  'ca100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','Caixa Sede','aberta', true
);

insert into caixa_movimentacoes (
  id, emp_proprietaria_id, conta_id, tipo, situacao, valor, descricao, confirmada_em, created_at
) values
  ('ca200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'ca100000-0000-4000-8000-000000000001','aporte','confirmada', 5000.00,
   'Aporte inicial do caixa', now() - interval '25 days', now() - interval '25 days'),
  ('ca200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'ca100000-0000-4000-8000-000000000001','compra','confirmada', 1200.00,
   'Compra de material de escritório', now() - interval '15 days', now() - interval '15 days'),
  ('ca200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'ca100000-0000-4000-8000-000000000001','compra','confirmada', 350.00,
   'Serviço de manutenção', now() - interval '8 days', now() - interval '8 days'),
  ('ca200000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111',
   'ca100000-0000-4000-8000-000000000001','acerto','confirmada', 100.00,
   'Acerto de caixa', now() - interval '3 days', now() - interval '3 days');

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs
-- (SHOTS ajustados para Financeiro).
--   select situacao, count(*) from ordens_pagamento
--     where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111' group by 1;
-- ===========================================================================
