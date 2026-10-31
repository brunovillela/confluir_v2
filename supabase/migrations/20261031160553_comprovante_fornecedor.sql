-- Confluir — Comprovante de pagamento ao fornecedor: quem recebe e envio automático (31/10/2026)
--
-- POR QUÊ: o comprovante ia aos contatos marcados para receber a ordem de
-- compra, mas o financeiro do fornecedor costuma ser outra pessoa que o
-- comercial. E o envio era sempre manual. Decisão do usuário (onda 4 do plano
-- do RPA): marcação própria no contato e envio automático só nos fornecedores
-- marcados.
--
-- COMO:
--   1. empresa_contatos.recebe_comprovante — o contato recebe os comprovantes
--      de pagamento por e-mail. Sem nenhum marcado, o envio manual continua
--      indo aos que recebem a ordem de compra.
--   2. empresa.comprovante_automatico — ao anexar o comprovante à ordem paga,
--      ele vai sozinho aos contatos do fornecedor que o recebem.
--   Idempotente.

alter table public.empresa_contatos add column if not exists recebe_comprovante boolean not null default false;
alter table public.empresa add column if not exists comprovante_automatico boolean not null default false;

comment on column public.empresa_contatos.recebe_comprovante is 'O contato recebe por e-mail os comprovantes de pagamento das ordens do fornecedor (precisa de e-mail).';
comment on column public.empresa.comprovante_automatico is 'Fornecedor: o comprovante anexado à ordem paga é enviado automaticamente aos contatos que recebem comprovantes.';
