-- Confluir — Representação Sindical › Negociações sindicais (2026-09-29)
--
-- Fase 3 do comparador de acordos. Uma negociação acompanha a renovação de um
-- ACT/CCT com uma ou mais empresas: data-base, acordo vigente, pauta de
-- reivindicações, propostas por rodada, acordo final e a linha do tempo.
--
-- • Permissão própria `negociacoes` (sigilosa): pauta e propostas NÃO aparecem
--   em Acordos coletivos para quem só tem `acordos_coletivos`.
-- • Os documentos da negociação (pauta, propostas, contrapropostas, minuta
--   final) são linhas de acordo_coletivo com negociacao_id preenchido — assim
--   reaproveitam o envio do PDF, a extração das cláusulas e o comparador.
--   Ao concluir, o documento final perde o negociacao_id, vira 'vigente' e o
--   acordo anterior vira 'arquivado'.
-- • A negociação pode apontar para a campanha de Votações que delibera as
--   propostas; as rodadas dela entram na linha do tempo.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

alter table permissoes add column if not exists negociacoes boolean;

-- ── Negociação ──────────────────────────────────────────────────────────────
create table if not exists negociacoes (id uuid primary key default gen_random_uuid());
alter table negociacoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table negociacoes add column if not exists titulo text;
alter table negociacoes add column if not exists tipo text not null default 'act';          -- act | cct
alter table negociacoes add column if not exists data_base text;                            -- "Setembro"
alter table negociacoes add column if not exists situacao text not null default 'preparacao';
  -- preparacao | em_curso | concluida | encerrada
alter table negociacoes add column if not exists acordo_vigente_id uuid references acordo_coletivo(id) on delete set null;
alter table negociacoes add column if not exists acordo_final_id uuid references acordo_coletivo(id) on delete set null;
alter table negociacoes add column if not exists campanha_id uuid references voto_campanha(id) on delete set null;
alter table negociacoes add column if not exists inicio date;
alter table negociacoes add column if not exists conclusao date;
alter table negociacoes add column if not exists observacoes text;
alter table negociacoes add column if not exists criado_por_id uuid references usuarios(id);
alter table negociacoes add column if not exists created_at timestamptz not null default now();
alter table negociacoes add column if not exists updated_at timestamptz not null default now();
create index if not exists idx_negociacoes_emp on negociacoes (emp_proprietaria_id, created_at desc);

-- Empresas (empregadores/fontes pagadoras) do outro lado da mesa.
create table if not exists negociacao_empresas (id uuid primary key default gen_random_uuid());
alter table negociacao_empresas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table negociacao_empresas add column if not exists negociacao_id uuid references negociacoes(id) on delete cascade;
alter table negociacao_empresas add column if not exists empresa_id uuid references empresa(id);
create unique index if not exists uq_negociacao_empresas on negociacao_empresas (negociacao_id, empresa_id);

-- Linha do tempo: o que não é documento nem rodada de votação.
create table if not exists negociacao_eventos (id uuid primary key default gen_random_uuid());
alter table negociacao_eventos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table negociacao_eventos add column if not exists negociacao_id uuid references negociacoes(id) on delete cascade;
alter table negociacao_eventos add column if not exists data date not null default current_date;
alter table negociacao_eventos add column if not exists tipo text not null default 'reuniao';
  -- reuniao | mediacao | mobilizacao | comunicado | outro
alter table negociacao_eventos add column if not exists titulo text;
alter table negociacao_eventos add column if not exists descricao text;
alter table negociacao_eventos add column if not exists criado_por_id uuid references usuarios(id);
alter table negociacao_eventos add column if not exists created_at timestamptz not null default now();
create index if not exists idx_negociacao_eventos on negociacao_eventos (negociacao_id, data);

-- ── Documentos da negociação = acordos com negociacao_id ────────────────────
alter table acordo_coletivo add column if not exists negociacao_id uuid references negociacoes(id) on delete cascade;
alter table acordo_coletivo add column if not exists papel_negociacao text;
  -- pauta | proposta | contraproposta | final
alter table acordo_coletivo add column if not exists rodada_negociacao integer;
alter table acordo_coletivo add column if not exists data_documento date;
create index if not exists idx_acordo_negociacao on acordo_coletivo (negociacao_id);

comment on column acordo_coletivo.negociacao_id is
  'Documento sigiloso de uma negociação (pauta/proposta). Some de Acordos coletivos; ao concluir, o final perde o vínculo e vira vigente.';

-- ── RLS ─────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['negociacoes', 'negociacao_empresas', 'negociacao_eventos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I for all to authenticated
      using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
      with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)$p$, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on %I', t);
    execute format('create trigger set_emp_from_jwt before insert on %I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;
