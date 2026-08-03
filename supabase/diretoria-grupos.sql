-- ============================================================================
-- Diretoria: grupos de membros do mandato + vínculo do integrante à pessoa
-- (2026-07-22)
--
-- • Um mandato tem GRUPOS de membros (Diretoria Executiva, Colegiada, Conselho
--   Fiscal… configuráveis por mandato). Cada integrante pertence a um grupo.
-- • O integrante passa a ancorar na PESSOA pelo CPF: vincula-se a um filiado
--   (filiacao_id) e guarda o CPF. A partir do CPF o sistema cruza com
--   `filiacoes` (é filiado) e `usuarios` (tem conta / acesso ao painel).
--   Conceder acesso é o onboarding — aqui só cruzamos e mostramos o status.
--
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.
-- ============================================================================

create table if not exists diretoria_grupos (
  id uuid primary key default gen_random_uuid(),
  mandato_id uuid not null references diretoria_mandatos (id) on delete cascade,
  nome text not null,
  ordem integer not null default 0,
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diretoria_grupos_mandato
  on diretoria_grupos (mandato_id);

comment on table diretoria_grupos is
  'Grupos de membros de um mandato (Diretoria Executiva, Colegiada, Conselho Fiscal…). Configuráveis por mandato.';

alter table diretoria_integrantes
  add column if not exists grupo_id uuid references diretoria_grupos (id) on delete set null,
  add column if not exists filiacao_id uuid,   -- filiado vinculado (a pessoa)
  add column if not exists cpf text;           -- âncora da pessoa (só dígitos)

comment on column diretoria_integrantes.cpf is
  'CPF da pessoa (só dígitos) — âncora que cruza com filiacoes e usuarios.';

create index if not exists idx_diretoria_integrantes_cpf
  on diretoria_integrantes (cpf);
