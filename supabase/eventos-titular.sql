-- Confluir — Eventos: canal do titular dos dados (2026-09-05)
--
-- Quem se inscreve num evento pode não ser filiado nem ter conta no sistema —
-- e ainda assim tem direito de ver, corrigir e pedir a exclusão dos seus dados
-- (LGPD art. 18). O `/portal/lgpd` de hoje só atende filiado.
--
-- Esta tabela é a sessão CURTA desse canal: a pessoa informa o e-mail, recebe
-- um código, e ganha um token de acesso válido por poucas horas. Não é conta,
-- não tem senha, e expira sozinha.
--
-- Executar UMA VEZ no SQL Editor do Supabase.

create table if not exists eventos_titular_sessao (id uuid primary key default gen_random_uuid());
alter table eventos_titular_sessao add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos_titular_sessao add column if not exists email text;
alter table eventos_titular_sessao add column if not exists codigo_hash text;
alter table eventos_titular_sessao add column if not exists codigo_expira_em timestamptz;
alter table eventos_titular_sessao add column if not exists codigo_tentativas integer not null default 0;
alter table eventos_titular_sessao add column if not exists token uuid default gen_random_uuid();
alter table eventos_titular_sessao add column if not exists token_expira_em timestamptz;
alter table eventos_titular_sessao add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_eventos_titular_token
  on eventos_titular_sessao (token);
create index if not exists idx_eventos_titular_email
  on eventos_titular_sessao (emp_proprietaria_id, email);

alter table eventos_titular_sessao enable row level security;
drop policy if exists tenant_isolation on eventos_titular_sessao;
create policy tenant_isolation on eventos_titular_sessao for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos_titular_sessao to authenticated;
drop trigger if exists set_emp_from_jwt on eventos_titular_sessao;
create trigger set_emp_from_jwt before insert on eventos_titular_sessao
  for each row execute function public.set_emp_from_jwt();

-- Tipos de pedido usados por este canal (a coluna `tipo` é texto livre e já
-- existia; ficam aqui documentados): 'acesso' | 'correcao' | 'exclusao'.
