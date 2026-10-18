-- Confluir — Pessoal › Atribuições / SST: executor PRESTADOR (2026-08-31)
--
-- Tarefas também podem ser executadas por PRESTADORES DE SERVIÇO (fornecedores
-- do módulo Compras — a tabela `empresa`). O executor passa a ser funcionário
-- (funcionario_id) OU prestador (fornecedor_id) — todos os níveis valem para
-- ambos: tempo, recorrência/frequência e riscos por executor.
--
-- Disso saem dois documentos: a ORDEM DE SERVIÇO (NR-01) por funcionário e o
-- COMUNICADO DE SST por prestador (com exigências de treinamento e EPI).
--
-- Idempotente. Executar UMA VEZ, DEPOIS de pessoal-sst-executor-risco.sql.

alter table pessoal_atividades_executores
  add column if not exists fornecedor_id uuid references empresa(id);

-- Um registro por (tarefa, prestador) — espelha o ux de (tarefa, funcionário).
-- SEM predicado parcial: o upsert do PostgREST (on_conflict) exige índice
-- único integral; linhas de funcionário têm fornecedor_id NULL e NULLs não
-- colidem entre si.
create unique index if not exists ux_pessoal_ativ_exec_fornecedor
  on pessoal_atividades_executores (atividade_id, fornecedor_id);

create index if not exists idx_pessoal_ativ_exec_fornecedor
  on pessoal_atividades_executores (fornecedor_id);
