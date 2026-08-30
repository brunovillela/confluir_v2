-- Confluir — Voto em separado + controle de lacres (2026-08-29)
--
-- VOTO EM SEPARADO: eleitor que alega ter direito a votar mas não está na lista
-- de aptos. O mesário cadastra os dados dele e libera a cédula; na urna DIGITAL
-- o voto fica RETIDO (ligado ao cadastro) até a apuração — deferido conta,
-- indeferido é descartado. Decisão do usuário (2026-08-29): aceita-se o vínculo
-- pessoa↔voto SOMENTE para os votos em separado (necessário para poder
-- descartá-los); os votos normais seguem 100% anônimos.
--
-- LACRES: controle por número de série dos dois lacres da urna física (boca e
-- principal), com instalação/rompimento e o registro de que o lacre rompido foi
-- guardado dentro da urna.
--
-- Idempotente. Rode no SQL Editor do Supabase.

-- ── Voto em separado ────────────────────────────────────────────────────────
create table if not exists voto_em_separado (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  assembleia_id uuid not null references voto_assembleias(id),
  rod_assembleia_id uuid references voto_rod_assembleias(id),
  urna_id uuid references voto_urnas(id),
  mesario_id uuid references voto_mesarios(id),
  nome_completo text not null,
  cpf text,
  data_nascimento date,
  telefone text,
  email text,
  -- pendente até a apuração; deferido conta o voto, indeferido descarta.
  status text not null default 'pendente'
    check (status in ('pendente', 'deferido', 'indeferido')),
  -- carimbo de quando a cédula foi lançada (digital) ou o eleitor registrado
  -- para votar em papel (físico).
  votou_em timestamptz,
  decidido_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_voto_em_separado_assembleia
  on voto_em_separado (assembleia_id);
create index if not exists idx_voto_em_separado_urna
  on voto_em_separado (urna_id);

-- O voto retido aponta para o cadastro em separado (só para poder deferir/
-- descartar). Voto normal tem em_separado_id NULO e continua anônimo.
alter table voto_online
  add column if not exists em_separado_id uuid references voto_em_separado(id);

-- O terminal pode liberar a cédula para um eleitor em separado (sem apto).
alter table voto_urna_terminais
  add column if not exists em_separado_liberado_id uuid
    references voto_em_separado(id);

-- ── Lacres da urna ──────────────────────────────────────────────────────────
create table if not exists voto_urna_lacres (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  urna_id uuid not null references voto_urnas(id),
  -- boca = onde se introduz a cédula; principal = abertura total da urna.
  tipo text not null check (tipo in ('boca', 'principal')),
  numero text not null,
  evento text not null check (evento in ('instalado', 'rompido')),
  data timestamptz not null default now(),
  -- lacre rompido é guardado dentro da urna (via boca).
  guardado_na_urna boolean not null default false,
  observacao text,
  created_at timestamptz not null default now()
);
create index if not exists idx_voto_urna_lacres_urna
  on voto_urna_lacres (urna_id, data);

-- ── RLS (isolamento por tenant; claim CORRETA `tenant_id`, ver admin.ts) ─────
alter table voto_em_separado enable row level security;
alter table voto_urna_lacres enable row level security;

do $$
declare
  t text;
  claim constant text := $q$(auth.jwt() ->> 'tenant_id')::uuid$q$;
begin
  foreach t in array array['voto_em_separado', 'voto_urna_lacres']
  loop
    execute format('drop policy if exists %I on %I', t || '_tenant', t);
    execute format(
      'create policy %I on %I for all using (emp_proprietaria_id = %s) with check (emp_proprietaria_id = %s)',
      t || '_tenant', t, claim, claim
    );
  end loop;
end $$;
