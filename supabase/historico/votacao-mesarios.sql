-- Confluir — Votação presencial com mesários: urnas, mesários e terminais
-- (2026-08-29)
--
-- Redesenho do presencial (regras do usuário):
--   1. reunião de colaboradores  — presencial na porta da base (agregado);
--   2. online                    — área do filiado / ambiente público;
--   3. presencial com urnas      — urnas FÍSICAS ou DIGITAIS no local;
--   4. híbrida                   — online + presencial com urnas.
-- (híbrida deriva das flags: online=true E urnas_de_votacao=true.)
--
-- O mesário NÃO registra o voto: ele registra a PRESENÇA do eleitor. Depois,
--   - urna física:  o eleitor deposita o voto em papel (resultado agregado);
--   - urna digital: a cédula é liberada num TERMINAL DE VOTAÇÃO separado e
--     pareado, onde o próprio eleitor vota (secreto).
--
-- SIGILO NO BANCO (regra dura): quem operou e em qual urna ficam no registro de
-- PRESENÇA (voto_assembleias_aptos) — que identifica o eleitor mas não o voto.
-- O VOTO (voto_online) fica anônimo: sem eleitor_id e sem mesario_id; só carrega
-- a urna (localização agregada). Assim nem mesário nem admin ligam eleitor↔voto.
--
-- Idempotente. Rode no SQL Editor do Supabase.

-- ── Mesários ────────────────────────────────────────────────────────────────
-- Cadastrados por rodada (nome/CPF/e-mail). Login no ambiente /mesario é por
-- e-mail via OTP do Supabase (mesmo mecanismo do eleitor público em /votar): o
-- ambiente casa user.email → voto_mesarios.email.
create table if not exists voto_mesarios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  rod_assembleia_id uuid not null references voto_rod_assembleias(id),
  nome_completo text not null,
  cpf text,
  email text not null,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_voto_mesarios_rodada
  on voto_mesarios (rod_assembleia_id);
create index if not exists idx_voto_mesarios_email
  on voto_mesarios (emp_proprietaria_id, lower(email));

-- ── Urnas ───────────────────────────────────────────────────────────────────
-- Uma urna (física ou digital) de uma assembleia. A janela [abertura,fechamento]
-- limita o acesso do mesário à urna ao horário estabelecido.
create table if not exists voto_urnas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  assembleia_id uuid not null references voto_assembleias(id),
  rod_assembleia_id uuid references voto_rod_assembleias(id),
  nome text not null,
  tipo text not null default 'digital' check (tipo in ('fisica', 'digital')),
  abertura timestamptz,
  fechamento timestamptz,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_voto_urnas_assembleia
  on voto_urnas (assembleia_id);

-- ── Terminais de votação (urna digital) ─────────────────────────────────────
-- O terminal de votação (computador separado) se registra, mostra um código de
-- pareamento e fica aguardando. O mesário aprova o código no ambiente dele → os
-- dois ficam pareados àquela urna. A cada eleitor, o mesário registra a presença
-- e "libera" a cédula (apto_liberado_id) para o terminal pareado; ao votar, o
-- terminal limpa a liberação. O terminal guarda seu sessao_token (cookie) — o
-- código de pareamento nunca dá acesso sozinho.
create table if not exists voto_urna_terminais (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  urna_id uuid references voto_urnas(id),
  codigo text not null,
  sessao_token text not null,
  pareada boolean not null default false,
  apto_liberado_id uuid references voto_assembleias_aptos(id),
  liberado_em timestamptz,
  encerrada boolean not null default false,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists idx_voto_urna_terminais_codigo
  on voto_urna_terminais (emp_proprietaria_id, codigo)
  where not encerrada;
create index if not exists idx_voto_urna_terminais_urna
  on voto_urna_terminais (urna_id)
  where not encerrada;

-- ── Presença no apto (quem operou e em qual urna) ───────────────────────────
-- A PRESENÇA é o que o mesário registra. hora_voto (já existente) segue marcando
-- a participação/voto único. presenca_urna_id é o "registro da urna em que votou"
-- que o votante pode consultar. mesario_id/urna_id ficam AQUI (no eleitor), nunca
-- no voto — é isto que preserva o sigilo no banco.
alter table voto_assembleias_aptos
  add column if not exists presenca_em timestamptz;
alter table voto_assembleias_aptos
  add column if not exists presenca_mesario_id uuid references voto_mesarios(id);
alter table voto_assembleias_aptos
  add column if not exists presenca_urna_id uuid references voto_urnas(id);

-- ── Voto: resolve a FK órfã do mesario_id ───────────────────────────────────
-- O voto NÃO recebe mesario_id nem urna_id (fica anônimo por sigilo — gravar a
-- urna de-anonimizaria urnas de baixo comparecimento; a urna fica no registro de
-- PRESENÇA do eleitor). Mesmo assim resolvemos a FK órfã de mesario_id
-- apontando-a para voto_mesarios, para o schema ficar coerente.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'voto_online_mesario_id_fkey'
  ) then
    alter table voto_online drop constraint voto_online_mesario_id_fkey;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'voto_online_mesario_id_mesarios_fkey'
  ) then
    alter table voto_online
      add constraint voto_online_mesario_id_mesarios_fkey
      foreign key (mesario_id) references voto_mesarios(id);
  end if;
end $$;

-- ── RLS (isolamento por tenant, mesmo padrão de rls-tenant-isolation.sql) ────
-- A LEITURA do app roda sob o JWT `authenticated` com a claim `tenant_id`
-- (ver lib/supabase/admin.ts). Por isso a política compara com
-- (auth.jwt() ->> 'tenant_id')::uuid — NÃO com a claim 'emp_proprietaria_id'.
-- A escrita das três tabelas vai pelo service role (não estão em TABELAS_TENANT),
-- que ignora RLS. DROP+CREATE torna a correção idempotente ao re-rodar.
alter table voto_mesarios enable row level security;
alter table voto_urnas enable row level security;
alter table voto_urna_terminais enable row level security;

do $$
declare
  t text;
  claim constant text := $q$(auth.jwt() ->> 'tenant_id')::uuid$q$;
begin
  foreach t in array array['voto_mesarios', 'voto_urnas', 'voto_urna_terminais']
  loop
    execute format('drop policy if exists %I on %I', t || '_tenant', t);
    execute format(
      'create policy %I on %I for all using (emp_proprietaria_id = %s) with check (emp_proprietaria_id = %s)',
      t || '_tenant', t, claim, claim
    );
  end loop;
end $$;
