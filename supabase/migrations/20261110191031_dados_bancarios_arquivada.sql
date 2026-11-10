-- Confluir — Arquivar conta bancária (fornecedores)
--
-- POR QUÊ: conta usada em ordens de pagamento não pode ser excluída (a ordem
-- guarda para onde o dinheiro foi; a FK ordens_pagamento_dados_bancarios_id_fkey
-- impede). Sem como tirá-la de uso, a conta antiga seguia na ficha e nas
-- escolhas de pagamento. Arquivar a tira das escolhas sem mexer nas ordens.
--
-- COMO: arquivada_em (quando) e arquivada_por_usuario_id (quem). Conta com
-- arquivada_em preenchida sai das listas de meios de pagamento e dos
-- indicadores; as ordens antigas continuam apontando para ela. Desarquivar
-- limpa as duas colunas. Idempotente.

alter table public.dados_bancarios
  add column if not exists arquivada_em timestamptz,
  add column if not exists arquivada_por_usuario_id uuid references public.usuarios(id) on delete set null;

comment on column public.dados_bancarios.arquivada_em is 'Quando a conta foi arquivada: sai das escolhas de pagamento, as ordens antigas continuam com ela. [lgpd:nenhum]';
comment on column public.dados_bancarios.arquivada_por_usuario_id is 'Quem arquivou a conta. [lgpd:identificacao]';
