-- Confluir — Ofício: cancelamento registrado, inclusive depois de assinado (2026-10-02)
--
-- Cancelar é um ato POSTERIOR à emissão/assinatura: nada do que foi assinado
-- muda (envelope em documento_assinaturas, hash, PDF assinado no bucket e a
-- trilha append-only ficam como estão). O ofício ganha só a marca de
-- cancelado — quando, quem e por quê — e a trilha da assinatura, quando há,
-- ganha um evento novo "documento_cancelado". O número NÃO volta para reuso.
--
-- Idempotente: pode rodar de novo sem efeito.

alter table public.oficios
  add column if not exists cancelado_em timestamptz,
  add column if not exists cancelado_por_id uuid references public.usuarios(id) on delete set null,
  add column if not exists cancelamento_motivo text;

comment on column public.oficios.cancelado_em is
  'Quando o ofício foi cancelado (situacao = Cancelado). Ofícios cancelados antes de 02/10/2026 ficam sem data.';
comment on column public.oficios.cancelado_por_id is
  'Usuário do painel que cancelou o ofício.';
comment on column public.oficios.cancelamento_motivo is
  'Motivo do cancelamento (obrigatório no painel, mín. 10 caracteres). Aparece na página pública /verificar quando o ofício tinha assinatura eletrônica.';
