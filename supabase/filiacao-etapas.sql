-- Confluir — datas das etapas do processo de filiação/desfiliação (2026-08-28)
--
-- A condição do filiado (`filiacoes.filiacao_condicao`) já é a máquina de estados
-- do processo (ver src/lib/filiacao.ts). Estas colunas guardam QUANDO cada marco
-- foi atingido, para o acompanhamento medir "há quanto tempo está parado" e para
-- o gráfico de etapas mostrar a data de cada passo.
--
-- Começam vazias: nascem nulas nos registros migrados e passam a preencher nas
-- transições feitas pelo sistema novo (botão "avançar etapa" e conferência da
-- remessa). Idempotente — pode rodar mais de uma vez.

alter table filiacoes
  -- Momento em que a condição atual foi assumida (tempo na etapa corrente).
  add column if not exists condicao_desde timestamptz,
  -- Marcos da FILIAÇÃO:
  add column if not exists ficha_assinada_em timestamptz,
  add column if not exists filiacao_informada_fonte_em timestamptz,
  add column if not exists ativo_em timestamptz,
  -- Marcos da DESFILIAÇÃO:
  add column if not exists desfiliacao_informada_fonte_em timestamptz,
  add column if not exists inativo_em timestamptz;

-- Consulta do acompanhamento filtra por condição dentro do tenant.
create index if not exists idx_filiacoes_condicao_etapa
  on filiacoes (emp_proprietaria_id, filiacao_condicao);
