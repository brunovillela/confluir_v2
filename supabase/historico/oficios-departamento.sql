-- ============================================================================
-- Ofícios por departamento (2026-09-18). Idempotente — rodar no SQL Editor,
-- DEPOIS de supabase/departamentos-ajustes.sql (sem ele, o sistema não lê quem
-- é de cada departamento e ninguém veria ofício algum).
--
-- Pedido do Bruno: só permitir ver os ofícios vinculados ao departamento do
-- usuário. Decisões dele:
-- • nova permissão `ferramentas_oficios_todos` ("Ofícios — todos os
--   departamentos") para quem vê os de todos (presidência, secretaria-geral);
-- • ofícios sem departamento só aparecem para quem tem essa permissão.
-- O departamento da pessoa vem de Institucional › Organização › Departamentos
-- (integrante ou coordenador). O ofício já tem `departamento_id`.
-- Ninguém recebe a permissão nova aqui: atribua em Usuários e permissões.
-- ============================================================================

alter table permissoes add column if not exists ferramentas_oficios_todos boolean;

create index if not exists idx_oficios_departamento
  on oficios (emp_proprietaria_id, departamento_id);

notify pgrst, 'reload schema';
