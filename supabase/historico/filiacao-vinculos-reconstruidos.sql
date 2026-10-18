-- Marca de origem para os vínculos reconstruídos a partir do cadastro do
-- Bubble (scripts/reconstruir-vinculos-bubble.mjs).
--
-- POR QUE UMA COLUNA: o histórico de vínculos existe para metade da base — os
-- 10.824 vínculos vieram de um backfill do Bubble de setembro de 2025 que
-- parou no meio. A reconstrução cria os que faltam a partir da "Filiação data
-- adesão" e da "FONTE PG" que o CADASTRO do Bubble guarda.
--
-- Esses vínculos são derivados, não digitados por ninguém: quem abrir a ficha
-- precisa saber disso, e quem rodar a migração precisa poder DESFAZER em uma
-- linha (delete ... where reconstruido_de is not null). Sem a marca, os 8.500
-- registros novos ficariam indistinguíveis dos legítimos.
--
-- Guarda o id do registro de origem no Bubble, não um booleano: assim dá para
-- voltar à fonte e conferir caso a caso.

alter table public.filiacao_vinculos
  add column if not exists reconstruido_de text;

comment on column public.filiacao_vinculos.reconstruido_de is
  'Id do cadastro no Bubble de onde este vínculo foi derivado. Nulo = vínculo registrado normalmente.';

create index if not exists filiacao_vinculos_reconstruido_idx
  on public.filiacao_vinculos (emp_proprietaria_id)
  where reconstruido_de is not null;
