-- Confluir — Gestão: permissão própria, revisão de acessos e avisos da IA
--
-- POR QUÊ: o módulo Gestão (19/11/2026) era liberado pela permissão
-- `configuracoes` ("Organização: identidade e sedes"): quem só edita o
-- endereço da sede também trocava a chave de IA, o teto e as integrações.
-- Além disso, a Gestão precisa apontar quem continua com acesso sem dever
-- (desligado no Pessoal, diretor fora do mandato, conta parada) e avisar os
-- administradores quando a IA chega perto do teto ou a chave é recusada.
--
-- COMO:
--  1. permissoes.gestao_sistema: a permissão da Gestão. Na transição, quem já
--     tinha `configuracoes` (na linha própria ou num perfil) recebe a nova,
--     para ninguém perder acesso; a entidade enxuga depois.
--  2. ia_config ganha as marcas dos avisos (nível do teto avisado no mês e o
--     último aviso de chave recusada), para avisar uma vez só.
--  3. acessos_ultimo_login(p_emp): o último login (auth.users) de quem tem
--     acesso ao painel na entidade — base da revisão de acessos. Só o
--     service role executa.
-- Idempotente.

-- ── 1. Permissão ───────────────────────────────────────────────────────────
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'permissoes' and column_name = 'gestao_sistema'
  ) then
    alter table public.permissoes add column gestao_sistema boolean default false;
    update public.permissoes set gestao_sistema = true where configuracoes = true;
  end if;
end $$;
comment on column public.permissoes.gestao_sistema is 'Gestão do sistema: inteligência artificial (chave, teto, módulos), integrações (API, webhooks, catracas) e a revisão de acessos. [lgpd:nenhum]';

insert into public.perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select distinct pp.perfil_id, pp.emp_proprietaria_id, 'gestao_sistema'
  from public.perfil_permissoes pp
 where pp.chave = 'configuracoes'
   and not exists (
     select 1 from public.perfil_permissoes x
      where x.perfil_id = pp.perfil_id and x.chave = 'gestao_sistema'
   );

-- ── 2. Marcas dos avisos da IA ─────────────────────────────────────────────
alter table public.ia_config add column if not exists aviso_teto_mes text;
alter table public.ia_config add column if not exists aviso_teto_nivel smallint;
alter table public.ia_config add column if not exists chave_aviso_erro_em timestamptz;
comment on column public.ia_config.aviso_teto_mes is 'Mês (AAAA-MM) do último aviso de teto da IA enviado aos administradores.';
comment on column public.ia_config.aviso_teto_nivel is 'Nível já avisado no mês de aviso_teto_mes: 80 (perto do teto) ou 100 (atingido).';
comment on column public.ia_config.chave_aviso_erro_em is 'Quando os administradores foram avisados da última recusa da chave da entidade (no máximo um aviso por dia).';

-- ── 3. Último login de quem tem acesso ─────────────────────────────────────
create or replace function public.acessos_ultimo_login(p_emp uuid)
returns table (usuario_id uuid, ultimo_login timestamptz, conta_criada timestamptz)
language sql
stable
security definer
set search_path = public, auth
as $$
  select u.id, au.last_sign_in_at, au.created_at
    from public.permissoes p
    join public.usuarios u on u.id = p.usuario_id and u.emp_proprietaria_id = p_emp
    join auth.users au on au.id = u.auth_user_id
   where p.emp_proprietaria_id = p_emp;
$$;
revoke all on function public.acessos_ultimo_login(uuid) from public, anon, authenticated;
grant execute on function public.acessos_ultimo_login(uuid) to service_role;
comment on function public.acessos_ultimo_login(uuid) is 'Último login e criação da conta de quem tem acesso ao painel na entidade (Gestão › revisão de acessos, 19/11/2026).';
