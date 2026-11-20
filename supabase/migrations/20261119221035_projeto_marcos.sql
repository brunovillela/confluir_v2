-- Projetos: marcos (etapas com data).
--
-- POR QUÊ: pedido de 19/11/2026 — carteira de projetos para a diretoria. As
-- tarefas soltas mostram se há pendência, mas não se o projeto está no prazo.
-- O marco é a etapa com data prevista (ex.: "Contratar o espaço", 15/12); marco
-- vencido sem conclusão põe o projeto em "Atrasado" na carteira.
--
-- COMO: `projeto_marcos`, um por etapa: título, data prevista e a data em que
-- foi concluído (nulo = aberto). Apagar o projeto apaga os marcos. Não guarda
-- dado pessoal. RLS por entidade (tenant_isolation) e set_emp_from_jwt, como as
-- demais tabelas do tenant. Idempotente.

create table if not exists public.projeto_marcos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  projeto_id uuid not null references public.projeto(id) on delete cascade,
  titulo text not null,
  data_prevista date not null,
  concluido_em date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists projeto_marcos_projeto_idx on public.projeto_marcos (projeto_id, data_prevista);
create index if not exists projeto_marcos_emp_idx on public.projeto_marcos (emp_proprietaria_id);

alter table public.projeto_marcos enable row level security;
drop policy if exists tenant_isolation on public.projeto_marcos;
create policy tenant_isolation on public.projeto_marcos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.projeto_marcos from public, anon;
grant select, insert, update, delete on table public.projeto_marcos to authenticated;
grant all on table public.projeto_marcos to service_role;

drop trigger if exists set_emp_from_jwt on public.projeto_marcos;
create trigger set_emp_from_jwt before insert on public.projeto_marcos
  for each row execute function public.set_emp_from_jwt();

comment on table public.projeto_marcos is 'Marcos (etapas com data prevista) de um projeto, em Ferramentas > Projetos. Marco vencido sem conclusão põe o projeto em "Atrasado" na carteira (lib/projetos-constantes.ts → situacaoDoProjeto). [lgpd:nenhum]';
comment on column public.projeto_marcos.titulo is 'O que deve estar pronto no marco (ex.: "Contratar o espaço"). [lgpd:nenhum]';
comment on column public.projeto_marcos.data_prevista is 'Data em que o marco deve estar cumprido. [lgpd:nenhum]';
comment on column public.projeto_marcos.concluido_em is 'Data em que o marco foi dado por cumprido; nulo = em aberto. [lgpd:nenhum]';
