-- ============================================================================
-- Diárias: como a ordem de pagamento da remessa é autorizada (08/10/2026).
-- Idempotente — rodar no SQL Editor do Supabase ANTES do deploy.
--
--   remessa → quem aprova a remessa autoriza a ordem dela, sem olhar alçada
--             (a ordem nasce "A pagar"). É o comportamento atual e o padrão.
--   alcada  → a ordem só nasce autorizada se o valor couber na alçada
--             financeira de quem aprovou a remessa; senão vai para a fila
--             "Em autorização", como qualquer outra ordem.
-- ============================================================================

alter table public.financeiro_config
  add column if not exists diarias_autorizacao text not null default 'remessa';

do $$ begin
  alter table public.financeiro_config
    add constraint financeiro_config_diarias_autorizacao_chk
    check (diarias_autorizacao in ('remessa', 'alcada'));
exception when duplicate_object then null; end $$;

comment on column public.financeiro_config.diarias_autorizacao is
  'Autorização da ordem da remessa de diárias: remessa (quem aprova a remessa autoriza, sem alçada) | alcada (depende da alçada de quem aprova; acima dela, fila de autorização).';

notify pgrst, 'reload schema';
