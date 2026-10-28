-- Confluir — Reembolsos a filiados: sai o teto mensal e o valor padrão (28/10/2026)
--
-- POR QUÊ: o teto mensal (orcamento_limite/orcamento_mensal, R$ 25 mil herdado
-- do Bubble) e o valor fixo por reembolso (valor_reembolso, R$ 35) foram
-- pensados para ajuda de presença em reunião; o uso real é devolver desconto
-- salarial de greve e cobrança indevida, com valor variável. O código deixou
-- de ler e gravar as três colunas em 27/10 (d538e954 e 41c1554b); elas ficaram
-- só ocupando espaço. A configuração segue com o centro de custo.
--
-- COMO: drop das três colunas de filiacao_reembolsos_config. Nenhuma view,
-- função ou policy as usa. Idempotente.

alter table public.filiacao_reembolsos_config drop column if exists orcamento_limite;
alter table public.filiacao_reembolsos_config drop column if exists orcamento_mensal;
alter table public.filiacao_reembolsos_config drop column if exists valor_reembolso;
