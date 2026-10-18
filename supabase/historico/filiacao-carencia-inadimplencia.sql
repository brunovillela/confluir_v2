-- Confluir — Filiados: carência de direitos e inadimplência (2026-09-07)
--
-- Duas regras que toda entidade tem no estatuto e nenhuma tinha no sistema:
--
--   1. CARÊNCIA — quanto tempo o filiado espera, depois de se filiar, para
--      usar cada direito. Existe sobretudo para evitar filiação em massa às
--      vésperas de uma eleição.
--
--   2. INADIMPLÊNCIA — quantas contribuições não pagas tornam o filiado
--      inativo. Por tipo de remessa, porque Associativa (mensal) e Sindical
--      (rara) não podem ter o mesmo limite.
--
-- As duas admitem EFEITO SUSPENSIVO por pessoa, com justificativa e autor:
-- quem trocou de empregador não deve recomeçar a carência, e quem está
-- afastado não deve ser acusado de não pagar. Regra sem exceção documentada
-- vira injustiça silenciosa.
--
-- Executar UMA VEZ no SQL Editor do Supabase.

-- ── 1. Carência por benefício ───────────────────────────────────────────────
-- Uma linha por benefício e por tenant. Benefício sem linha, ou com `dias`
-- zero, não tem carência — que é o padrão: o sistema não inventa restrição.

create table if not exists filiacao_carencias (id uuid primary key default gen_random_uuid());
alter table filiacao_carencias add column if not exists emp_proprietaria_id uuid references empresa(id);
-- hospedagem | saude | juridico | eventos | votacao
alter table filiacao_carencias add column if not exists beneficio text;
alter table filiacao_carencias add column if not exists dias integer not null default 0;
alter table filiacao_carencias add column if not exists ativo boolean not null default false;
alter table filiacao_carencias add column if not exists observacao text;
alter table filiacao_carencias add column if not exists atualizada_por uuid references usuarios(id);
alter table filiacao_carencias add column if not exists created_at timestamptz not null default now();
alter table filiacao_carencias add column if not exists updated_at timestamptz;

create unique index if not exists ux_filiacao_carencias
  on filiacao_carencias (emp_proprietaria_id, beneficio);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_filiacao_carencias_dias') then
    alter table filiacao_carencias add constraint ck_filiacao_carencias_dias
      check (dias >= 0 and dias <= 3650) not valid;
  end if;
end $$;

-- ── 2. Regras de inadimplência, por tipo de remessa ─────────────────────────
-- `tipo` casa com filiacao_recebe_remessa.tipo (Associativa, Assistencial,
-- Sindical…) e é TEXTO LIVRE de propósito: cada entidade tem os seus.

create table if not exists filiacao_inadimplencia_regras (id uuid primary key default gen_random_uuid());
alter table filiacao_inadimplencia_regras add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_inadimplencia_regras add column if not exists tipo text;
alter table filiacao_inadimplencia_regras add column if not exists quantidade integer not null default 3;
-- true: só conta se as faltas forem SEGUIDAS; false: soma faltas avulsas.
alter table filiacao_inadimplencia_regras add column if not exists exigir_consecutivas boolean not null default true;
-- Quantas remessas olhar para trás. Sem janela, uma falta de 2019 pesaria hoje.
alter table filiacao_inadimplencia_regras add column if not exists janela_remessas integer not null default 12;
alter table filiacao_inadimplencia_regras add column if not exists ativo boolean not null default false;
alter table filiacao_inadimplencia_regras add column if not exists atualizada_por uuid references usuarios(id);
alter table filiacao_inadimplencia_regras add column if not exists created_at timestamptz not null default now();
alter table filiacao_inadimplencia_regras add column if not exists updated_at timestamptz;

create unique index if not exists ux_filiacao_inadimplencia_tipo
  on filiacao_inadimplencia_regras (emp_proprietaria_id, tipo);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_filiacao_inadimplencia_qtd') then
    alter table filiacao_inadimplencia_regras add constraint ck_filiacao_inadimplencia_qtd
      check (quantidade >= 1 and janela_remessas >= 1) not valid;
  end if;
end $$;

-- ── 3. Efeito suspensivo, por pessoa ────────────────────────────────────────
-- Identifica por CPF, e não por registro de filiação: a pessoa costuma ter
-- vários registros (um por vínculo), e a suspensão vale para ELA.

create table if not exists filiacao_suspensoes (id uuid primary key default gen_random_uuid());
alter table filiacao_suspensoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_suspensoes add column if not exists cpf text;
-- carencia | inadimplencia
alter table filiacao_suspensoes add column if not exists escopo text;
-- Nulo = vale para todos os benefícios (ou todos os tipos de remessa).
alter table filiacao_suspensoes add column if not exists alvo text;
alter table filiacao_suspensoes add column if not exists motivo text;
alter table filiacao_suspensoes add column if not exists vigencia_ate date;
alter table filiacao_suspensoes add column if not exists concedida_por uuid references usuarios(id);
alter table filiacao_suspensoes add column if not exists revogada_em timestamptz;
alter table filiacao_suspensoes add column if not exists revogada_por uuid references usuarios(id);
alter table filiacao_suspensoes add column if not exists created_at timestamptz not null default now();

create index if not exists idx_filiacao_suspensoes_cpf
  on filiacao_suspensoes (emp_proprietaria_id, cpf, escopo)
  where revogada_em is null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_filiacao_suspensoes_escopo') then
    alter table filiacao_suspensoes add constraint ck_filiacao_suspensoes_escopo
      check (escopo in ('carencia', 'inadimplencia')) not valid;
  end if;
end $$;

-- ── 4. Pleito restrito a filiados ───────────────────────────────────────────
-- Assembleia de categoria é de TODA a base, filiado ou não — a carência e a
-- adimplência não podem alcançá-la. Este marcador separa o pleito interno
-- (eleição de diretoria, consulta aos associados), onde elas valem.

alter table voto_assembleias add column if not exists somente_filiados boolean not null default false;

create index if not exists idx_voto_assembleias_somente_filiados
  on voto_assembleias (emp_proprietaria_id)
  where somente_filiados = true;

-- ── RLS e triggers, no padrão do projeto ────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'filiacao_carencias',
    'filiacao_inadimplencia_regras',
    'filiacao_suspensoes'
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
