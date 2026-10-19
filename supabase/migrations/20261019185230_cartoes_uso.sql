-- Confluir — Uso do cartão: corporativo ou com um responsável (19/10/2026)
--
-- POR QUÊ: pedido do usuário. O cartão CORPORATIVO é de uso comum,
-- centralizado: a fatura fica só no Financeiro. O cartão que fica na POSSE de
-- um responsável tem a fatura disponível também para ele, num acesso como o
-- "Meu caixa" (Meu perfil › Meu cartão). O cadastro precisa dizer qual é.
--
-- COMO: cartoes.uso ('corporativo' | 'responsavel'), padrão corporativo — os
-- cartões existentes continuam só no Financeiro até alguém marcar o
-- responsável. O responsável é o titular_usuario_id que já existia.

alter table public.cartoes
  add column if not exists uso text not null default 'corporativo';

alter table public.cartoes drop constraint if exists cartoes_uso_check;
alter table public.cartoes
  add constraint cartoes_uso_check check (uso in ('corporativo', 'responsavel'));

comment on column public.cartoes.uso is 'corporativo (uso comum: a fatura fica no Financeiro) ou responsavel (na posse do titular_usuario_id, que vê as faturas em Meu perfil › Meu cartão).';
