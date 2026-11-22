-- Tarefas: data de início e dependências (gráfico de Gantt).
--
-- POR QUÊ: pedido de 22/11/2026 — gráfico de Gantt para tarefas dependentes.
-- A tarefa só tinha o prazo; para a barra no tempo falta o início, e para a
-- sequência ("esta só começa quando aquela terminar") falta o vínculo.
--
-- COMO: `demandas_check_tarefas.data_inicio` (opcional; sem ela a barra
-- ocupa só o dia do prazo) e `demandas_tarefa_dependencias`, uma linha por
-- par "tarefa depende de outra" (mesma entidade; apagar qualquer das duas
-- apaga o vínculo). O código impede ciclo (A depende de B que depende de A).
-- Quando a última tarefa de que outra depende é concluída, o responsável da
-- seguinte é avisado (evento tarefa_liberada). RLS por entidade e
-- set_emp_from_jwt. Idempotente.

alter table public.demandas_check_tarefas
  add column if not exists data_inicio date;

comment on column public.demandas_check_tarefas.data_inicio is 'Quando a tarefa começa (linha do tempo / Gantt); opcional, a barra vai do início ao prazo. [lgpd:nenhum]';

create table if not exists public.demandas_tarefa_dependencias (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  tarefa_id uuid not null references public.demandas_check_tarefas(id) on delete cascade,
  depende_de_id uuid not null references public.demandas_check_tarefas(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint demandas_tarefa_dependencias_par unique (tarefa_id, depende_de_id),
  constraint demandas_tarefa_dependencias_nao_ela_mesma check (tarefa_id <> depende_de_id)
);

create index if not exists demandas_tarefa_dependencias_depende_idx on public.demandas_tarefa_dependencias (depende_de_id);
create index if not exists demandas_tarefa_dependencias_emp_idx on public.demandas_tarefa_dependencias (emp_proprietaria_id);

alter table public.demandas_tarefa_dependencias enable row level security;
drop policy if exists tenant_isolation on public.demandas_tarefa_dependencias;
create policy tenant_isolation on public.demandas_tarefa_dependencias to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.demandas_tarefa_dependencias from public, anon;
grant select, insert, update, delete on table public.demandas_tarefa_dependencias to authenticated;
grant all on table public.demandas_tarefa_dependencias to service_role;

drop trigger if exists set_emp_from_jwt on public.demandas_tarefa_dependencias;
create trigger set_emp_from_jwt before insert on public.demandas_tarefa_dependencias
  for each row execute function public.set_emp_from_jwt();

comment on table public.demandas_tarefa_dependencias is 'Dependência entre tarefas: `tarefa_id` só começa quando `depende_de_id` termina (Gantt de Ferramentas > Tarefas e do projeto). [lgpd:nenhum]';
