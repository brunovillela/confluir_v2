-- Confluir — Categorias de fonte pagadora (09/10/2026)
--
-- Além das duas categorias do sistema (Empregador e Fundo de pensão, que vêm
-- de empresa.fundo_pensao), cada entidade pode criar as suas — ex.: "Órgão
-- público", "Cooperativa". Cada categoria criada SEGUE AS REGRAS de uma das
-- duas do sistema (`base`): é isso que mantém o comportamento que depende de
-- fundo de pensão (cargo/lotação, condição padrão do vínculo).
--
-- A fonte aponta para a categoria em empresa.fonte_categoria_id; null = a
-- categoria do sistema pela marca fundo_pensao. A saúde dos cadastros ganha
-- uma aba por categoria (empresa.filiacao_saude_config, chave = id).
--
-- Cadastro em Representação › Empregadores › Categorias. Idempotente.

create table if not exists fonte_categorias (id uuid primary key default gen_random_uuid());
alter table fonte_categorias add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table fonte_categorias add column if not exists nome text not null default '';
alter table fonte_categorias add column if not exists base text not null default 'empregador';
alter table fonte_categorias add column if not exists created_at timestamptz not null default now();
alter table fonte_categorias add column if not exists updated_at timestamptz not null default now();

alter table fonte_categorias drop constraint if exists fonte_categorias_base_check;
alter table fonte_categorias add constraint fonte_categorias_base_check
  check (base in ('empregador', 'fundo_pensao'));

create unique index if not exists uq_fonte_categorias_emp_nome
  on fonte_categorias (emp_proprietaria_id, lower(nome));

alter table empresa
  add column if not exists fonte_categoria_id uuid references fonte_categorias(id) on delete set null;

comment on column empresa.fonte_categoria_id is
  'Categoria da fonte pagadora criada pela entidade; null = Empregador ou Fundo de pensão pela marca fundo_pensao.';

-- ── RLS por tenant ───────────────────────────────────────────────────────────

alter table fonte_categorias enable row level security;
drop policy if exists tenant_isolation on fonte_categorias;
create policy tenant_isolation on fonte_categorias for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on fonte_categorias to authenticated;
drop trigger if exists set_emp_from_jwt on fonte_categorias;
create trigger set_emp_from_jwt before insert on fonte_categorias
  for each row execute function public.set_emp_from_jwt();
