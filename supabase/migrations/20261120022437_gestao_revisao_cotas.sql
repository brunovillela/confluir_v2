-- POR QUÊ: Gestão (20/11/2026), dois pedidos do usuário:
--   1. Revisão periódica de acessos: de tempos em tempos (sugestão: a cada
--      trimestre) o coordenador de cada departamento confirma quem da equipe
--      ainda precisa do acesso ao painel. O que ele marcar para retirar ou
--      ajustar — e o que ficar sem resposta — vai para a Gestão resolver. É a
--      prova de controle que auditoria e LGPD pedem.
--   2. Cota de IA por departamento: um teto mensal por departamento, além do
--      teto geral da entidade.
-- COMO:
--   - acessos_revisao_ciclos: uma campanha de revisão (aberta, prazo,
--     encerrada). Só uma aberta por entidade (índice único parcial).
--   - acessos_revisao_itens: uma linha por pessoa com acesso no ciclo, com o
--     revisor (coordenador do departamento; nulo = a própria Gestão revisa),
--     o retrato do acesso no momento (perfis e permissões diretas), a decisão
--     (manter / retirar / ajustar) e o tratamento pela Gestão.
--   - ia_config.cotas_departamento: {"<departamento_id>": limite em US$}.
--   - ia_cota_avisos: marca de "já avisei" por departamento, mês e nível
--     (80/100); o insert com conflito ignorado evita aviso duplicado.
--   - ia_uso_custo_por_departamento(p_emp, p_de): custo do período por
--     departamento, para a trava e a tela.
--   Idempotente.

-- ── 1. Ciclos de revisão ───────────────────────────────────────────────────
create table if not exists public.acessos_revisao_ciclos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  titulo text not null,
  aberto_em timestamptz not null default now(),
  aberto_por uuid references public.usuarios(id) on delete set null,
  prazo date not null,
  encerrado_em timestamptz,
  encerrado_por uuid references public.usuarios(id) on delete set null
);

create unique index if not exists acessos_revisao_ciclos_um_aberto
  on public.acessos_revisao_ciclos (emp_proprietaria_id) where encerrado_em is null;
create index if not exists acessos_revisao_ciclos_emp_idx
  on public.acessos_revisao_ciclos (emp_proprietaria_id, aberto_em desc);

alter table public.acessos_revisao_ciclos enable row level security;
drop policy if exists tenant_isolation on public.acessos_revisao_ciclos;
create policy tenant_isolation on public.acessos_revisao_ciclos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.acessos_revisao_ciclos from public, anon;
grant select, insert, update, delete on table public.acessos_revisao_ciclos to authenticated;
grant all on table public.acessos_revisao_ciclos to service_role;

drop trigger if exists set_emp_from_jwt on public.acessos_revisao_ciclos;
create trigger set_emp_from_jwt before insert on public.acessos_revisao_ciclos
  for each row execute function public.set_emp_from_jwt();

comment on table public.acessos_revisao_ciclos is 'Campanha de revisão periódica de acessos (Gestão › Usuários › Revisão de acessos, 20/11/2026): quando abriu, prazo e quando encerrou. [lgpd:identificacao|titulares:funcionarios]';
comment on column public.acessos_revisao_ciclos.titulo is 'Nome da campanha (ex.: 4º trimestre de 2026). [lgpd:nenhum]';
comment on column public.acessos_revisao_ciclos.aberto_por is 'Quem abriu a revisão. [lgpd:identificacao]';
comment on column public.acessos_revisao_ciclos.prazo is 'Data-limite para os coordenadores responderem. [lgpd:nenhum]';
comment on column public.acessos_revisao_ciclos.encerrado_por is 'Quem encerrou a revisão. [lgpd:identificacao]';

-- ── 2. Itens (uma pessoa com acesso em cada ciclo) ─────────────────────────
create table if not exists public.acessos_revisao_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  ciclo_id uuid not null references public.acessos_revisao_ciclos(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  departamento_id uuid references public.empresa_departamentos(id) on delete set null,
  revisor_id uuid references public.usuarios(id) on delete set null,
  acesso_resumo jsonb not null default '{}'::jsonb,
  decisao text,
  observacao text,
  decidido_em timestamptz,
  decidido_por uuid references public.usuarios(id) on delete set null,
  tratado_em timestamptz,
  tratado_por uuid references public.usuarios(id) on delete set null,
  tratamento text,
  constraint acessos_revisao_itens_decisao_valida check (decisao is null or decisao in ('manter', 'retirar', 'ajustar')),
  constraint acessos_revisao_itens_unico unique (ciclo_id, usuario_id)
);

create index if not exists acessos_revisao_itens_revisor_idx
  on public.acessos_revisao_itens (emp_proprietaria_id, revisor_id) where decisao is null;
