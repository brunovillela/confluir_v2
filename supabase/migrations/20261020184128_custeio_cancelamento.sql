-- Confluir — Custeio: cancelamento com motivo, autor e data (20/10/2026)
--
-- POR QUÊ: o cancelamento do custeio não registrava quem cancelou, quando nem
-- por quê (a reprovação registra). Agora o custeio autorizado também pode ser
-- cancelado — as ordens ainda não pagas são canceladas junto — e o
-- cancelamento das ordens pelo Financeiro se reflete no custeio: quando todas
-- as ordens são canceladas lá, o custeio fica cancelado; desfeito o
-- cancelamento de uma ordem, o custeio volta a autorizado.
--
-- COMO: três colunas em institucional_custeios, limpas quando o custeio é
-- reaberto. Idempotente.

alter table public.institucional_custeios
  add column if not exists cancelamento_motivo text,
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por_id uuid references public.usuarios(id);

comment on column public.institucional_custeios.cancelamento_motivo is 'Motivo do cancelamento do custeio (pelo Custeio ou, quando todas as ordens foram canceladas, pelo Financeiro).';
comment on column public.institucional_custeios.cancelado_em is 'Quando o custeio foi cancelado.';
comment on column public.institucional_custeios.cancelado_por_id is 'Quem cancelou o custeio (ou a última ordem dele no Financeiro).';
