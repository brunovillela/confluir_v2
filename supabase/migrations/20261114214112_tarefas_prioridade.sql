-- Tarefas: prioridade.
--
-- POR QUÊ: pedido de 14/11/2026 — reordenar as tarefas por prazo ou por
-- prioridade. A tarefa não tinha prioridade.
--
-- COMO: `demandas_check_tarefas.prioridade` em três níveis (alta, media,
-- baixa). As tarefas que já existem ficam em "media" (o padrão). Ordenar por
-- prioridade põe as altas primeiro e, dentro do nível, o prazo mais próximo.
-- Idempotente.

alter table public.demandas_check_tarefas
  add column if not exists prioridade text not null default 'media';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demandas_check_tarefas_prioridade_check'
  ) then
    alter table public.demandas_check_tarefas
      add constraint demandas_check_tarefas_prioridade_check
      check (prioridade in ('alta', 'media', 'baixa'));
  end if;
end $$;

comment on column public.demandas_check_tarefas.prioridade is 'Prioridade da tarefa: alta, media ou baixa (padrão media). Usada para ordenar as listas. [lgpd:nenhum]';