create index if not exists acessos_revisao_itens_ciclo_idx
  on public.acessos_revisao_itens (ciclo_id);

alter table public.acessos_revisao_itens enable row level security;
drop policy if exists tenant_isolation on public.acessos_revisao_itens;
create policy tenant_isolation on public.acessos_revisao_itens to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.acessos_revisao_itens from public, anon;
grant select, insert, update, delete on table public.acessos_revisao_itens to authenticated;
grant all on table public.acessos_revisao_itens to service_role;

drop trigger if exists set_emp_from_jwt on public.acessos_revisao_itens;
create trigger set_emp_from_jwt before insert on public.acessos_revisao_itens
  for each row execute function public.set_emp_from_jwt();

comment on table public.acessos_revisao_itens is 'Cada pessoa com acesso ao painel numa revisão periódica: quem revisa (coordenador do departamento ou a Gestão), o retrato do acesso, a decisão e o que a Gestão fez (20/11/2026). [lgpd:identificacao|titulares:funcionarios]';
comment on column public.acessos_revisao_itens.usuario_id is 'Pessoa cujo acesso está sendo revisado. [lgpd:identificacao]';
comment on column public.acessos_revisao_itens.departamento_id is 'Departamento pelo qual o coordenador revisa; nulo quando a Gestão revisa direto. [lgpd:nenhum]';
comment on column public.acessos_revisao_itens.revisor_id is 'Coordenador que confirma; nulo = a Gestão (sem coordenador, ou a pessoa é o próprio coordenador). [lgpd:identificacao]';
comment on column public.acessos_revisao_itens.acesso_resumo is 'Retrato do acesso quando a revisão abriu: {"perfis": [nomes], "diretas": [rótulos das permissões diretas], "total": n}. [lgpd:nenhum]';
comment on column public.acessos_revisao_itens.decisao is 'manter, retirar ou ajustar; nulo = sem resposta. [lgpd:nenhum]';
comment on column public.acessos_revisao_itens.observacao is 'O que ajustar, ou o motivo, nas palavras do revisor. [lgpd:identificacao]';
comment on column public.acessos_revisao_itens.decidido_por is 'Quem respondeu. [lgpd:identificacao]';
comment on column public.acessos_revisao_itens.tratado_por is 'Quem da Gestão resolveu (revogou, ajustou ou manteve). [lgpd:identificacao]';
comment on column public.acessos_revisao_itens.tratamento is 'O que a Gestão fez, em poucas palavras. [lgpd:nenhum]';

-- ── 3. Cota de IA por departamento ─────────────────────────────────────────
alter table public.ia_config
  add column if not exists cotas_departamento jsonb not null default '{}'::jsonb;
comment on column public.ia_config.cotas_departamento is 'Cota mensal de IA por departamento: {"<departamento_id>": limite em US$}. Trava e avisa como o teto geral. [lgpd:nenhum]';

create table if not exists public.ia_cota_avisos (
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  departamento_id uuid not null references public.empresa_departamentos(id) on delete cascade,
  mes text not null,
  nivel smallint not null,
  avisado_em timestamptz not null default now(),
  primary key (emp_proprietaria_id, departamento_id, mes, nivel),
  constraint ia_cota_avisos_nivel_valido check (nivel in (80, 100))
);

alter table public.ia_cota_avisos enable row level security;
drop policy if exists tenant_isolation on public.ia_cota_avisos;
create policy tenant_isolation on public.ia_cota_avisos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.ia_cota_avisos from public, anon;
grant select, insert, update, delete on table public.ia_cota_avisos to authenticated;
grant all on table public.ia_cota_avisos to service_role;

drop trigger if exists set_emp_from_jwt on public.ia_cota_avisos;
create trigger set_emp_from_jwt before insert on public.ia_cota_avisos
  for each row execute function public.set_emp_from_jwt();

comment on table public.ia_cota_avisos is 'Avisos de cota de IA já enviados por departamento, mês (AAAA-MM) e nível (80 ou 100), para não repetir (20/11/2026). [lgpd:nenhum]';

create or replace function public.ia_uso_custo_por_departamento(p_emp uuid, p_de timestamptz)
returns table (departamento_id uuid, custo numeric)
language sql
stable
security definer
set search_path = public
as $$
  select departamento_id, coalesce(sum(custo_estimado_usd), 0)
    from ia_uso
   where emp_proprietaria_id = p_emp
     and criado_em >= p_de
     and departamento_id is not null
   group by departamento_id;
$$;
revoke all on function public.ia_uso_custo_por_departamento(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ia_uso_custo_por_departamento(uuid, timestamptz) to service_role;
comment on function public.ia_uso_custo_por_departamento(uuid, timestamptz) is 'Custo estimado da IA por departamento desde a data (cota mensal por departamento, 20/11/2026).';
