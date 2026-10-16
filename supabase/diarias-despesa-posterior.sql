-- ============================================================================
-- Diárias: despesas lançadas DEPOIS da viagem (16/10/2026). Idempotente —
-- rodar no SQL Editor do Supabase ANTES do deploy.
--
-- Quem já recebeu a diária (aprovada) pode lançar, em até 30 dias após o fim
-- dela, as despesas extras com comprovante. Elas entram como um COMPLEMENTO
-- da diária original — uma solicitação de valor zero que só carrega as
-- despesas — na remessa em preparação da pessoa, e seguem o fluxo de sempre:
-- enviar, avaliar, ordem de pagamento rateada. A diária original não muda.
-- ============================================================================

alter table public.pessoal_diarias_solicitacoes
  add column if not exists complemento_de uuid references public.pessoal_diarias_solicitacoes(id);

comment on column public.pessoal_diarias_solicitacoes.complemento_de is
  'Diária já recebida de que esta solicitação é complemento: só despesas lançadas depois da viagem (valor da diária zero).';

create index if not exists idx_diarias_solicitacoes_complemento
  on public.pessoal_diarias_solicitacoes (complemento_de)
  where complemento_de is not null;

notify pgrst, 'reload schema';
