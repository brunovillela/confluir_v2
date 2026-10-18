-- Confluir — Faltas justificadas: Pessoal + Meu perfil (2026-10-02)
--
-- As tabelas vieram do Bubble na migração ("Pessoal - Faltas justificadas" e
-- "... - período", 480 faltas e 5 períodos), mas sem tela. Este script:
--   1. corrige as 480 faltas que vieram SEM emp_proprietaria_id — com a RLS
--      tenant_isolation elas ficavam invisíveis para o painel (herdam a
--      entidade do período, que veio preenchida);
--   2. acrescenta à falta o que o fluxo novo precisa (recusa com motivo,
--      observação, quem pediu);
--   3. cria a configuração por entidade: limite de faltas no ANO (vigência do
--      período/ACT), no MÊS e na SEMANA — nulo = sem limite — e a lista de
--      tipos de justificativa;
--   4. liga a ausência gerada na autorização à falta (pessoal_ausencias.falta_id).
--
-- Padrão da casa: idempotente. Executar UMA VEZ no SQL Editor do Supabase.

-- 1) Entidade das faltas migradas -----------------------------------------------
update public.pessoal_faltas_justificadas f
   set emp_proprietaria_id = p.emp_proprietaria_id
  from public.pessoal_faltas_justificadas_periodo p
 where f.periodo_id = p.id
   and f.emp_proprietaria_id is null
   and p.emp_proprietaria_id is not null;

-- Sem período: a entidade do funcionário.
update public.pessoal_faltas_justificadas f
   set emp_proprietaria_id = u.emp_proprietaria_id
  from public.usuarios u
 where f.funcionario_id = u.id
   and f.emp_proprietaria_id is null
   and u.emp_proprietaria_id is not null;

-- 2) Campos do fluxo novo ---------------------------------------------------------
alter table public.pessoal_faltas_justificadas
  add column if not exists recusado boolean not null default false;
alter table public.pessoal_faltas_justificadas
  add column if not exists motivo_recusa text;
alter table public.pessoal_faltas_justificadas
  add column if not exists observacao text;
alter table public.pessoal_faltas_justificadas
  add column if not exists solicitado_por_id uuid references public.usuarios (id);
alter table public.pessoal_faltas_justificadas
  add column if not exists updated_at timestamptz;
-- `comprovacao` já existe (URL do CDN do Bubble nas migradas; caminho no
-- bucket 'pessoal' nas novas).

create index if not exists idx_faltas_justificadas_funcionario_data
  on public.pessoal_faltas_justificadas (funcionario_id, data_falta);

-- 3) Configuração por entidade ----------------------------------------------------
create table if not exists public.pessoal_faltas_config (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa (id),
  -- Nulo = sem limite.
  limite_ano integer check (limite_ano is null or limite_ano >= 0),
  limite_mes integer check (limite_mes is null or limite_mes >= 0),
  limite_semana integer check (limite_semana is null or limite_semana >= 0),
  -- Tipos de justificativa oferecidos (nulo = a lista padrão do sistema).
  tipos text[],
  updated_at timestamptz,
  atualizado_por_id uuid references public.usuarios (id)
);
create unique index if not exists ux_pessoal_faltas_config_emp
  on public.pessoal_faltas_config (emp_proprietaria_id);

alter table public.pessoal_faltas_config enable row level security;
drop policy if exists tenant_isolation on public.pessoal_faltas_config;
create policy tenant_isolation on public.pessoal_faltas_config for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.pessoal_faltas_config to authenticated;
drop trigger if exists set_emp_from_jwt on public.pessoal_faltas_config;
create trigger set_emp_from_jwt before insert on public.pessoal_faltas_config
  for each row execute function public.set_emp_from_jwt();

-- 4) Ausência gerada pela falta autorizada ---------------------------------------
alter table public.pessoal_ausencias
  add column if not exists falta_id uuid
    references public.pessoal_faltas_justificadas (id) on delete set null;

notify pgrst, 'reload schema';

-- Conferência:
--   select count(*) from pessoal_faltas_justificadas where emp_proprietaria_id is null;  -- 0
