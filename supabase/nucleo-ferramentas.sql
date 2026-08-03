-- ============================================================================
-- Núcleo de Ferramentas: Demandas · Tarefas · Anomalias  (reforma 2026-07-22)
--
-- Decisões (com o usuário):
--   • Tarefa é a espinha: pai OPCIONAL projeto | demanda | anomalia | (solta),
--     com demandante × demandado. Passa a apontar direto para a Demanda —
--     a camada `demandas_check` (checklist) é ELIMINADA.
--   • Demanda = frente/objetivo contínuo (prazo, responsável, orçamento
--     informativo, SEM Compras). Projeto continua sendo a iniciativa orçada.
--   • Anomalia continua entidade própria (RCA: fato, causa raiz, providências,
--     eficácia); suas providências são Tarefas (via anomalia_id).
--   • Dados de teste descartados; preservados os 2 casos reais de anomalia e a
--     Demanda "Atuação no Conselho Nacional de Saúde".
--
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- 1) Tarefa aponta direto para a Demanda (elimina a camada de checklist) ------
alter table demandas_check_tarefas
  add column if not exists demanda_id uuid references demandas (id) on delete set null,
  add column if not exists titulo text;

comment on column demandas_check_tarefas.demanda_id is
  'Demanda-pai (opcional). Junto de projeto_id e anomalia_id compõe o pai polimórfico da tarefa; todos nulos = tarefa solta.';
comment on column demandas_check_tarefas.titulo is
  'Enunciado da tarefa. Substitui o antigo texto em `demanda` (mantido só por compatibilidade).';

create index if not exists idx_tarefas_demanda on demandas_check_tarefas (demanda_id);
create index if not exists idx_tarefas_projeto on demandas_check_tarefas (projeto_id);
create index if not exists idx_tarefas_anomalia on demandas_check_tarefas (anomalia_id);
create index if not exists idx_tarefas_demandado on demandas_check_tarefas (demandado_id);

-- 2) Limpeza dos dados de teste ---------------------------------------------
-- 2.1 As 4 tarefas totalmente vazias (nunca usadas).
delete from demandas_check_tarefas
where coalesce(titulo, demanda) is null
  and demanda_id is null
  and projeto_id is null
  and anomalia_id is null
  and demandante_id is null
  and demandado_id is null;

-- 2.2 A camada de checklist inteira (1 linha dummy "Compra de material").
delete from demandas_check;

-- 2.3 Comentários das demandas de teste (FK bloqueia a exclusão delas).
delete from demandas_comentarios
where demanda_id in (
  select id from demandas where nome in ('Demanda 1', 'Demanda 3', 'Demanda 4') and descricao is null
);

-- 2.4 As demandas de teste vazias; preserva "Atuação no Conselho Nacional de Saúde".
delete from demandas
where nome in ('Demanda 1', 'Demanda 3', 'Demanda 4')
  and descricao is null;
