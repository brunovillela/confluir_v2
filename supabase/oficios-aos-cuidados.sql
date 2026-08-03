-- Confluir — Ofício: campo "Aos cuidados" (A/C) opcional (2026-08-01)
--
-- Linha opcional do cabeçalho do ofício (a pessoa específica dentro do
-- destinatário). Só aparece no PDF/impressão quando preenchida.

alter table public.oficios
  add column if not exists aos_cuidados text;
