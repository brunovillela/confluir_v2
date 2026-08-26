-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Ferramentas) — 2026-08-03
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/ferramentas),
-- presos ao tenant demo (emp_proprietaria_id = 11111111-…). Cobre:
--   demandas (/painel/ferramentas/demandas) · documentos · ofício rascunho.
--   (O hub /painel/ferramentas é estático — não precisa de dado.)
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; idempotente.
-- emp_proprietaria_id EXPLÍCITO nas tenant-owned. EXCEÇÃO:
-- `fa_documentos_categorias_junction` NÃO tem emp (por-pai via documento_id).
-- Booleans: tarefa.concluido, anomalia.*, integrante.pode_assinar.
-- Situações/tipos são TEXTO livre validado no app.
--
-- DIRETORIA: criamos um mandato vigente + 1 integrante SÓ para o ofício ter
-- signatário (assinante_integrante_id → diretoria_integrantes). Quando o seed
-- de Institucional (diretoria) rodar, ele gerencia a diretoria própria; a
-- limpeza aqui é por ID FIXO para não colidir.
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   operador .......... 22222222-2222-4222-8222-222222222222
--   demandas fe100000-…  tarefas fe200000-…  anomalias fe300000-…
--   documentos fe400000-…  categorias fe500000-…
--   mandato fe600000-…  integrante fe700000-…  ofício fe800000-…
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
delete from demandas_check_tarefas where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from ferramentas_anomalias   where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from demandas                 where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from fa_documentos_categorias_junction where documento_id in (
  select id from fa_documentos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from fa_documentos            where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from fa_documentos_categorias where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from oficios                  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from diretoria_integrantes    where mandato_id = 'fe600000-0000-4000-8000-000000000001';
delete from diretoria_mandatos       where id = 'fe600000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 2) Diretoria mínima (mandato vigente + 1 integrante) para o signatário.
-- ---------------------------------------------------------------------------
insert into diretoria_mandatos (id, emp_proprietaria_id, mandato, data_inicio, data_termino)
values ('fe600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Gestão 2025–2028', date '2025-01-01', date '2028-12-31');

insert into diretoria_integrantes (id, emp_proprietaria_id, mandato_id, nome, cargo, ordem, pode_assinar)
values ('fe700000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'fe600000-0000-4000-8000-000000000001','Carlos Andrade da Silva','Presidente', 1, true);

-- ---------------------------------------------------------------------------
-- 3) Ofício em RASCUNHO (destinatário, assunto, corpo, signatário).
-- ---------------------------------------------------------------------------
insert into oficios (
  id, emp_proprietaria_id, tipo, situacao, destinatario_texto, assunto, corpo,
  assinante_integrante_id
) values (
  'fe800000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'manual','Rascunho',
  'Ilustríssimo Senhor Diretor da Refinaria Modelo do Brasil S.A.',
  'Solicitação de reunião sobre o Acordo Coletivo de Trabalho 2026',
  'Vimos, por meio deste, solicitar o agendamento de reunião para tratar da pauta de reivindicações e das cláusulas do Acordo Coletivo de Trabalho referente ao ano de 2026. Colocamo-nos à disposição para definir a melhor data.',
  'fe700000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- 4) Demandas (situações variadas p/ os cards) + anomalia + tarefas.
-- ---------------------------------------------------------------------------
insert into demandas (id, emp_proprietaria_id, nome, descricao, situacao, prazo, membro_responsavel_id) values
  ('fe100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'Renovação do convênio médico','Negociar e renovar o convênio médico dos filiados','Fazendo', date '2026-09-30','22222222-2222-4222-8222-222222222222'),
  ('fe100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'Campanha de sindicalização 2026','Ações para ampliar a base de filiados','A fazer', date '2026-10-15','22222222-2222-4222-8222-222222222222'),
  ('fe100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'Auditoria da tesouraria','Revisão das contas do 1º semestre','Feito', date '2026-07-31','22222222-2222-4222-8222-222222222222');

insert into ferramentas_anomalias (
  id, emp_proprietaria_id, fato, descricao_detalhada, data_ocorrencia, responsavel_id,
  anomalia_investigada, anomalia_tratada, eficacia_verificada
) values (
  'fe300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Divergência no fechamento do caixa de junho','Diferença de R$ 100,00 no acerto do caixa da sede',
  date '2026-06-30','22222222-2222-4222-8222-222222222222', false, false, false);

insert into demandas_check_tarefas (
  id, emp_proprietaria_id, titulo, concluido, data_prazo_entrega, demandado_id, demanda_id, anomalia_id
) values
  ('fe200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'Solicitar 3 propostas de operadoras de saúde', false, date '2026-09-10','22222222-2222-4222-8222-222222222222',
   'fe100000-0000-4000-8000-000000000001', null),
  ('fe200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'Conferir os extratos bancários de junho', false, date '2026-08-15','22222222-2222-4222-8222-222222222222',
   null, 'fe300000-0000-4000-8000-000000000001');

-- ---------------------------------------------------------------------------
-- 5) Documentos por categoria (bubble_id é a chave de junção das versões).
-- ---------------------------------------------------------------------------
insert into fa_documentos_categorias (id, emp_proprietaria_id, nome) values
  ('fe500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Atas e regimentos'),
  ('fe500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Convênios');

insert into fa_documentos (id, emp_proprietaria_id, bubble_id, documento, modified_at) values
  ('fe400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','demo-doc-1','Estatuto Social', now() - interval '120 days'),
  ('fe400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','demo-doc-2','Regimento Interno', now() - interval '90 days'),
  ('fe400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','demo-doc-3','Convênio Médico — Vigência 2026', now() - interval '30 days');

insert into fa_documentos_categorias_junction (documento_id, categoria_id) values
  ('fe400000-0000-4000-8000-000000000001','fe500000-0000-4000-8000-000000000001'),
  ('fe400000-0000-4000-8000-000000000002','fe500000-0000-4000-8000-000000000001'),
  ('fe400000-0000-4000-8000-000000000003','fe500000-0000-4000-8000-000000000002');

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs.
--   select count(*) from demandas where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 3
-- ===========================================================================
