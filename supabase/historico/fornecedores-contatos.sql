-- CONTATOS DO FORNECEDOR (16/10/2026).
--
-- Pessoas de contato de um cadastro de `empresa` (fornecedor): nome, cargo ou
-- setor, telefone e e-mail. Um pode ser o PRINCIPAL — o e-mail dele é o
-- sugerido no envio da ordem de compra quando o cadastro não tem e-mail de
-- contato. A mescla de fornecedores (mesclar_fornecedores) move os contatos
-- junto, pela FK empresa_id.
--
-- Idempotente: pode rodar mais de uma vez.

create table if not exists public.empresa_contatos (id uuid primary key default gen_random_uuid());
alter table public.empresa_contatos add column if not exists emp_proprietaria_id uuid references public.empresa(id);
alter table public.empresa_contatos add column if not exists empresa_id uuid references public.empresa(id) on delete cascade;
alter table public.empresa_contatos add column if not exists nome text not null default '';
alter table public.empresa_contatos add column if not exists cargo text;
alter table public.empresa_contatos add column if not exists telefone text;
alter table public.empresa_contatos add column if not exists email text;
alter table public.empresa_contatos add column if not exists principal boolean not null default false;
alter table public.empresa_contatos add column if not exists observacao text;
alter table public.empresa_contatos add column if not exists created_at timestamptz not null default now();
alter table public.empresa_contatos add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_empresa_contatos_empresa
  on public.empresa_contatos (empresa_id);

-- Isolamento por tenant (mesmo padrão das demais tabelas do tenant).
alter table public.empresa_contatos enable row level security;
drop policy if exists tenant_isolation on public.empresa_contatos;
create policy tenant_isolation on public.empresa_contatos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.empresa_contatos to authenticated;
drop trigger if exists set_emp_from_jwt on public.empresa_contatos;
create trigger set_emp_from_jwt before insert on public.empresa_contatos
  for each row execute function public.set_emp_from_jwt();
