-- Confluir — Hospedagem: condições de uso definidas pela entidade (2026-09-12)
--
-- Além de ter a filiação ativa, a entidade pode exigir, para solicitar cupom:
--
--   1. FONTE — vínculo EM ABERTO com uma das fontes pagadoras marcadas;
--   2. REGIME — regime de trabalho do vínculo em aberto entre os marcados
--      (com fonte e regime ligados, o MESMO vínculo atende aos dois);
--   3. QUANTIDADE — no máximo N cupons não cancelados por mês ou por ano,
--      contados pela data de check-in;
--   4. LISTA — só as pessoas da lista de beneficiários (por CPF).
--
-- Valem no portal do associado e na emissão pelo painel, e aparecem para o
-- associado em Hospedagem → Regras de utilização. Sem linha nesta tabela,
-- nenhuma condição: o sistema não inventa restrição.
--
-- Código: src/lib/db/hospedagem-condicoes.ts e
-- src/lib/hospedagem-condicoes-constantes.ts.
--
-- Executar UMA VEZ no SQL Editor do Supabase.

-- ── 1. Condições (uma linha por tenant) ─────────────────────────────────────

create table if not exists hospedagem_condicoes (id uuid primary key default gen_random_uuid());
alter table hospedagem_condicoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table hospedagem_condicoes add column if not exists restringir_fontes boolean not null default false;
alter table hospedagem_condicoes add column if not exists fontes_ids uuid[] not null default '{}';
alter table hospedagem_condicoes add column if not exists limitar_quantidade boolean not null default false;
alter table hospedagem_condicoes add column if not exists quantidade_maxima integer not null default 1;
-- mes | ano
alter table hospedagem_condicoes add column if not exists quantidade_periodo text not null default 'mes';
alter table hospedagem_condicoes add column if not exists restringir_regimes boolean not null default false;
alter table hospedagem_condicoes add column if not exists regimes text[] not null default '{}';
alter table hospedagem_condicoes add column if not exists somente_beneficiarios boolean not null default false;
-- Texto livre mostrado ao associado nas regras de utilização.
alter table hospedagem_condicoes add column if not exists observacao text;
alter table hospedagem_condicoes add column if not exists atualizada_por uuid references usuarios(id);
alter table hospedagem_condicoes add column if not exists created_at timestamptz not null default now();
alter table hospedagem_condicoes add column if not exists updated_at timestamptz;

create unique index if not exists ux_hospedagem_condicoes_emp
  on hospedagem_condicoes (emp_proprietaria_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_hospedagem_condicoes_qtd') then
    alter table hospedagem_condicoes add constraint ck_hospedagem_condicoes_qtd
      check (quantidade_maxima between 1 and 365 and quantidade_periodo in ('mes', 'ano')) not valid;
  end if;
end $$;

-- ── 2. Lista de beneficiários (por CPF) ─────────────────────────────────────
-- Por CPF, e não por registro de filiação: a pessoa tem um registro por
-- vínculo, e o direito é DELA (mesmo critério do efeito suspensivo).

create table if not exists hospedagem_beneficiarios (id uuid primary key default gen_random_uuid());
alter table hospedagem_beneficiarios add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table hospedagem_beneficiarios add column if not exists cpf text;
alter table hospedagem_beneficiarios add column if not exists nome text;
alter table hospedagem_beneficiarios add column if not exists observacao text;
alter table hospedagem_beneficiarios add column if not exists incluido_por uuid references usuarios(id);
alter table hospedagem_beneficiarios add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_hospedagem_beneficiarios_cpf
  on hospedagem_beneficiarios (emp_proprietaria_id, cpf);

-- ── RLS e triggers, no padrão do projeto ────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'hospedagem_condicoes',
    'hospedagem_beneficiarios'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I for all to authenticated '
      'using (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid) '
      'with check (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on %I', t);
    execute format(
      'create trigger set_emp_from_jwt before insert on %I '
      'for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;
