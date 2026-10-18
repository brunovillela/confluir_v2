-- ============================================================================
-- Remessa de diárias EM PREPARAÇÃO (10/10/2026). Idempotente — rodar no SQL
-- Editor do Supabase ANTES do deploy.
--
-- A diária lançada entra na remessa da pessoa, que fica "em preparação": ela
-- junta as diárias e só depois ENVIA para avaliação. Remessa em preparação
-- não aparece para quem avalia nem na caixa de entrada. Quem não enviou em
-- 7 dias (contados da primeira diária) recebe um lembrete por semana.
--
--   preparacao ──enviar──▶ aberta (em avaliação) ──▶ aprovada | devolvida …
--
-- As remessas que já estão abertas continuam "aberta": para elas, contam
-- como já enviadas.
-- ============================================================================

alter table public.pessoal_diarias_remessas
  drop constraint if exists pessoal_diarias_remessas_situacao_chk;
alter table public.pessoal_diarias_remessas
  add constraint pessoal_diarias_remessas_situacao_chk
  check (situacao in ('preparacao', 'aberta', 'devolvida', 'reenviada', 'aprovada'));

alter table public.pessoal_diarias_remessas
  add column if not exists enviada_avaliacao_em timestamptz,
  add column if not exists enviada_avaliacao_por uuid references public.usuarios(id),
  add column if not exists lembrete_em timestamptz;

comment on column public.pessoal_diarias_remessas.situacao is
  'preparacao (a pessoa junta as diárias) | aberta (enviada, em avaliação) | devolvida | reenviada | aprovada (ordem gerada).';
comment on column public.pessoal_diarias_remessas.lembrete_em is
  'Último lembrete de remessa em preparação (um por semana, a partir de 7 dias da primeira diária).';

notify pgrst, 'reload schema';
