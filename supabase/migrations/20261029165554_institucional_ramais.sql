-- Confluir — Ramais e telefones diretos da entidade (institucional_ramais)
--
-- POR QUÊ: o Meu perfil passa a mostrar os "Contatos corporativos" da pessoa
-- espelhando a área de origem de cada um: e-mail corporativo (E-mails
-- institucionais), telefone corporativo (Linhas institucionais) e telefone
-- direto e ramal — que não tinham área nenhuma. Esta tabela é essa área:
-- o cadastro dos ramais e linhas fixas diretas, com a pessoa que atende.
--
-- COMO: um registro por ramal/linha direta, com o local (sala, setor) e o
-- usuário que atende (opcional — ramal da recepção, da sala de reunião).
-- Ramal e telefone direto guardam só dígitos; um dos dois é obrigatório.
-- Prefixo institucional_: módulo Institucional, ao lado das linhas. RLS por
-- tenant; a tela usa a permissão das Linhas institucionais.

create table if not exists public.institucional_ramais (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  ramal text,
  telefone_direto text,
  local text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint institucional_ramais_algum_numero check (ramal is not null or telefone_direto is not null),
  constraint institucional_ramais_ramal_check check (ramal is null or ramal ~ '^[0-9]{2,6}$'),
  constraint institucional_ramais_direto_check check (telefone_direto is null or telefone_direto ~ '^[0-9]{10,11}$')
);

create index if not exists institucional_ramais_usuario_idx
  on public.institucional_ramais (usuario_id) where usuario_id is not null;
create index if not exists institucional_ramais_emp_idx
  on public.institucional_ramais (emp_proprietaria_id);

alter table public.institucional_ramais enable row level security;
drop policy if exists tenant_isolation on public.institucional_ramais;
create policy tenant_isolation on public.institucional_ramais to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.institucional_ramais;
create trigger set_emp_from_jwt before insert on public.institucional_ramais
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.institucional_ramais from public, anon;
grant select, insert, update, delete on table public.institucional_ramais to authenticated;
grant all on table public.institucional_ramais to service_role;

-- ── Dicionário ─────────────────────────────────────────────────────────────

comment on table public.institucional_ramais is 'Ramais e telefones diretos (linhas fixas) da entidade, com o local e a pessoa que atende; espelhados nos Contatos corporativos do Meu perfil. [lgpd:identificacao|titulares:funcionários e diretores]';
comment on column public.institucional_ramais.ramal is 'Número do ramal (só dígitos, 2 a 6).';
comment on column public.institucional_ramais.telefone_direto is 'Telefone fixo direto com DDD (só dígitos, 10 ou 11).';
comment on column public.institucional_ramais.local is 'Onde fica: sala, setor, recepção.';
comment on column public.institucional_ramais.usuario_id is 'Quem atende neste ramal/telefone (nulo = de uso geral). [lgpd:identificacao]';
comment on column public.institucional_ramais.observacao is 'Observação livre.';
comment on column public.institucional_ramais.created_at is 'Quando foi cadastrado.';
comment on column public.institucional_ramais.updated_at is 'Última alteração.';
