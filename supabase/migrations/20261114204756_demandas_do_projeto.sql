-- Projetos com tarefas: a demanda do projeto.
--
-- POR QUÊ: o projeto passa a reunir tarefas, como a demanda (pedido de
-- 14/11/2026). Ao receber a primeira tarefa, o projeto cria sozinho uma
-- demanda que é dele, e as tarefas do projeto seguem a rotina de qualquer
-- demanda (responsável, situação, lista de Tarefas). Finalizar o projeto
-- conclui as tarefas e a demanda dele.
--
-- COMO:
--   - `demandas.projeto_id`: o projeto a que a demanda pertence. Nulo nas
--     demandas comuns. No máximo uma demanda por projeto (índice único
--     parcial), para duas abas abertas não criarem duas.
--   - Apagar o projeto não apaga a demanda: ela só perde o vínculo.
-- Nada existente muda. Idempotente.

alter table public.demandas
  add column if not exists projeto_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demandas_projeto_id_fkey'
  ) then
    alter table public.demandas
      add constraint demandas_projeto_id_fkey
      foreign key (projeto_id) references public.projeto(id) on delete set null;
  end if;
end $$;

comment on column public.demandas.projeto_id is 'Projeto dono desta demanda (criada pelo projeto ao receber a primeira tarefa). Nulo nas demandas comuns; no máximo uma por projeto. [lgpd:nenhum]';

create unique index if not exists demandas_projeto_id_unico
  on public.demandas (projeto_id)
  where projeto_id is not null;
