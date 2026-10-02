-- Confluir — Hospedagem: cupom EMERGENCIAL feito pelo hotel (2026-10-02)
--
-- Quando o hóspede não consegue pedir o cupom pelo portal, o pessoal do hotel
-- faz, na área do hotel, uma reserva direta — só para HOJE e só para o
-- PRÓPRIO hotel, com as mesmas regras do cupom (filiado Ativo, convênio
-- vigente, condições do sindicato; na demanda garantida, também o não
-- comparecimento). O cupom fica marcado como emergencial, com quem do hotel
-- o fez, quando e por quê; a gestão é avisada no sino.
--
-- Padrão da casa: idempotente. Executar UMA VEZ no SQL Editor do Supabase.

alter table public.hospedagem_cupom
  add column if not exists emergencial boolean not null default false;
alter table public.hospedagem_cupom
  add column if not exists emergencial_por_id uuid references public.hospedagem_hotel_usuarios (id);
alter table public.hospedagem_cupom
  add column if not exists emergencial_em timestamptz;
alter table public.hospedagem_cupom
  add column if not exists emergencial_motivo text;

create index if not exists idx_hospedagem_cupom_emergencial
  on public.hospedagem_cupom (hotel_id, check_in) where emergencial = true;

notify pgrst, 'reload schema';
