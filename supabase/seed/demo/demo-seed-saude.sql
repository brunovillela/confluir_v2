-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Saúde) — 2026-08-04
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/saude).
-- Rotas: hub /painel/saude · CAT /painel/saude/cat · CIPA /painel/saude/cipa/{id}
--        · Atendimento /painel/saude/atendimentos/{id}
--
-- ⚠️ SIGILO: este seed NUNCA cria conteúdo clínico. O atendimento fica na
-- situação "sem_relatorio" (NÃO inserimos linha em saude_atendimentos_relatorio),
-- então o relatório aparece VAZIO/sob controle. A trilha de acessos é semeada à
-- mão (leitura/gravação como "autor"). `observacao_aberta` traz só texto
-- administrativo. Requer SAUDE_RELATORIO_CHAVE no ambiente (já presente) para o
-- detalhe não cair em "sem_chave".
--
-- ACESSO: atendente_id = operador → motivo "autor" → o operador abre a página
-- (tem saude_atendimento) E enxerga o card do relatório (vazio) + a trilha.
--
-- MESMAS REGRAS: sem begin/commit; idempotente. emp EXPLÍCITO nas tenant-owned.
-- SEM emp: saude_atendimentos_relatorio e saude_atendimentos_acessos (por-pai).
-- Situações são TEXTO. empresa (CIPA) limpa por ID FIXO.
--
-- IDs FIXOS:
--   empresa CIPA f0f0f0f0-…008 · tipo ad100000-… · profissional ad200000-… ·
--   assistido ad300000-… · atendimento ad400000-… · acessos ad500000-… ·
--   CATs ad700000-… · reunião CIPA ad800000-… · representantes ad900000-…
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
delete from saude_atendimentos_acessos where atendimento_id in (
  select id from saude_atendimentos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from saude_atendimentos_relatorio where atendimento_id in (
  select id from saude_atendimentos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from saude_atendimentos   where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from saude_profissionais  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from saude_assistidos     where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from saude_atendimentos_tipos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from saude_cat            where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from saude_cipa_representantes where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from saude_cipa_agenda    where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from empresa where id = 'f0f0f0f0-0000-4000-8000-000000000008';

-- ---------------------------------------------------------------------------
-- 2) ATENDIMENTOS — tipo, profissional (= operador), assistido, atendimento.
--    SEM relatório cifrado (situação "sem_relatorio"). Trilha à mão.
-- ---------------------------------------------------------------------------
insert into saude_atendimentos_tipos (id, emp_proprietaria_id, nome)
values ('ad100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Medicina do Trabalho');

insert into saude_profissionais (
  id, emp_proprietaria_id, usuario_id, profissao, tipo_id, acesso_todos_tipos, inativo
) values (
  'ad200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222','Médico do Trabalho','ad100000-0000-4000-8000-000000000001', false, false);

insert into saude_assistidos (id, emp_proprietaria_id, nome, filiado_id)
values ('ad300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Ricardo Nunes Pereira','7f000000-0000-4000-8000-000000000001');

insert into saude_atendimentos (
  id, emp_proprietaria_id, assistido_id, tipo_id, profissional_id, atendente_id,
  data_atendimento, observacao_aberta
) values (
  'ad400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'ad300000-0000-4000-8000-000000000001','ad100000-0000-4000-8000-000000000001',
  'ad200000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222',
  date '2026-07-28',
  'Comparecimento confirmado. Encaminhamentos administrativos concluídos e orientações entregues. Retorno agendado para reavaliação em 30 dias.');

-- Trilha de acessos (append-only). Como "autor" (operador). SEM emp.
insert into saude_atendimentos_acessos (id, atendimento_id, usuario_id, acao, motivo, criado_em) values
  ('ad500000-0000-4000-8000-000000000001','ad400000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','gravacao','autor', now() - interval '6 days'),
  ('ad500000-0000-4000-8000-000000000002','ad400000-0000-4000-8000-000000000001','22222222-2222-4222-8222-222222222222','leitura','autor', now() - interval '2 days');

-- ---------------------------------------------------------------------------
-- 3) CAT — alguns registros (varia booleanos/tipos/municípios p/ os indicadores).
-- ---------------------------------------------------------------------------
insert into saude_cat (
  id, emp_proprietaria_id, numero_cat, data_acidente, trabalhador_nome,
  empregador_razao_social, tipo_acidente, local_municipio, local_uf,
  parte_atingida, cid10, houve_morte, afastamento_durante_tratamento,
  houve_internacao, descricao_truncada, filiado_id
) values
  ('ad700000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   '2026.0001', date '2026-06-10','João da Silva','Refinaria Modelo do Brasil S.A.',
   'Típico','Duque de Caxias','RJ','Mão direita','S61.0', false, true, false, false,
   '7f000000-0000-4000-8000-000000000001'),
  ('ad700000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   '2026.0002', date '2026-04-22','Maria Souza Ferreira','Refinaria Modelo do Brasil S.A.',
   'Trajeto','Niterói','RJ','Tornozelo esquerdo','S82.1', false, true, true, false,
   '7f000000-0000-4000-8000-000000000002'),
  ('ad700000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   '2025.0045', date '2025-11-05','Pedro Henrique Santos','Serviços Industriais Ltda',
   'Doença','Rio de Janeiro','RJ','Ombro direito','M75.1', false, true, false, false, null),
  ('ad700000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111',
   null, date '2024-08-15', null,'Empregador não identificado (migrado)',
   'Típico','Rio de Janeiro','RJ', null, null, false, false, false, true, null);

-- ---------------------------------------------------------------------------
-- 4) CIPA — empresa + reunião (convite) + 2 representantes com presença.
-- ---------------------------------------------------------------------------
insert into empresa (id, emp_proprietaria_id, nome_razao, nome_fantasia, cnpj_cpf)
values ('f0f0f0f0-0000-4000-8000-000000000008','11111111-1111-4111-8111-111111111111',
  'Refinaria Modelo do Brasil S.A. — Unidade REDUC','Refinaria Modelo (REDUC)','33.444.555/0002-47');

insert into saude_cipa_agenda (
  id, emp_proprietaria_id, empresa_id, data_reuniao, unidade, ordinaria, online,
  convite_recebido_em, situacao, assuntos
) values (
  'ad800000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'f0f0f0f0-0000-4000-8000-000000000008', date '2026-07-15','Unidade REDUC', true, false,
  date '2026-07-01','compareceu',
  'Análise de riscos da área de processo; investigação de quase-acidente; cronograma da SIPAT 2026.');

insert into saude_cipa_representantes (id, emp_proprietaria_id, reuniao_id, nome, compareceu) values
  ('ad900000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'ad800000-0000-4000-8000-000000000001','Carlos Andrade da Silva', true),
  ('ad900000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'ad800000-0000-4000-8000-000000000001','Mariana Costa Ribeiro', false);

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs.
--   select count(*) from saude_cat where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 4
-- ===========================================================================
