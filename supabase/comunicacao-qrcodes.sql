-- Confluir — Comunicação › QR Codes (2026-08-31)
--
-- QR Codes DINÂMICOS: a imagem carrega uma URL curta do tenant
-- (https://<slug-tenant>.<dominio>/q/<slug>) que REDIRECIONA ao destino.
-- Desativar o QR faz o link parar de redirecionar (página de aviso) — o
-- controle ativo/inativo vale até para peças já impressas. O redirecionamento
-- conta leituras (sem identificar quem escaneou).
--
-- Padrão da casa: idempotente, RLS inline por tenant (como noticias.sql),
-- trigger set_emp_from_jwt. Executar UMA VEZ no SQL Editor do Supabase.

create table if not exists comunicacao_qrcodes (id uuid primary key default gen_random_uuid());
alter table comunicacao_qrcodes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_qrcodes add column if not exists slug text;              -- código curto da URL /q/<slug>
alter table comunicacao_qrcodes add column if not exists titulo text;
alter table comunicacao_qrcodes add column if not exists finalidade text;        -- para que serve / onde será aplicado
alter table comunicacao_qrcodes add column if not exists destino_url text;       -- para onde o QR leva
alter table comunicacao_qrcodes add column if not exists ativo boolean not null default true;
alter table comunicacao_qrcodes add column if not exists criado_por uuid references usuarios(id);
alter table comunicacao_qrcodes add column if not exists leituras integer not null default 0;
alter table comunicacao_qrcodes add column if not exists ultima_leitura timestamptz;
alter table comunicacao_qrcodes add column if not exists created_at timestamptz not null default now();
alter table comunicacao_qrcodes add column if not exists updated_at timestamptz;

create unique index if not exists ux_comunicacao_qrcodes_slug
  on comunicacao_qrcodes (emp_proprietaria_id, slug);
create index if not exists idx_comunicacao_qrcodes_emp
  on comunicacao_qrcodes (emp_proprietaria_id);

-- RLS por tenant (inline — mesmo padrão de noticias.sql)
alter table comunicacao_qrcodes enable row level security;
drop policy if exists tenant_isolation on comunicacao_qrcodes;
create policy tenant_isolation on comunicacao_qrcodes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_qrcodes to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_qrcodes;
create trigger set_emp_from_jwt before insert on comunicacao_qrcodes
  for each row execute function public.set_emp_from_jwt();
