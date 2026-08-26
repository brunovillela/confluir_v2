-- Confluir — SEED do tenant de DEMONSTRAÇÃO (Perfis de acesso) — 2026-08-24
--
-- Torna os prints do RBAC determinísticos: os perfis de fábrica de
-- perfis-acesso.sql nascem com uuid ALEATÓRIO, então aqui fixamos UM perfil
-- (Financeiro / Tesouraria) com id conhecido no tenant demo, com suas chaves, e
-- o atribuímos ao usuário demo — assim o print do editor de chaves tem uma rota
-- estável e a resolução (resolverPermissoes) tem o que compor.
--
-- MESMAS REGRAS dos demais seeds: idempotente; emp_proprietaria_id = demo
-- EXPLÍCITO. PRÉ-REQUISITO: rodar supabase/perfis-acesso.sql antes.
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   usuário demo ...... 22222222-2222-4222-8222-222222222222
--   perfil (demo) ..... a0510000-0000-4000-8000-000000000001
--   vínculo ........... a0520000-0000-4000-8000-000000000001
-- ===========================================================================

insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('11111111-1111-4111-8111-111111111111',
  'Sindicato Demonstração (dados fictícios)', 'Confluir Demo', '00.000.000/0001-91', null)
on conflict (id) do nothing;
insert into tenants (empresa_id, slug, status)
values ('11111111-1111-4111-8111-111111111111', 'demo', 'trial')
on conflict (empresa_id) do nothing;

-- Limpeza: remove o vínculo demo e o perfil "Financeiro / Tesouraria" do tenant
-- demo (seja o de id fixo, seja o de fábrica com id aleatório e mesmo nome).
delete from usuario_perfis
  where id = 'a0520000-0000-4000-8000-000000000001';
delete from perfis
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111'
    and nome = 'Financeiro / Tesouraria';

-- Perfil com id fixo (marca de fábrica p/ o badge; alçada 0 = lança sem alçada).
insert into perfis (
  id, emp_proprietaria_id, nome, descricao, alcada_aprovacao,
  concede_tudo, sistema, ativo, ordem
) values (
  'a0510000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Financeiro / Tesouraria',
  'Ordens, caixa, centros de custo e lançamento de custeio',
  0, false, true, true, 3
);

insert into perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select 'a0510000-0000-4000-8000-000000000001',
       '11111111-1111-4111-8111-111111111111', c.chave
from (values
  ('financeiro_caixa'), ('financeiro_caixa_admin'), ('financeiro_pagamento'),
  ('financeiro_centro_custo'), ('financeiro_receitas_sindicais'),
  ('financeiro_tributos'), ('financeiro_apoio'),
  ('custeio_institucional'), ('custeio_institucional_edicao')
) as c(chave);

-- Atribui o perfil ao usuário demo (só se ele existir — evita erro de FK).
insert into usuario_perfis (id, usuario_id, perfil_id, emp_proprietaria_id)
select 'a0520000-0000-4000-8000-000000000001', u.id,
       'a0510000-0000-4000-8000-000000000001',
       '11111111-1111-4111-8111-111111111111'
from usuarios u
where u.id = '22222222-2222-4222-8222-222222222222';

-- ===========================================================================
-- Print determinístico do editor:
--   /painel/institucional/usuarios/perfis/a0510000-0000-4000-8000-000000000001
-- ===========================================================================
