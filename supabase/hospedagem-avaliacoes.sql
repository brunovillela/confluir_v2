-- Confluir — Hospedagem: avaliação da estadia pelo filiado (2026-10-02)
--
-- Inspiração: o Uber. Depois da estadia (o hotel marcou presença e o
-- check-out passou), o filiado dá uma NOTA de 1 a 5, marca ETIQUETAS (elogios
-- com 5 estrelas, "o que pode melhorar" com 1–4) e pode escrever um texto —
-- obrigatório com 1 ou 2 estrelas. Avaliação pendente TRAVA novo cupom/reserva
-- no portal. O HOTEL vê as avaliações sem o nome do filiado (só o mês da
-- estadia); o SINDICATO vê tudo, trata as notas baixas e pode ocultar do hotel
-- um texto ofensivo. Só estadias com check-out a partir do lançamento.
--
-- Uma linha por estadia (cupom): nasce PENDENTE (com o token do link sem
-- senha, diferente do token do QR da reserva) e vira RESPONDIDA. A tabela
-- `hospedagem_cupom` não tem emp_proprietaria_id: a entidade vem do hotel.
--
-- Padrão da casa: idempotente. Executar UMA VEZ no SQL Editor do Supabase.

create table if not exists public.hospedagem_avaliacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa (id),
  cupom_id uuid not null references public.hospedagem_cupom (id) on delete cascade,
  hotel_id uuid not null references public.hospedagem_hotel (id),
  filiado_id uuid references public.filiacoes (id),
  -- Link sem senha do e-mail (NÃO é o token do QR da reserva).
  token uuid not null default gen_random_uuid(),
  check_in date,
  check_out date not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'respondida')),
  nota smallint check (nota is null or nota between 1 and 5),
  etiquetas text[] not null default '{}',
  comentario text,
  respondida_em timestamptz,
  convite_enviado_em timestamptz,
  lembrete_enviado_em timestamptz,
  -- Sindicato: tratamento das notas baixas e moderação.
  tratada_em timestamptz,
  tratada_por_id uuid references public.usuarios (id),
  providencia text,
  oculta_hotel boolean not null default false,
  ocultada_por_id uuid references public.usuarios (id),
  created_at timestamptz not null default now(),
  check (situacao = 'pendente' or nota is not null)
);

create unique index if not exists ux_hospedagem_avaliacoes_cupom on public.hospedagem_avaliacoes (cupom_id);
create unique index if not exists ux_hospedagem_avaliacoes_token on public.hospedagem_avaliacoes (token);
create index if not exists idx_hospedagem_avaliacoes_hotel_checkout
  on public.hospedagem_avaliacoes (hotel_id, check_out);
create index if not exists idx_hospedagem_avaliacoes_filiado
  on public.hospedagem_avaliacoes (filiado_id, situacao);

alter table public.hospedagem_avaliacoes enable row level security;
drop policy if exists tenant_isolation on public.hospedagem_avaliacoes;
create policy tenant_isolation on public.hospedagem_avaliacoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.hospedagem_avaliacoes to authenticated;
drop trigger if exists set_emp_from_jwt on public.hospedagem_avaliacoes;
create trigger set_emp_from_jwt before insert on public.hospedagem_avaliacoes
  for each row execute function public.set_emp_from_jwt();

notify pgrst, 'reload schema';
