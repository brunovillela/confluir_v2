-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Institucional) — 2026-08-03
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/institucional).
-- Rotas capturadas:
--   hub        → /painel/institucional (estático, sem dado)
--   diretoria  → /painel/institucional/diretoria/fe600000-…  (integrantes + atas)
--   usuários   → /painel/institucional/usuarios/{permissoes.id do operador}
--   ajudas     → /painel/institucional/ajudas
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; idempotente.
-- REAPROVEITA a diretoria criada pelo seed de Ferramentas (mandato fe600000 +
-- integrante Carlos fe700000…001): garante que existam (on conflict do nothing)
-- e ADICIONA 2 integrantes + 2 atas. A limpeza NÃO apaga o mandato nem o Carlos
-- (para não quebrar o signatário do ofício de Ferramentas).
-- reuniao_ata.tipo é text com CHECK (diretoria|conselho_fiscal|assembleia|outra);
-- 'deliberacoes' é sem acento. apoio_institucional/entidade_apoiada são BOOLEAN.
-- Tabelas compartilhadas (empresa, contratos) limpas por ID FIXO.
--
-- IDs FIXOS:
--   mandato ........... fe600000-0000-4000-8000-000000000001 (de Ferramentas)
--   integrantes ....... fe700000-…001 (Carlos, de Ferramentas) …002 …003
--   atas .............. a7000000-…  entidade apoiada f0f0f0f0-…006  ajuda c1100000-…003
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
-- 1) LIMPEZA (só o que este seed cria; preserva mandato fe600000 e Carlos).
-- ---------------------------------------------------------------------------
delete from reuniao_ata where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from diretoria_integrantes where id in (
  'fe700000-0000-4000-8000-000000000002','fe700000-0000-4000-8000-000000000003');
delete from contratos where id = 'c1100000-0000-4000-8000-000000000003';
delete from empresa where id = 'f0f0f0f0-0000-4000-8000-000000000006';

-- ---------------------------------------------------------------------------
-- 2) Garante o mandato + Carlos (idempotente; existem se Ferramentas rodou).
-- ---------------------------------------------------------------------------
insert into diretoria_mandatos (id, emp_proprietaria_id, mandato, data_inicio, data_termino)
values ('fe600000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Gestão 2025–2028', date '2025-01-01', date '2028-12-31')
on conflict (id) do nothing;

insert into diretoria_integrantes (id, emp_proprietaria_id, mandato_id, nome, cargo, ordem, pode_assinar)
values ('fe700000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'fe600000-0000-4000-8000-000000000001','Carlos Andrade da Silva','Presidente', 1, true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 3) Mais integrantes do mandato.
-- ---------------------------------------------------------------------------
insert into diretoria_integrantes (id, emp_proprietaria_id, mandato_id, nome, cargo, ordem, pode_assinar) values
  ('fe700000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'fe600000-0000-4000-8000-000000000001','Mariana Costa Ribeiro','Vice-Presidente', 2, true),
  ('fe700000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'fe600000-0000-4000-8000-000000000001','José Pereira Lima','Tesoureiro', 3, false);

-- ---------------------------------------------------------------------------
-- 4) Atas de reunião ancoradas no mandato.
-- ---------------------------------------------------------------------------
insert into reuniao_ata (
  id, emp_proprietaria_id, mandato_id, tipo, titulo, data, pauta, deliberacoes, presentes
) values
  ('a7000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'fe600000-0000-4000-8000-000000000001','diretoria','Reunião ordinária de julho/2026', date '2026-07-10',
   'Prestação de contas do 1º semestre; definição da pauta do ACT 2026',
   'Aprovada a prestação de contas; autorizada a diretoria a negociar o ACT',
   E'Carlos Andrade da Silva\nMariana Costa Ribeiro\nJosé Pereira Lima'),
  ('a7000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'fe600000-0000-4000-8000-000000000001','conselho_fiscal','Parecer do Conselho Fiscal — maio/2026', date '2026-06-15',
   'Análise das contas de maio/2026',
   'Contas aprovadas sem ressalvas',
   E'Membros do Conselho Fiscal');

-- ---------------------------------------------------------------------------
-- 5) Entidade apoiada (empresa) + ajuda (contrato com apoio_institucional).
-- ---------------------------------------------------------------------------
insert into empresa (
  id, emp_proprietaria_id, nome_razao, nome_fantasia, cnpj_cpf,
  entidade_apoiada, inativa, pessoa_juridica
) values (
  'f0f0f0f0-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111',
  'Associação Comunitária Novo Horizonte','Assoc. Novo Horizonte','66.777.888/0001-99',
  true, false, true);

insert into contratos (
  id, emp_proprietaria_id, codigo, objeto, valor, vigencia_inicio, vigencia_termino,
  apoio_institucional, ativo, deletado, fornecedor_id, created_at
) values (
  'c1100000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
  '2026.0301.1000.0003','Apoio institucional a projeto social da comunidade', 6000.00,
  date '2026-03-01', (now() + interval '200 days')::date,
  true, true, false, 'f0f0f0f0-0000-4000-8000-000000000006', now() - interval '150 days');

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs.
--   select count(*) from reuniao_ata where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 2
-- ===========================================================================
