-- Ferramentas: seguidores, menções e filtros salvos (Onda 4).
--
-- POR QUÊ: pedido de 23/11/2026 — Onda 4 do plano inspirado no Monday/Trello
-- (acompanhamento): seguir uma tarefa ou demanda, mencionar alguém na
-- conversa da tarefa e guardar filtros de Tarefas e Demandas.
--
-- COMO:
--  • `demandas_seguidores`: quem segue uma tarefa OU uma demanda (uma das
--    duas). Quem segue recebe os avisos dela sem ser o responsável. A menção
--    (@Fulano na conversa) inscreve a pessoa como seguidora da tarefa, com
--    `origem = 'mencao'`, e isso lhe dá acesso à conversa daquela tarefa.
--  • `demandas_filtros_salvos`: atalhos de filtro (a consulta da URL) de
--    Tarefas ou Demandas, da pessoa ou compartilhados com quem vê a página.
-- Os painéis por departamento não precisam de tabela: leem as tarefas,
-- demandas e projetos que já existem.
-- O prefixo `demandas` põe as tabelas no processo de demandas internas do
-- ROPA. RLS por entidade e set_emp_from_jwt. Idempotente.

create table if not exists public.demandas_seguidores (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  tarefa_id uuid references public.demandas_check_tarefas(id) on delete cascade,
  demanda_id uuid references public.demandas(id) on delete cascade,
  origem text not null default 'manual',
  created_at timestamptz not null default now(),
  constraint demandas_seguidores_alvo_check check (num_nonnulls(tarefa_id, demanda_id) = 1),
  constraint demandas_seguidores_origem_check check (origem in ('manual', 'mencao'))
);

create unique index if not exists demandas_seguidores_tarefa_uniq
  on public.demandas_seguidores (tarefa_id, usuario_id) where tarefa_id is not null;
create unique index if not exists demandas_seguidores_demanda_uniq
  on public.demandas_seguidores (demanda_id, usuario_id) where demanda_id is not null;
create index if not exists demandas_seguidores_usuario_idx
  on public.demandas_seguidores (emp_proprietaria_id, usuario_id);

create table if not exists public.demandas_filtros_salvos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  pagina text not null,
  nome text not null,
  consulta text not null default '',
  compartilhado boolean not null default false,
  created_at timestamptz not null default now(),
  constraint demandas_filtros_salvos_pagina_check check (pagina in ('tarefas', 'demandas')),
  constraint demandas_filtros_salvos_nome_check check (char_length(nome) between 1 and 60),
  constraint demandas_filtros_salvos_consulta_check check (char_length(consulta) <= 500)
);

create index if not exists demandas_filtros_salvos_idx
  on public.demandas_filtros_salvos (emp_proprietaria_id, pagina);

do $$
declare
  t text;
begin
  foreach t in array array['demandas_seguidores', 'demandas_filtros_salvos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I to authenticated using (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid) with check (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)',
      t
    );
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;

comment on table public.demandas_seguidores is 'Quem segue uma tarefa ou uma demanda e recebe os avisos dela (Ferramentas). A menção na conversa inscreve a pessoa. [lgpd:identificacao|titulares:funcionarios,diretores]';
comment on column public.demandas_seguidores.usuario_id is 'A pessoa que segue. [lgpd:identificacao]';
comment on column public.demandas_seguidores.origem is 'manual = a pessoa escolheu seguir; mencao = foi mencionada na conversa da tarefa. [lgpd:nenhum]';
comment on table public.demandas_filtros_salvos is 'Atalhos de filtro de Tarefas e Demandas, da pessoa ou compartilhados com a equipe. [lgpd:identificacao|titulares:funcionarios,diretores]';
comment on column public.demandas_filtros_salvos.usuario_id is 'Quem salvou o filtro. [lgpd:identificacao]';
comment on column public.demandas_filtros_salvos.consulta is 'A consulta da página (parâmetros da URL, como responsavel=… e status=…), sem texto livre além da busca. [lgpd:nenhum]';
