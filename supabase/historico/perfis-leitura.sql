-- Confluir — Permissões de leitura (ver × editar), Fase 1 — 2026-08-24
--
-- Introduz "somente leitura" onde não existia: Financeiro e Patrimônio (as
-- únicas áreas que o Conselho Fiscal audita e que tinham flag única = agir).
-- As telas dessas áreas passam a aceitar a flag de leitura como VISÃO; a
-- ESCRITA continua exigindo as flags de operação (financeiro_pagamento/
-- financeiro_caixa, patrimonio_geral) — nenhuma action foi afrouxada.
--
-- Também preenche o perfil de fábrica "Conselho Fiscal (leitura)" (que nasceu
-- vazio em perfis-acesso.sql) com o pacote de leitura. Contratos e Custeio já
-- têm a base como só-leitura (a escrita exige _edicao/_autorizacao — auditado).
--
-- Idempotente. Não precisa re-rodar rls-emp-todas.sql (só adiciona colunas a
-- `permissoes`, tabela já coberta). PRÉ-REQUISITO: perfis-acesso.sql.

-- 1) Colunas novas no catálogo de permissões -------------------------------
alter table public.permissoes
  add column if not exists financeiro_leitura boolean default false;
alter table public.permissoes
  add column if not exists patrimonio_leitura boolean default false;

-- Admins (quem já tem usuario_id) enxergam tudo — inclui as leituras novas.
update public.permissoes
  set financeiro_leitura = true, patrimonio_leitura = true
  where usuario_id is not null;

-- 2) Preenche o perfil "Conselho Fiscal (leitura)" por tenant --------------
insert into public.perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select pf.id, pf.emp_proprietaria_id, c.chave
from public.perfis pf
join (values
  ('financeiro_leitura'),
  ('patrimonio_leitura'),
  ('aquisicoes_contratos'),   -- base = só leitura (escrita exige _edicao)
  ('custeio_institucional')   -- base = só leitura (escrita exige _edicao/_autorizacao)
) as c(chave) on true
where pf.nome = 'Conselho Fiscal (leitura)'
  and not exists (
    select 1 from public.perfil_permissoes pp
    where pp.perfil_id = pf.id and pp.chave = c.chave
  );

-- ===========================================================================
-- Conferência:
--   select pf.nome, count(pp.*) from perfis pf
--     left join perfil_permissoes pp on pp.perfil_id = pf.id
--     where pf.nome = 'Conselho Fiscal (leitura)' group by pf.id;
-- ===========================================================================
