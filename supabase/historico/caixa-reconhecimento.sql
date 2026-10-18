-- ============================================================================
-- Caixa: reconhecimento de despesa pelo responsável da conta e transferência
-- entre contas (06/10/2026). Idempotente — rodar no SQL Editor do Supabase.
--
-- Quem compra em dinheiro escolhe uma conta de caixa aberta — e pode errar.
-- Quando a conta não é de quem lançou, o débito entra na hora (a compra não
-- trava), mas fica PENDENTE de reconhecimento do responsável da conta:
--   • reconhecida      — o responsável confirma que a despesa saiu do caixa dele;
--   • nao_reconhecida  — não reconhece (com motivo): vira pendência de quem
--                        lançou, que transfere a despesa para a conta certa;
--   • transferida      — o débito saiu desta conta para outra (a linha fica
--                        cancelada no extrato; a nova aponta para ela).
-- Nulo = não exige reconhecimento (lançada pelo próprio responsável, aporte,
-- perda, acerto e todo o histórico anterior).
-- ============================================================================

alter table public.caixa_movimentacoes
  add column if not exists reconhecimento text,
  add column if not exists reconhecimento_por_usuario_id uuid references public.usuarios (id),
  add column if not exists reconhecimento_em timestamptz,
  add column if not exists reconhecimento_motivo text,
  add column if not exists transferida_de_mov_id uuid references public.caixa_movimentacoes (id);

alter table public.caixa_movimentacoes drop constraint if exists caixa_movimentacoes_reconhecimento_chk;
alter table public.caixa_movimentacoes add constraint caixa_movimentacoes_reconhecimento_chk
  check (reconhecimento is null or reconhecimento in ('pendente', 'reconhecida', 'nao_reconhecida', 'transferida'));

create index if not exists caixa_movimentacoes_reconhecimento_idx
  on public.caixa_movimentacoes (reconhecimento)
  where reconhecimento in ('pendente', 'nao_reconhecida');
