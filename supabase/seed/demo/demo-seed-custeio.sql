-- Confluir — SEED do tenant de DEMONSTRAÇÃO (Custeio Institucional) — 2026-08-24
--
-- Dados 100% FICTÍCIOS para testar as telas e os prints do manual
-- (/painel/institucional/custeios), presos ao tenant demo
-- (emp_proprietaria_id = 11111111-…). Reaproveita a empresa/tenant e o operador
-- (demo@confluir.local) dos seeds de Pessoal/Financeiro.
--
-- MESMAS REGRAS dos demais seeds: sem begin/commit; cada INSERT é
-- autossuficiente; idempotente (apaga os dados demo do módulo e reinsere);
-- TODA tabela tenant-owned recebe `emp_proprietaria_id = demo` EXPLÍCITO
-- (senão o trigger set_emp_from_jwt marca com o tenant real e some da demo).
--
-- Esta versão SEMEIA a diretoria (mandato + integrante + ficha) e um filiado
-- reais, e AMARRA os custeios a eles (diretoria_integrante_id / filiacao_id) —
-- assim o seletor de beneficiário (autocomplete) também encontra dados. O
-- convidado tem cadastro próprio.
--
-- PRÉ-REQUISITO: rodar supabase/custeio-institucional.sql (tabelas) antes.
--
-- Nota de compatibilidade: UUID é HEXADECIMAL (0-9, a-f). Prefixos precisam ser
-- hex — por isso os custeios usam 'c057…' (custeio) e não 'cu…' (u não é hex).
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   operador .......... 22222222-2222-4222-8222-222222222222
--   centro de custo ... cc000000-0000-4000-8000-000000000010
--   finalidades ....... cf000000-0000-4000-8000-00000000000N
--   convidado ......... cd000000-0000-4000-8000-000000000001
--   mandato ........... d1a70000-0000-4000-8000-000000000001
--   integrante ........ d1a71000-0000-4000-8000-000000000001
--   ficha ............. d1a7f000-0000-4000-8000-000000000001
--   filiado ........... f1110000-0000-4000-8000-000000000001
--   custeios .......... c0570000-0000-4000-8000-00000000000N
--   ordens (custeio) .. eec00000-0000-4000-8000-00000000000N
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
-- 1) LIMPEZA dos dados de CUSTEIO da demo (filhos antes dos pais).
--    Custeios e ordens saem primeiro porque referenciam diretoria/filiado.
--    Diretoria/filiado são removidos só pelos IDs fixos deste seed.
-- ---------------------------------------------------------------------------
delete from ordens_pagamento
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111'
    and tipo = 'Custeio';
delete from institucional_custeios
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from institucional_custeio_finalidades
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from institucional_custeio_convidados
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from diretoria_ficha
  where integrante_id = 'd1a71000-0000-4000-8000-000000000001';
delete from diretoria_integrantes
  where id = 'd1a71000-0000-4000-8000-000000000001';
delete from diretoria_mandatos
  where id = 'd1a70000-0000-4000-8000-000000000001';
delete from filiacoes
  where id = 'f1110000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 2) Centro de custo do custeio (plano de contas do tenant demo).
-- ---------------------------------------------------------------------------
insert into centros_de_custo (
  id, emp_proprietaria_id, nome_da_conta, acesso, classificador, tipo_da_conta, usavel
) values (
  'cc000000-0000-4000-8000-000000000010','11111111-1111-4111-8111-111111111111',
  'Custeio Institucional','1.5','Despesa','Institucional', true
) on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Diretoria real (mandato + integrante + ficha com dados bancários).
-- ---------------------------------------------------------------------------
insert into diretoria_mandatos (
  id, emp_proprietaria_id, mandato, data_inicio, data_termino
) values (
  'd1a70000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Gestão 2024–2027', date '2024-01-01', date '2027-12-31'
);

insert into diretoria_integrantes (
  id, emp_proprietaria_id, mandato_id, nome, cargo, cpf, ordem, pode_assinar
) values (
  'd1a71000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'd1a70000-0000-4000-8000-000000000001',
  'Roberto Alves de Souza','Diretor Financeiro','321.654.987-00', 1, true
);

