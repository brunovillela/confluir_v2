-- Tarefas: situação "Em andamento" (quadro).
--
-- POR QUÊ: pedido de 19/11/2026 — o quadro de tarefas (A fazer · Em andamento ·
-- Feito, inspirado no Trello) precisa de um estado entre "aberta" e
-- "concluída". A tarefa só tinha `concluido`.
--
-- COMO: `iniciada_em` marca quando a tarefa passou a Em andamento; nulo = A
-- fazer. Concluir mantém a data (histórico); voltar para A fazer a apaga.
-- Atrasada continua derivada do prazo, em qualquer coluna. Idempotente.

alter table public.demandas_check_tarefas
  add column if not exists iniciada_em timestamptz;

comment on column public.demandas_check_tarefas.iniciada_em is 'Quando a tarefa passou a Em andamento (quadro de tarefas); nulo = A fazer. Concluída continua em `concluido`. [lgpd:nenhum]';
