-- Faturamento do hotel (2026-07-17) — rodar no SQL Editor do Supabase. Idempotente.
--
-- 1. Configuração do acordo no hotel: vigência e exigência (futura) do
--    relatório/extrato assinado para o serviço ser faturável.
-- 2. Dados bancários do hotel para recebimento (Pix / depósito TED).
--
-- O bucket privado 'hospedagem' (DANFEs e relatórios/extratos) já foi criado
-- via API. As tabelas hospedagem_fatura e hospedagem_servico.fatura_id já
-- existem (migração do Bubble) e são consumidas como estão.

alter table public.hospedagem_hotel
  add column if not exists exige_relatorio_para_faturar boolean not null default false,
  add column if not exists acordo_vigencia_inicio date,
  add column if not exists acordo_vigencia_fim date;

create table if not exists public.hospedagem_hotel_contas (
  id uuid primary key default extensions.uuid_generate_v4(),
  hotel_id uuid not null references public.hospedagem_hotel (id),
  -- 'pix' ou 'deposito' (depósito bancário / TED)
  tipo text not null check (tipo in ('pix', 'deposito')),
  titular text,
  documento text,
  banco text,
  agencia text,
  conta text,
  chave_pix text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists hospedagem_hotel_contas_hotel_idx
  on public.hospedagem_hotel_contas (hotel_id);

-- RLS deny-all (sem policies) — acesso só server-side via service role.
alter table public.hospedagem_hotel_contas enable row level security;
