-- Tarefas: repetição (tarefa recorrente).
--
-- POR QUÊ: pedido de 19/11/2026 — rotinas sem módulo próprio (renovar um
-- alvará, conferir o extintor, mandar o relatório trimestral à federação)
-- viviam em planilhas e lembretes pessoais. A tarefa passa a poder se repetir.
--
-- COMO: `recorrencia` diz de quanto em quanto tempo a tarefa volta (semanal,
-- mensal, trimestral, semestral, anual; nulo = não repete). Ao CONCLUIR uma
-- tarefa recorrente, o sistema cria a próxima, igual, com o prazo avançado
-- (lib/db/nucleo.ts → gerarProximaRecorrencia) e guarda o elo em
-- `recorrencia_proxima_id` — reabrir e concluir de novo não cria outra.
-- Excluir a próxima solta o elo (set null). Idempotente.

alter table public.demandas_check_tarefas
  add column if not exists recorrencia text;

alter table public.demandas_check_tarefas
  add column if not exists recorrencia_proxima_id uuid
    references public.demandas_check_tarefas(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'demandas_check_tarefas_recorrencia_check'
  ) then
    alter table public.demandas_check_tarefas
      add constraint demandas_check_tarefas_recorrencia_check
      check (recorrencia is null or recorrencia in ('semanal', 'mensal', 'trimestral', 'semestral', 'anual'));
  end if;
end $$;

comment on column public.demandas_check_tarefas.recorrencia is 'De quanto em quanto tempo a tarefa se repete: semanal, mensal, trimestral, semestral ou anual; nulo = não repete. Ao concluir, o sistema cria a próxima com o prazo avançado. [lgpd:nenhum]';
comment on column public.demandas_check_tarefas.recorrencia_proxima_id is 'A tarefa criada quando esta (recorrente) foi concluída; impede criar outra ao reabrir e concluir de novo. [lgpd:nenhum]';
