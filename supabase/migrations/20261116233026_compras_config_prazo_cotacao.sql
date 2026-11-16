-- Confluir — Configuração de Aquisição da entidade: prazo para iniciar a cotação
--
-- POR QUÊ: solicitações Via Aquisição ficavam semanas esperando a cotação
-- começar (medição de 10/11/2026: 13 e 19 dias) sem ninguém perceber. A
-- entidade define em quantos dias úteis o comprador deve iniciar a cotação;
-- passado o prazo, o lembrete diário avisa os compradores e o coordenador do
-- departamento solicitante (16/11/2026).
--
-- COMO: compras_config, uma linha por entidade (a de RPA, compras_rpa_config,
-- é só das alíquotas). cotacao_prazo_dias_uteis null = sem prazo; sem linha,
-- vale o padrão da aplicação (3 dias úteis). RLS por tenant, set_emp_from_jwt
-- e auditoria. Idempotente.

create table if not exists public.compras_config (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  cotacao_prazo_dias_uteis integer check (cotacao_prazo_dias_uteis is null or cotacao_prazo_dias_uteis between 1 and 60),
  atualizado_por_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists compras_config_emp on public.compras_config (emp_proprietaria_id);

alter table public.compras_config enable row level security;
drop policy if exists tenant_isolation on public.compras_config;
create policy tenant_isolation on public.compras_config to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.compras_config;
create trigger set_emp_from_jwt before insert on public.compras_config
  for each row execute function public.set_emp_from_jwt();
drop trigger if exists auditoria_registrar on public.compras_config;
create trigger auditoria_registrar after insert or update or delete on public.compras_config
  for each row execute function public.registrar_auditoria();
revoke all on table public.compras_config from public, anon;
grant select, insert, update on table public.compras_config to authenticated;
grant all on table public.compras_config to service_role;

comment on table public.compras_config is 'Configuração de Aquisição da entidade (uma linha por entidade): prazo para iniciar a cotação. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.compras_config.cotacao_prazo_dias_uteis is 'Em quantos dias úteis depois da solicitação o comprador deve iniciar a cotação (null = sem prazo). [lgpd:nenhum]';
comment on column public.compras_config.atualizado_por_id is 'Quem alterou a configuração por último. [lgpd:identificacao]';
comment on column public.compras_config.created_at is '[lgpd:nenhum]';
comment on column public.compras_config.updated_at is '[lgpd:nenhum]';
