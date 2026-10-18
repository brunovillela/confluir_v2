-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Jurídico) — 2026-08-04
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/juridico).
-- Rotas: hub /painel/juridico · homologações /painel/juridico/homologacoes ·
--        processo /painel/juridico/processos/{id} · reembolsos /painel/juridico/reembolsos
--
-- Reusa filiados já existentes no tenant demo (do seed de Hospedagem):
--   Ricardo 7f000000-…0001 · Vanessa 7f000000-…0002.
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; idempotente.
-- emp EXPLÍCITO nas tenant-owned (juridico_homologacoes/processos/reembolsos).
-- EXCEÇÃO: juridico_processos_filiados NÃO tem emp (por-pai via processo_id).
-- Status/tipo são TEXTO livre (grafia exata importa). outras_partes é text[].
-- Tabela compartilhada `empresa` limpa por ID FIXO.
--
-- IDs FIXOS:
--   escritório (empresa) f0f0f0f0-…007 · homologações a8100000-… ·
--   processo a8200000-…001 · reembolsos a8300000-…
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
delete from juridico_processos_filiados where processo_id in (
  select id from juridico_processos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from juridico_reembolsos   where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from juridico_processos    where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from juridico_homologacoes where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from empresa where id = 'f0f0f0f0-0000-4000-8000-000000000007';

-- ---------------------------------------------------------------------------
-- 2) Escritório de advocacia (favorecido dos reembolsos / assessoria).
-- ---------------------------------------------------------------------------
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('f0f0f0f0-0000-4000-8000-000000000007',
  'Advocacia Modelo Associados','Advocacia Modelo','77.888.999/0001-00','11111111-1111-4111-8111-111111111111');

-- ---------------------------------------------------------------------------
-- 3) Homologações (2 de filiado + 1 de não-filiado; motivos e anos variados).
-- ---------------------------------------------------------------------------
insert into juridico_homologacoes (
  id, emp_proprietaria_id, data, data_demissao, motivo, filiado_id,
  trabalhador_nao_filiado, trabalhador_nome, trabalhador_cpf, registrado_por_id
) values
  ('a8100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   date '2026-05-10', date '2026-04-30','Despedida sem justa causa','7f000000-0000-4000-8000-000000000001',
   false, null, null, '22222222-2222-4222-8222-222222222222'),
  ('a8100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   date '2026-03-15', date '2026-03-01','A pedido do empregado','7f000000-0000-4000-8000-000000000002',
   false, null, null, '22222222-2222-4222-8222-222222222222'),
  ('a8100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   date '2025-11-20', date '2025-11-10','Acordo empregado e empregador', null,
   true, 'Paulo Ribeiro dos Santos','12345678900','22222222-2222-4222-8222-222222222222');

-- ---------------------------------------------------------------------------
-- 4) Processo (Em andamento) + filiados vinculados (junção sem emp).
-- ---------------------------------------------------------------------------
insert into juridico_processos (
  id, emp_proprietaria_id, numero_processo, tipo, coletivo, status_processo, finalizado,
  data_abertura, parte_assessorada, outras_partes, assessoria_id, responsavel_id, registrado_por_id
) values (
  'a8200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '0012345-67.2026.5.01.0001','Trabalhista', false,'Em andamento', false,
  date '2026-02-10','Ricardo Nunes Pereira e outros',
  ARRAY['Refinaria Modelo do Brasil S.A.'],
  'f0f0f0f0-0000-4000-8000-000000000007','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222');

insert into juridico_processos_filiados (processo_id, filiado_id) values
  ('a8200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000001'),
  ('a8200000-0000-4000-8000-000000000001','7f000000-0000-4000-8000-000000000002');

-- ---------------------------------------------------------------------------
-- 5) Reembolsos do processo (1 aguardando na fila + 1 aprovado).
-- ---------------------------------------------------------------------------
insert into juridico_reembolsos (
  id, emp_proprietaria_id, processo_id, valor, descricao_despesa, data_despesa,
  situacao, solicitante_id, avaliador_id, avaliacao_data
) values
  ('a8300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'a8200000-0000-4000-8000-000000000001', 1200.00,'Custas processuais e diligências', date '2026-06-15',
   'aguardando','22222222-2222-4222-8222-222222222222', null, null),
  ('a8300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'a8200000-0000-4000-8000-000000000001', 450.00,'Cópias autenticadas e taxas', date '2026-05-20',
   'aprovado','22222222-2222-4222-8222-222222222222','22222222-2222-4222-8222-222222222222', now() - interval '20 days');

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs.
--   select count(*) from juridico_homologacoes where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 3
-- ===========================================================================
