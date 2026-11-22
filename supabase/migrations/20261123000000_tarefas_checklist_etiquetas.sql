-- Tarefas: checklist e etiquetas (Onda 2 do plano inspirado no Monday/Trello).
--
-- POR QUÊ: pedido de 22/11/2026 — dentro da tarefa, os passos marcáveis
-- ("pedir 3 orçamentos", "conferir a nota"), com o progresso no cartão; e
-- rótulos coloridos livres por entidade ("Jurídico", "Urgente", "Campanha
-- salarial") para filtrar e agrupar as tarefas.
--
-- COMO:
--  • `demandas_tarefa_itens`: os itens do checklist de uma tarefa (texto,
--    feito, ordem). Apagar a tarefa apaga os itens. A tarefa que se repete
--    leva o checklist, desmarcado, para a próxima.
--  • `demandas_etiquetas`: as etiquetas da entidade (nome único, cor de uma
--    paleta fixa). `demandas_tarefa_etiquetas`: quais etiquetas cada tarefa
--    tem. Apagar a etiqueta a tira das tarefas.
-- O prefixo `demandas` põe as tabelas no processo de demandas internas do
-- ROPA; não guardam dado pessoal. RLS por entidade e set_emp_from_jwt.
-- Idempotente.

create table if not exists public.demandas_tarefa_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  tarefa_id uuid not null references public.demandas_check_tarefas(id) on delete cascade,
  texto text not null,
  feito boolean not null default false,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists demandas_tarefa_itens_tarefa_idx on public.demandas_tarefa_itens (tarefa_id, ordem);
create index if not exists demandas_tarefa_itens_emp_idx on public.demandas_tarefa_itens (emp_proprietaria_id);

create table if not exists public.demandas_etiquetas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  cor text not null default 'cinza',
  created_at timestamptz not null default now(),
  constraint demandas_etiquetas_cor_check
    check (cor in ('cinza', 'vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'roxo', 'rosa'))
);
create unique index if not exists demandas_etiquetas_nome_idx on public.demandas_etiquetas (emp_proprietaria_id, lower(nome));

create table if not exists public.demandas_tarefa_etiquetas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  tarefa_id uuid not null references public.demandas_check_tarefas(id) on delete cascade,
  etiqueta_id uuid not null references public.demandas_etiquetas(id) on delete cascade,
  constraint demandas_tarefa_etiquetas_par unique (tarefa_id, etiqueta_id)
);
create index if not exists demandas_tarefa_etiquetas_etiqueta_idx on public.demandas_tarefa_etiquetas (etiqueta_id);
create index if not exists demandas_tarefa_etiquetas_emp_idx on public.demandas_tarefa_etiquetas (emp_proprietaria_id);

do $$
declare
  t text;
begin
  foreach t in array array['demandas_tarefa_itens', 'demandas_etiquetas', 'demandas_tarefa_etiquetas'] loop
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

comment on table public.demandas_tarefa_itens is 'Checklist de uma tarefa: os passos marcáveis, com o progresso no cartão (Ferramentas > Tarefas). [lgpd:nenhum]';
comment on column public.demandas_tarefa_itens.texto is 'O passo (ex.: "pedir 3 orçamentos"). [lgpd:nenhum]';
comment on table public.demandas_etiquetas is 'Etiquetas coloridas da entidade para as tarefas (nome único por entidade, cor de uma paleta fixa). [lgpd:nenhum]';
comment on table public.demandas_tarefa_etiquetas is 'Quais etiquetas cada tarefa tem. [lgpd:nenhum]';