insert into diretoria_ficha (
  id, integrante_id, emp_proprietaria_id,
  banco, agencia, conta_corrente, pix, tipo_chave_pix
) values (
  'd1a7f000-0000-4000-8000-000000000001',
  'd1a71000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Caixa Econômica (104)','0987','112233-4','321.654.987-00','cpf'
);

-- ---------------------------------------------------------------------------
-- 4) Filiado real (para o beneficiário "demitido político").
-- ---------------------------------------------------------------------------
insert into filiacoes (
  id, emp_proprietaria_id, nome_completo, cpf, matricula_sindical, filiacao_excluida
) values (
  'f1110000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Carlos Eduardo Nogueira','456.789.123-00','MAT-2026-0456', false
);

-- ---------------------------------------------------------------------------
-- 5) Convidado externo (cadastro leve, com dados bancários).
-- ---------------------------------------------------------------------------
insert into institucional_custeio_convidados (
  id, emp_proprietaria_id, nome, cpf, email, telefone,
  banco, agencia, conta, tipo_conta, pix, tipo_chave_pix, observacoes
) values (
  'cd000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Dra. Helena Martins Carvalho','123.456.789-00','helena.martins@exemplo.org','(21) 99876-5432',
  'Banco do Brasil (001)','1234-5','67890-1','corrente','helena.martins@exemplo.org','email',
  'Especialista em saúde do trabalhador — palestra no seminário de SST.'
);

-- ---------------------------------------------------------------------------
-- 6) Finalidades (por tenant, com centro de custo padrão herdado).
-- ---------------------------------------------------------------------------
insert into institucional_custeio_finalidades (
  id, emp_proprietaria_id, nome, tipo_beneficiario_sugerido,
  centro_custo_despesa_id, ativa, ordem
) values
  ('cf000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'Diretor — atividade sindical','diretor',
   'cc000000-0000-4000-8000-000000000010', true, 1),
  ('cf000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'Demitido político','filiado',
   'cc000000-0000-4000-8000-000000000010', true, 2),
  ('cf000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'Convidado de evento','convidado',
   'cc000000-0000-4000-8000-000000000010', true, 3);

-- ---------------------------------------------------------------------------
-- 7) Custeios — um por situação, cobrindo os três beneficiários, amarrados
--    aos registros reais (diretoria_integrante_id / filiacao_id / convidado_id).
--    #1 diretor, AUTORIZADO e recorrente (gera 3 ordens na seção 8);
--    #2 convidado, AGUARDANDO AUTORIZAÇÃO (mostra o botão de autorizar);
--    #3 filiado demitido político, RASCUNHO (mostra o fluxo inicial).
-- ---------------------------------------------------------------------------
insert into institucional_custeios (
  id, emp_proprietaria_id, codigo, finalidade_id,
  tipo_beneficiario, diretoria_integrante_id, filiacao_id, convidado_id,
  beneficiario_nome, beneficiario_cpf, banco, agencia, conta, tipo_conta,
  pix, tipo_chave_pix, descricao, evento, centro_custo_despesa_id,
  cadencia, valor_parcela, num_parcelas, periodicidade, primeiro_vencimento,
  forma_pagamento, situacao, criado_por_id, autorizador_id, autorizado_em,
  excluido, created_at
) values
  -- #1 Diretor — autorizado, recorrente (3 parcelas mensais)
  ('c0570000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'CUST-2026.0810.0930.1501','cf000000-0000-4000-8000-000000000001',
   'diretor','d1a71000-0000-4000-8000-000000000001', null, null,
   'Roberto Alves de Souza','321.654.987-00','Caixa Econômica (104)','0987','112233-4','corrente',
   '321.654.987-00','cpf','Ajuda de custo mensal para atuação sindical na base de Macaé.',
   null,'cc000000-0000-4000-8000-000000000010',
   'recorrente', 1500.00, 3, 'mensal', date '2026-09-05',
   'Transferência','autorizado','22222222-2222-4222-8222-222222222222',
   '22222222-2222-4222-8222-222222222222', now() - interval '10 days',
   false, now() - interval '12 days'),
  -- #2 Convidado — aguardando autorização, pontual
  ('c0570000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'CUST-2026.0822.1412.3377','cf000000-0000-4000-8000-000000000003',
   'convidado', null, null, 'cd000000-0000-4000-8000-000000000001',
   'Dra. Helena Martins Carvalho','123.456.789-00','Banco do Brasil (001)','1234-5','67890-1','corrente',
   'helena.martins@exemplo.org','email',
   'Custeio de passagem e hospedagem para palestra no seminário de SST.',
   'Seminário de Saúde e Segurança do Trabalho 2026','cc000000-0000-4000-8000-000000000010',
   'pontual', 3200.00, 1, 'unica', date '2026-09-15',
   'Transferência','aguardando_autorizacao','22222222-2222-4222-8222-222222222222',
   null, null, false, now() - interval '2 days'),
  -- #3 Filiado demitido político — rascunho, pontual
  ('c0570000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'CUST-2026.0824.1105.0912','cf000000-0000-4000-8000-000000000002',
   'filiado', null, 'f1110000-0000-4000-8000-000000000001', null,
   'Carlos Eduardo Nogueira','456.789.123-00','Bradesco (237)','4455','778899-0','corrente',
   null,null,'Auxílio a filiado demitido em razão de atividade sindical, sob apuração.',
   null,'cc000000-0000-4000-8000-000000000010',
   'pontual', 2000.00, 1, 'unica', date '2026-09-10',
   'Transferência','rascunho','22222222-2222-4222-8222-222222222222',
   null, null, false, now() - interval '1 days');

