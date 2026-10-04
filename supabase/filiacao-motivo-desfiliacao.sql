-- Confluir — Motivo da desfiliação (2026-10-04, onda 4 / I6)
--
-- Lista fechada em src/lib/churn-constantes.ts (aposentadoria, desligamento,
-- transferência, financeiro, insatisfação, oposição, falecimento, outro).
-- Preenchido na ficha do filiado (ao editar a condição para uma de
-- desfiliação) e na tela Indicadores → Churn, que lista quem saiu sem motivo.
-- O código tolera as colunas ausentes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

alter table public.filiacoes add column if not exists desfiliacao_motivo text;
alter table public.filiacoes add column if not exists desfiliacao_motivo_detalhe text;
comment on column public.filiacoes.desfiliacao_motivo is
  'Motivo da desfiliação em lista fechada (lib/churn-constantes.ts).';
create index if not exists filiacoes_desfiliacao_motivo_idx
  on public.filiacoes (emp_proprietaria_id, desfiliacao_motivo) where desfiliacao_motivo is not null;
