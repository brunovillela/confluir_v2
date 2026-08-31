-- Confluir — Hospedagem: hotel conveniado vinculado a um CONTRATO (2026-08-30)
--
-- Regra do usuário: todo hotel conveniado é regido por um CONTRATO. O hotel
-- passa a apontar para um contrato (contratos), de onde vêm a VIGÊNCIA (limita a
-- retirada de cupons) e o CENTRO DE CUSTO (usado na ordem de pagamento do
-- faturamento). O faturamento já gera uma ordem "Em autorização"; agora ela
-- entra vinculada ao contrato (ordens_pagamento.contrato_id) e com o centro de
-- custo do contrato (centro_custo_despesa_id).
--
-- ordens_pagamento.contrato_id já existe (supabase/contratos-ordens.sql) e
-- centro_custo_despesa_id também. Aqui só falta o vínculo hotel → contrato.
-- Coluna NULA nos hotéis já existentes (não quebra); o cadastro passa a exigir e
-- as operações (faturar / emitir cupom) dependem dela. Idempotente.

alter table hospedagem_hotel
  add column if not exists contrato_id uuid references contratos(id);

create index if not exists idx_hospedagem_hotel_contrato
  on hospedagem_hotel (contrato_id);
