-- ============================================================================
-- Avaliação da REMESSA de diárias (08/10/2026). Idempotente — rodar no SQL
-- Editor do Supabase ANTES do deploy.
--
-- A aprovação deixa de ser de cada diária e passa a ser da remessa:
--   aberta ──aprovar──▶ aprovada (nasce a ordem com o valor da remessa,
--                                 rateada por centro de custo)
--   aberta ──devolver─▶ devolvida ──reenviar──▶ reenviada ──aprovar──▶ aprovada
-- Na devolução o avaliador escreve a observação geral e aponta, em cada
-- diária, a não conformidade (pendencia_observacao).
-- ============================================================================

alter table public.pessoal_diarias_remessas
  add column if not exists situacao text not null default 'aberta',
  add column if not exists devolucao_observacao text,
  add column if not exists devolvida_em timestamptz,
  add column if not exists devolvida_por uuid references public.usuarios(id),
  add column if not exists reenviada_em timestamptz,
  add column if not exists historico jsonb not null default '[]'::jsonb;

comment on column public.pessoal_diarias_remessas.situacao is
  'Avaliação da remessa: aberta | devolvida | reenviada | aprovada (aprovada = ordem gerada; enviado = true).';
comment on column public.pessoal_diarias_remessas.historico is
  'Passos da avaliação: [{em, por, acao: devolvida|reenviada|aprovada, observacao, pendencias:[{diariaId, observacao}]}].';

do $$ begin
  alter table public.pessoal_diarias_remessas
    add constraint pessoal_diarias_remessas_situacao_chk
    check (situacao in ('aberta', 'devolvida', 'reenviada', 'aprovada'));
exception when duplicate_object then null; end $$;

-- Remessas já enviadas (com ordem) e as migradas do sistema anterior ficam aprovadas.
update public.pessoal_diarias_remessas
   set situacao = 'aprovada'
 where enviado is true and situacao <> 'aprovada';

alter table public.pessoal_diarias_solicitacoes
  add column if not exists pendencia_observacao text;

comment on column public.pessoal_diarias_solicitacoes.pendencia_observacao is
  'Não conformidade apontada pelo avaliador na última devolução da remessa.';

create index if not exists idx_diarias_remessas_situacao
  on public.pessoal_diarias_remessas (emp_proprietaria_id, situacao)
  where bubble_id is null and enviado is not true;

notify pgrst, 'reload schema';