-- ---------------------------------------------------------------------------
-- 8) Ordens de pagamento do custeio #1 (como se geradas na autorização).
--    tipo 'Custeio'; favorecido AVULSO (diretor sem conta em usuarios);
--    centro de custo herdado. Situações variadas para o print da lente no
--    Financeiro: parcela 1 Paga, 2 A pagar, 3 Em autorização.
-- ---------------------------------------------------------------------------
insert into ordens_pagamento (
  id, emp_proprietaria_id, codigo, descricao, tipo, situacao,
  valor_inicial_cobranca, valor_pago, vencimento, data_pagamento,
  beneficiario_nome_avulso, beneficiario_doc_avulso,
  centro_custo_despesa_id, custeio_id,
  autorizacao_esta_autorizado, autorizacao_data, autorizacao_autorizador_id,
  excluido, created_at
) values
  ('eec00000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'CUST-2026.0810.0930.1501-1',
   'Ajuda de custo mensal para atuação sindical na base de Macaé. — parcela 1/3 (venc. 05/09/2026)',
   'Custeio','Paga', 1500.00, 1500.00, date '2026-09-05', date '2026-09-04',
   'Roberto Alves de Souza','321.654.987-00',
   'cc000000-0000-4000-8000-000000000010','c0570000-0000-4000-8000-000000000001',
   true, date '2026-09-01', '22222222-2222-4222-8222-222222222222',
   false, now() - interval '10 days'),
  ('eec00000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'CUST-2026.0810.0930.1501-2',
   'Ajuda de custo mensal para atuação sindical na base de Macaé. — parcela 2/3 (venc. 05/10/2026)',
   'Custeio','A pagar', 1500.00, null, date '2026-10-05', null,
   'Roberto Alves de Souza','321.654.987-00',
   'cc000000-0000-4000-8000-000000000010','c0570000-0000-4000-8000-000000000001',
   true, date '2026-09-01', '22222222-2222-4222-8222-222222222222',
   false, now() - interval '10 days'),
  ('eec00000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'CUST-2026.0810.0930.1501-3',
   'Ajuda de custo mensal para atuação sindical na base de Macaé. — parcela 3/3 (venc. 05/11/2026)',
   'Custeio','Em autorização', 1500.00, null, date '2026-11-05', null,
   'Roberto Alves de Souza','321.654.987-00',
   'cc000000-0000-4000-8000-000000000010','c0570000-0000-4000-8000-000000000001',
   false, null, null, false, now() - interval '10 days');

-- ===========================================================================
-- Conferência rápida:
--   select situacao, count(*) from institucional_custeios
--     where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111' group by 1;
--   select codigo, situacao, valor_inicial_cobranca from ordens_pagamento
--     where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111'
--       and tipo = 'Custeio' order by vencimento;
-- ===========================================================================
