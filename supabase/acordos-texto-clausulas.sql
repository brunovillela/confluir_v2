-- Confluir — Acordos coletivos com texto e cláusulas extraídas (2026-09-29)
-- Fase 1 do comparador de acordos (ver memória confluir-comparador-acts).
--
-- O PDF do acordo é lido no servidor e separado em cláusulas por regra
-- (src/lib/acordos-separar.ts) — o texto de cada cláusula é LITERALMENTE o do
-- documento. A IA só sugere o TEMA e um resumo de uma linha. A entidade revisa.
--
-- Idempotente. Pré-requisito: supabase/acordos.sql.

-- ── Acordo: texto integral e o que ficou fora das cláusulas ─────────────────

alter table acordo_coletivo add column if not exists texto_integral text;
alter table acordo_coletivo add column if not exists preambulo text;
-- Encerramento, assinaturas e anexos (tabelas salariais etc.) depois da última cláusula.
alter table acordo_coletivo add column if not exists anexos text;
alter table acordo_coletivo add column if not exists extracao_em timestamptz;
alter table acordo_coletivo add column if not exists extracao_avisos text;
alter table acordo_coletivo add column if not exists clausulas_revisadas_em timestamptz;
alter table acordo_coletivo add column if not exists clausulas_revisadas_por_id uuid references usuarios(id);

comment on column acordo_coletivo.texto_integral is
  'Texto extraído do PDF (base da separação em cláusulas e da busca).';

-- ── Cláusula: tema, grupo, resumo e número para ordenar/comparar ────────────

alter table acordo_clausulas add column if not exists tema text;
alter table acordo_clausulas add column if not exists grupo text;
alter table acordo_clausulas add column if not exists resumo text;
alter table acordo_clausulas add column if not exists numero_ordem integer;
-- extracao = veio do PDF; manual = digitada.
alter table acordo_clausulas add column if not exists origem text not null default 'manual';

comment on column acordo_clausulas.tema is
  'Tema (lista em src/lib/acordos-constantes.ts: TEMAS_CLAUSULA). Sugerido pela IA na extração; a entidade corrige.';

create index if not exists idx_acordo_clausulas_tema
  on acordo_clausulas (emp_proprietaria_id, tema);
