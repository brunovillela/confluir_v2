-- Confluir — Hospedagem: telefone do hotel para o associado (2026-10-11)
--
-- Portal do associado, onda 3 (achado A40): depois do pedido, o associado
-- precisa falar com o hotel. O endereço já existe (tabela `enderecos`, pela
-- empresa do hotel); o telefone não existia em lugar nenhum. Com esta coluna
-- preenchida, o portal mostra o telefone com toque para ligar (tel:) no
-- formulário e na página da reserva. Sem ela, mostra só o endereço.
--
-- Falta, depois de rodar: um campo "Telefone da recepção" no cadastro do
-- hotel no painel (Hospedagem → Hotéis), para a gestão preencher.
--
-- Padrão da casa: idempotente. Executar UMA VEZ no SQL Editor do Supabase.
-- hospedagem_hotel já tem a política de tenant (rls-emp-todas.sql): coluna
-- nova não muda nada no RLS.

alter table public.hospedagem_hotel
  add column if not exists telefone text;

comment on column public.hospedagem_hotel.telefone is
  'Telefone da recepção mostrado ao associado no portal (Hospedagem).';

notify pgrst, 'reload schema';
