-- Confluir — Perfil padrão de onboarding (2026-08-24)
--
-- Marca UM perfil por tenant como o padrão atribuído automaticamente a quem
-- entra pelo convite em lote (onboardingEmLote). Mantém o menor privilégio: o
-- default é NENHUM — o admin escolhe qual perfil é o padrão na tela de Perfis
-- (ou deixa sem, e o convidado entra só com o autosserviço, como hoje).
--
-- Complementa supabase/perfis-acesso.sql. Idempotente. Não precisa re-rodar o
-- rls-emp-todas.sql (só adiciona coluna a uma tabela já coberta).

alter table public.perfis
  add column if not exists padrao_onboarding boolean not null default false;

-- No máximo um perfil padrão por tenant (índice parcial).
create unique index if not exists uq_perfis_padrao_por_tenant
  on public.perfis (emp_proprietaria_id)
  where padrao_onboarding;
