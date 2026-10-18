-- ===========================================================================
-- SEED DEMO — Filiados (áreas extras: Receitas e Prontuários)
-- ---------------------------------------------------------------------------
-- Complementa demo-seed-filiados.sql para que as telas de RECEITAS (remessas de
-- recebimento de contribuições por fonte pagadora) e PRONTUÁRIOS (histórico do
-- filiado) saiam cheias nos prints. IMPORTAR não precisa de seed (a fonte
-- "Petro Fictícia" já preenche o select).
--
-- Pré-requisitos JÁ existentes (demo-seed-filiados.sql): fonte pagadora
-- "Petro Fictícia" f0f0f0f0-…0001; filiados 77777777-…0001..0006 (Ativos) com
-- seus CPFs. Autor dos apontamentos = usuario 22222222-…222 (Operador de
-- Demonstração). Tenant demo = 11111111-…111.
--
-- Convenção: sem begin/commit, idempotente (on conflict do nothing). IDs 60–63.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- RECEITAS — remessas de recebimento (ano/mes texto, ordem = ano*100+mes)
-- ---------------------------------------------------------------------------
insert into filiacao_recebe_remessa (id, emp_proprietaria_id, ano, mes, tipo, aberto, ordem) values
  ('60100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','2026','Maio','Associativa', true, 202605),
  ('60100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','2026','Abril','Assistencial', false, 202604)
on conflict (id) do nothing;

-- Lançamentos da remessa de Maio (um por filiado descontado na fonte Petro).
insert into filiacao_recebe (id, emp_proprietaria_id, remessa_id, fonte_pg_id, filiado_id, cpf, fonte_pg_matricula, valor) values
  ('61100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','60100000-0000-4000-8000-000000000001','f0f0f0f0-0000-4000-8000-000000000001','77777777-7777-4777-8777-000000000001','11122233301','2001', 45.00),
  ('61100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','60100000-0000-4000-8000-000000000001','f0f0f0f0-0000-4000-8000-000000000001','77777777-7777-4777-8777-000000000002','22233344402','2002', 52.30),
  ('61100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','60100000-0000-4000-8000-000000000001','f0f0f0f0-0000-4000-8000-000000000001','77777777-7777-4777-8777-000000000003','33344455503','2003', 38.90),
  ('61100000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','60100000-0000-4000-8000-000000000001','f0f0f0f0-0000-4000-8000-000000000001','77777777-7777-4777-8777-000000000004','44455566604','2004', 61.50),
  ('61100000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','60100000-0000-4000-8000-000000000001','f0f0f0f0-0000-4000-8000-000000000001','77777777-7777-4777-8777-000000000005','55566677705','2005', 47.80),
  ('61100000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','60100000-0000-4000-8000-000000000001','f0f0f0f0-0000-4000-8000-000000000001','77777777-7777-4777-8777-000000000006','66677788806','2006', 55.20)
on conflict (id) do nothing;

-- Comprovação do depósito da fonte na remessa de Maio (soma = 300,70) → faz a
-- coluna "Recebimento" virar badge verde no detalhe.
insert into filiacao_recebe_comprovacao (id, emp_proprietaria_id, remessa_id, fonte_pg_id, data, valor, comprovante) values
  ('62100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','60100000-0000-4000-8000-000000000001','f0f0f0f0-0000-4000-8000-000000000001', date '2026-06-05', 300.70, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- PRONTUÁRIOS — apontamentos (linha do tempo) de alguns filiados
-- ---------------------------------------------------------------------------
insert into filiacao_prontuario (id, emp_proprietaria_id, filiacao_id, data, tipo, descricao, diretor_funcionario_id) values
  ('63100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-000000000001', now() - interval '60 days','Atualização cadastral','Atualizou telefone e endereço pelo portal do associado.','22222222-2222-4222-8222-222222222222'),
  ('63100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-000000000001', now() - interval '30 days','Atendimento','Atendimento no plantão jurídico sobre dúvidas de rescisão.','22222222-2222-4222-8222-222222222222'),
  ('63100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-000000000001', now() - interval '10 days','Hospedagem','Reserva de hospedagem na Pousada Mar Azul.','22222222-2222-4222-8222-222222222222'),
  ('63100000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-000000000002', now() - interval '45 days','Homologação','Homologação de rescisão acompanhada pelo sindicato.','22222222-2222-4222-8222-222222222222'),
  ('63100000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','77777777-7777-4777-8777-000000000003', now() - interval '20 days','Atendimento','Orientação sobre a progressão de anuênios.','22222222-2222-4222-8222-222222222222')
on conflict (id) do nothing;

-- ===========================================================================
-- Depois de rodar, capture com:  node scripts/manual-prints.mjs
-- ===========================================================================
