-- Compras: "entregue no ato da compra" (29/09/2026).
--
-- Marcação da solicitação/aquisição: quando o produto ou serviço é entregue
-- no ato da compra, limite e local para receber não se aplicam; sem entrega
-- no ato, os dois são obrigatórios no formulário. Na aquisição direta a
-- marcação também decide o "recebido".
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.compras_solicitacoes
  add column if not exists solicitacao_entrega_no_ato boolean not null default false;
