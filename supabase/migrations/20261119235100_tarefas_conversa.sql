-- Tarefas: conversa e anexos.
--
-- POR QUÊ: pedido de 19/11/2026 — a demanda tinha comentários, a tarefa não.
-- Quem entrega a tarefa não tinha onde deixar "feito, segue o arquivo", nem
-- quem pediu onde perguntar.
--
-- COMO: `demandas_tarefa_comentarios`, uma mensagem por linha: a tarefa, quem
-- escreveu, o texto e, se houver, um anexo no bucket `documentos` (caminho
-- tarefas/<tarefa>/<arquivo>, servido por URL assinada). Apagar a tarefa apaga
-- a conversa; o autor que deixar o sistema fica nulo (a mensagem fica). O
-- prefixo `demandas` põe a tabela no processo de demandas internas do ROPA.
-- RLS por entidade (tenant_isolation) e set_emp_from_jwt. Idempotente.

create table if not exists public.demandas_tarefa_comentarios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  tarefa_id uuid not null references public.demandas_check_tarefas(id) on delete cascade,
  autor_id uuid references public.usuarios(id) on delete set null,
  texto text not null default '',
  anexo_caminho text,
  anexo_nome text,
  created_at timestamptz not null default now()
);

create index if not exists demandas_tarefa_comentarios_tarefa_idx on public.demandas_tarefa_comentarios (tarefa_id, created_at);
create index if not exists demandas_tarefa_comentarios_emp_idx on public.demandas_tarefa_comentarios (emp_proprietaria_id);

alter table public.demandas_tarefa_comentarios enable row level security;
drop policy if exists tenant_isolation on public.demandas_tarefa_comentarios;
create policy tenant_isolation on public.demandas_tarefa_comentarios to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.demandas_tarefa_comentarios from public, anon;
grant select, insert, update, delete on table public.demandas_tarefa_comentarios to authenticated;
grant all on table public.demandas_tarefa_comentarios to service_role;

drop trigger if exists set_emp_from_jwt on public.demandas_tarefa_comentarios;
create trigger set_emp_from_jwt before insert on public.demandas_tarefa_comentarios
  for each row execute function public.set_emp_from_jwt();

comment on table public.demandas_tarefa_comentarios is 'Conversa de uma tarefa (Ferramentas > Tarefas e Meu perfil > Minhas tarefas): mensagens do responsável, de quem pediu e de quem cuida das tarefas, com anexo opcional no bucket documentos. [lgpd:identificacao|titulares:funcionarios,diretores]';
comment on column public.demandas_tarefa_comentarios.autor_id is 'Quem escreveu a mensagem. [lgpd:identificacao]';
comment on column public.demandas_tarefa_comentarios.texto is 'Texto livre da mensagem; pode citar pessoas. [lgpd:identificacao]';
comment on column public.demandas_tarefa_comentarios.anexo_caminho is 'Caminho do anexo no bucket documentos (tarefas/<tarefa>/<arquivo>); nulo = sem anexo. [lgpd:identificacao]';
comment on column public.demandas_tarefa_comentarios.anexo_nome is 'Nome original do arquivo anexado. [lgpd:nenhum]';
