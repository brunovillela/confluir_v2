-- Regra do tenant: a filiação depende de uma fonte pagadora? (27/09/2026)
-- true  = todo recebimento fica vinculado a uma fonte pagadora, qualquer que
--         seja a forma (consignado, Pix ou boleto).
-- false = o filiado pode contribuir sem fonte (Pix/boleto direto à entidade).
-- Padrão true: é como o sistema sempre funcionou (tudo entra por fonte).
-- Configurado em Institucional › Organização › Regras de filiação. Idempotente.

alter table public.empresa
  add column if not exists filiacao_exige_fonte boolean not null default true;

comment on column public.empresa.filiacao_exige_fonte is
  'Se true, todo recebimento de filiado fica vinculado a uma fonte pagadora, qualquer que seja a forma de recebimento.';
