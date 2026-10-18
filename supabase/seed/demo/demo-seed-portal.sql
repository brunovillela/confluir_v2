-- ===========================================================================
-- SEED DEMO — Portal do Associado (Roberto Alves Pereira)
-- ---------------------------------------------------------------------------
-- Popula os dados que o filiado de demonstração (CPF 11122233301, filiação
-- 77777777-…001, condição Ativo) enxerga no /portal, para os prints do manual.
--
-- Pré-requisitos JÁ existentes:
--   • demo-seed-filiados.sql .... Roberto já tem contato, endereço e os aceites
--     LGPD/desconto preenchidos → a página "Meu cadastro" e a "LGPD" já saem
--     completas. Nada a fazer aqui.
--   • demo-seed-comunicacao.sql . notícias do tenant → "Notícias" e o card de
--     notícias do Início já saem populados. Nada a fazer aqui.
--   • demo-seed-saude.sql ....... tipo (ad100000-…001) e profissional
--     (ad200000-…001) reutilizados abaixo.
--   • demo-seed-hospedagem.sql .. hotel (40010000-…001) e serviço
--     (40030000-…001) reutilizados abaixo.
--   • scripts/demo-interfaces-setup.mjs .. gravou user_metadata.cpf na conta
--     demo (necessário para o portal reconhecer o filiado).
--
-- Convenção: sem begin/commit (editor do Supabase), tudo idempotente
-- (on conflict do nothing). IDs de portal com prefixo 402…
-- Rodar UMA vez no SQL editor do tenant de demonstração.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1. AGENDA — próximos eventos (aplicativo=true, início futuro; só assim
--    aparecem no portal). Aparecem em /portal/agenda e no card do Início.
-- ---------------------------------------------------------------------------
insert into agenda (
  id, emp_proprietaria_id, atividade, local, inicio, termino, dia_todo, tipo, aplicativo
) values
  ('40210000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'Assembleia geral extraordinária','Auditório da Sede',
   current_date + interval '11 days' + interval '18 hours',
   current_date + interval '11 days' + interval '20 hours',
   false,'Assembleia', true),
  ('40210000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'Curso de qualificação profissional','Centro de Formação',
   current_date + interval '18 days' + interval '9 hours',
   current_date + interval '18 days' + interval '17 hours',
   false,'Curso', true),
  ('40210000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'Confraternização dos filiados','Clube dos Petroleiros',
   current_date + interval '25 days', null,
   true,'Evento social', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 2. HOSPEDAGEM — cupons do Roberto (escopados por filiado_id). Um aguardando
--    (botão Cancelar visível) e um reservado (tarifa aparece + serviço ligado).
-- ---------------------------------------------------------------------------
insert into hospedagem_cupom (
  id, check_in, sexo, cancelado, compareceu, aceita_quarto_coletivo,
  tarifa_hospede, servico_id, filiado_id, hotel_id, created_at
) values
  ('40220000-0000-4000-8000-000000000001',
   (current_date + interval '22 days')::date,'Masculino', false, null, false,
   null, null,
   '77777777-7777-4777-8777-000000000001','40010000-0000-4000-8000-000000000001',
   now() - interval '2 days'),
  ('40220000-0000-4000-8000-000000000002',
   (current_date + interval '40 days')::date,'Masculino', false, null, true,
   120.00, '40030000-0000-4000-8000-000000000001',
   '77777777-7777-4777-8777-000000000001','40010000-0000-4000-8000-000000000001',
   now() - interval '10 days')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3. SAÚDE — assistido ligado ao Roberto + um atendimento. observacao_aberta
--    traz APENAS texto administrativo (o relatório clínico nunca vai ao portal).
-- ---------------------------------------------------------------------------
insert into saude_assistidos (id, emp_proprietaria_id, nome, filiado_id)
values ('40230000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
        'Roberto Alves Pereira','77777777-7777-4777-8777-000000000001')
on conflict (id) do nothing;

insert into saude_atendimentos (
  id, emp_proprietaria_id, assistido_id, tipo_id, profissional_id, atendente_id,
  data_atendimento, observacao_aberta
) values
  ('40240000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   '40230000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001',
   'ad200000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',
   now() - interval '25 days',
   'Comparecimento confirmado. Orientações gerais entregues; retorno conforme necessidade.'),
  ('40240000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   '40230000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001',
   'ad200000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',
   now() - interval '90 days',
   'Atendimento de rotina. Sem pendências.')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4. OPOSIÇÃO — campanha aberta e com prazo VIGENTE (a do seed de representação
--    tem prazo de abril, já encerrado). Sem opositor do Roberto → o botão
--    "Registrar oposição" fica disponível no print.
-- ---------------------------------------------------------------------------
insert into oposicao_campanha (
  id, emp_proprietaria_id, codigo, nome, detalhe_desconto, prazo_inicio, prazo_fim,
  modo_formalizacao, situacao, created_at
) values (
  '40250000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'OPO-DEMO','Contribuição Assistencial — Campanha vigente',
  'Desconto de 1 dia de salário em folha',
  (current_date - interval '10 days')::date, (current_date + interval '20 days')::date,
  'tela','aberta', now() - interval '10 days')
on conflict (id) do nothing;

-- ===========================================================================
-- Depois de rodar, capture com:  node scripts/manual-prints.mjs
-- Conferências rápidas:
--   select count(*) from agenda where aplicativo = true and inicio >= now();          -- >= 3
--   select count(*) from hospedagem_cupom where filiado_id = '77777777-7777-4777-8777-000000000001';  -- 2
--   select count(*) from saude_atendimentos where assistido_id = '40230000-0000-4000-8000-000000000001';  -- 2
--   select count(*) from oposicao_campanha where situacao = 'aberta' and prazo_fim >= current_date;      -- >= 1
-- ===========================================================================
