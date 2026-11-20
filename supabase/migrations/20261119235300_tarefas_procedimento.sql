-- Tarefas: procedimento (o "como fazemos aqui").
--
-- POR QUÊ: pedido de 19/11/2026 — o manual explica o sistema, não os processos
-- da entidade. Os procedimentos internos (fluxos, roteiros, checklists) já
-- podem ficar em Ferramentas > Documentos; falta ligá-los às tarefas que os
-- seguem, para quem executa abrir o roteiro direto da tarefa.
--
-- COMO: `demandas_check_tarefas.procedimento_id` aponta para o documento
-- (`fa_documentos`). Apagar o documento solta o vínculo (set null). A tarefa
-- recorrente leva o procedimento para a próxima. Idempotente.

alter table public.demandas_check_tarefas
  add column if not exists procedimento_id uuid
    references public.fa_documentos(id) on delete set null;

create index if not exists demandas_check_tarefas_procedimento_idx
  on public.demandas_check_tarefas (procedimento_id)
  where procedimento_id is not null;

comment on column public.demandas_check_tarefas.procedimento_id is 'Documento (Ferramentas > Documentos) com o procedimento que a tarefa segue; quem executa abre a versão mais recente pela tarefa. [lgpd:nenhum]';
