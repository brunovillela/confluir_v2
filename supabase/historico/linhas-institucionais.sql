-- ============================================================================
-- Linhas institucionais (2026-09-18). Idempotente — rodar no SQL Editor.
--
-- Pedido do Bruno: "E-mails institucionais está no Institucional, mas linhas
-- institucionais não está lá também". Os celulares da entidade: número,
-- operadora, chip (ICCID) e com quem a linha está. No Bubble era o tipo
-- "Telefones institucionais" (51 linhas, sem responsável) — trazido por
-- scripts/migrar-linhas-bubble.mjs. A permissão já existia
-- (permissoes.ferramentas_linhas_telefone), sem tela.
-- ============================================================================

create table if not exists linhas_institucionais (id uuid primary key default gen_random_uuid());
alter table linhas_institucionais add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table linhas_institucionais add column if not exists numero text;
alter table linhas_institucionais add column if not exists operadora text;
alter table linhas_institucionais add column if not exists chip text;
alter table linhas_institucionais add column if not exists usuario_id uuid references usuarios(id) on delete set null;
alter table linhas_institucionais add column if not exists observacao text;
alter table linhas_institucionais add column if not exists bubble_id text;
alter table linhas_institucionais add column if not exists created_at timestamptz not null default now();
alter table linhas_institucionais add column if not exists updated_at timestamptz not null default now();

alter table linhas_institucionais alter column numero set not null;
comment on column linhas_institucionais.numero is 'Só dígitos, com DDD (ex.: 22981151126).';
comment on column linhas_institucionais.chip is 'Número do chip (ICCID), só dígitos.';
comment on column linhas_institucionais.usuario_id is 'Com quem a linha está (funcionário ou diretor).';

create unique index if not exists uq_linhas_institucionais_numero
  on linhas_institucionais (emp_proprietaria_id, numero);
create unique index if not exists uq_linhas_institucionais_bubble
  on linhas_institucionais (emp_proprietaria_id, bubble_id) where bubble_id is not null;
create index if not exists idx_linhas_institucionais_usuario
  on linhas_institucionais (usuario_id);

alter table linhas_institucionais enable row level security;
drop policy if exists tenant_isolation on linhas_institucionais;
create policy tenant_isolation on linhas_institucionais for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on linhas_institucionais to authenticated;
drop trigger if exists set_emp_from_jwt on linhas_institucionais;
create trigger set_emp_from_jwt before insert on linhas_institucionais
  for each row execute function public.set_emp_from_jwt();
