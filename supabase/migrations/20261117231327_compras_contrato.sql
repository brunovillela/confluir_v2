-- POR QUÊ: a compra feita no âmbito de um contrato não dizia qual: só havia
-- a marca solicitacao_e_via_contrato (do Bubble, sem uso no código). O
-- Financeiro quer ver o contrato na ordem de pagamento da compra e nos
-- extratos (17/11/2026), como já vê o projeto.
--
-- COMO: compras_solicitacoes.contrato_id → contratos (set null: contrato
-- excluído não apaga a compra). Escolhido ao registrar ou editar a compra,
-- opcional. Idempotente.

alter table public.compras_solicitacoes
  add column if not exists contrato_id uuid references public.contratos(id) on delete set null;

create index if not exists compras_solicitacoes_contrato_idx
  on public.compras_solicitacoes (contrato_id)
  where contrato_id is not null;

comment on column public.compras_solicitacoes.contrato_id is 'Contrato no âmbito do qual a compra é feita (opcional). Aparece na ordem de pagamento da compra e nos extratos. [lgpd:nenhum]';
