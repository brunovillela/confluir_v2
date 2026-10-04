-- Confluir — Web Push (2026-10-04, onda 4 / D2)
--
-- Cada navegador/celular em que a pessoa ligou "Receber no celular" vira uma
-- assinatura de push. O envio usa as chaves VAPID da Vercel
-- (NEXT_PUBLIC_VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY); sem elas o botão não
-- aparece e nada é enviado. O código tolera a tabela ausente.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.push_assinaturas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  usuario_id uuid not null references public.usuarios (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  usado_em timestamptz
);
create index if not exists push_assinaturas_usuario_idx on public.push_assinaturas (usuario_id);

alter table public.push_assinaturas enable row level security;
drop policy if exists tenant_isolation on public.push_assinaturas;
create policy tenant_isolation on public.push_assinaturas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.push_assinaturas to authenticated;
drop trigger if exists set_emp_from_jwt on public.push_assinaturas;
create trigger set_emp_from_jwt before insert on public.push_assinaturas
  for each row execute function public.set_emp_from_jwt();
