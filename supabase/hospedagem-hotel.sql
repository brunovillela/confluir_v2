-- Interface do hotel (Porta 4) — usuários dos hotéis parceiros.
-- Rodar no SQL Editor do Supabase. Idempotente.
--
-- O pessoal do hotel entra por /hotel (email + senha, convite enviado pela
-- gestão no painel) e só enxerga cupons/reservas do próprio hotel. Não há
-- vínculo com `usuarios`/`permissoes` (essas são do painel interno).

create table if not exists public.hospedagem_hotel_usuarios (
  id uuid primary key default extensions.uuid_generate_v4(),
  hotel_id uuid not null references public.hospedagem_hotel (id),
  email text not null unique,
  nome text,
  -- Conta no Supabase Auth (preenchida no convite ou no primeiro login).
  auth_user_id uuid,
  ativo boolean not null default true,
  emp_proprietaria_id uuid references public.empresa (id),
  created_at timestamptz not null default now()
);

create index if not exists hospedagem_hotel_usuarios_hotel_idx
  on public.hospedagem_hotel_usuarios (hotel_id);
create index if not exists hospedagem_hotel_usuarios_auth_idx
  on public.hospedagem_hotel_usuarios (auth_user_id);

-- Mesmo modelo do resto do banco: RLS deny-all (sem policies) — anon e
-- authenticated veem 0 linhas; todo acesso é server-side via service role.
alter table public.hospedagem_hotel_usuarios enable row level security;
