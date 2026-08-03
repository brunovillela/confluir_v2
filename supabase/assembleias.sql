-- ═══════════════════════════════════════════════════════════════════════════
-- Assembleias (Fase 3D) — rodar no SQL Editor do Supabase.
-- Re-rodável: o Bubble segue sincronizando até a virada de chave, então os
-- backfills podem (e devem) ser re-executados na virada.
--
-- Hierarquia: voto_campanha (tema + fontes pagadoras) → voto_rod_assembleias
-- (período; dona das perguntas e dos aptos) → voto_assembleias (online, urna
-- ou reunião de trabalhadores).
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Colunas normalizadas ───────────────────────────────────────────────────

-- Início do período da rodada (no Bubble vivia dentro de periodo_raw).
alter table voto_rod_assembleias
  add column if not exists inicio date;

-- Vínculo assembleia → rodada (no Bubble era a lista assembleias_raw da rodada).
alter table voto_assembleias
  add column if not exists rod_assembleia_id uuid
    references voto_rod_assembleias(id);

-- Vínculo evento da agenda → assembleia: cada assembleia com data vira um
-- evento na agenda (aplicativo = true) para aparecer no portal do associado.
-- on delete cascade: apagar a assembleia remove o evento automaticamente.
alter table agenda
  add column if not exists assembleia_id uuid
    references voto_assembleias(id) on delete cascade;

create index if not exists idx_agenda_assembleia
  on agenda (assembleia_id);

-- ── Junção campanha ↔ fontes pagadoras ─────────────────────────────────────

create table if not exists voto_campanha_fontes (
  id uuid primary key default gen_random_uuid(),
  campanha_id uuid not null references voto_campanha(id) on delete cascade,
  empresa_id uuid not null references empresa(id),
  created_at timestamptz not null default now(),
  unique (campanha_id, empresa_id)
);

alter table voto_campanha_fontes enable row level security;

-- ── Backfill dos vínculos legados (re-rodável) ─────────────────────────────

-- Os campos *_raw são jsonb vindos do Bubble, às vezes com dupla codificação:
-- ora um array de bubble_ids, ora uma STRING contendo o array serializado.
create or replace function voto_raw_array(v jsonb)
returns jsonb
language sql
immutable
as $$
  select case
    when v is null then '[]'::jsonb
    when jsonb_typeof(v) = 'array' then v
    when jsonb_typeof(v) = 'string' and (v #>> '{}') ~ '^\s*\[' then (v #>> '{}')::jsonb
    else '[]'::jsonb
  end
$$;

-- rodada.campanha_id ← voto_campanha.rod_assembleias_raw
update voto_rod_assembleias r
set campanha_id = c.id
from voto_campanha c
cross join lateral jsonb_array_elements_text(
  voto_raw_array(c.rod_assembleias_raw)
) as m(bid)
where r.campanha_id is null
  and r.bubble_id = m.bid;

-- assembleia.rod_assembleia_id ← voto_rod_assembleias.assembleias_raw
update voto_assembleias a
set rod_assembleia_id = r.id
from voto_rod_assembleias r
cross join lateral jsonb_array_elements_text(
  voto_raw_array(r.assembleias_raw)
) as m(bid)
where a.rod_assembleia_id is null
  and a.bubble_id = m.bid;

-- assembleia.rod_assembleia_id (2ª fonte): assembleias_raw veio vazio no
-- legado, mas cada voto online registra assembleia E rodada — deriva-se dali.
update voto_assembleias a
set rod_assembleia_id = v.rod_assembleia_id
from (
  select distinct on (assembleia_id) assembleia_id, rod_assembleia_id
  from voto_online
  where assembleia_id is not null and rod_assembleia_id is not null
) v
where a.rod_assembleia_id is null
  and a.id = v.assembleia_id;

-- pergunta.rod_assembleia_id: o legado não trouxe o vínculo (perguntas_raw
-- veio 'null'), mas cada voto registra pergunta E rodada — deriva-se dali.
update voto_assembleias_perguntas p
set rod_assembleia_id = v.rod_assembleia_id
from (
  select distinct on (pergunta_id) pergunta_id, rod_assembleia_id
  from voto_online
  where pergunta_id is not null and rod_assembleia_id is not null
) v
where p.rod_assembleia_id is null
  and p.id = v.pergunta_id;

-- (hoje sem linhas com pergunta_id — mantido para re-execução na virada)
update voto_assembleias_perguntas p
set rod_assembleia_id = v.rod_assembleia_id::text::uuid
from (
  select distinct on (pergunta_id) pergunta_id, rod_assembleia_id
  from voto_votacao_respostas
  where pergunta_id is not null and rod_assembleia_id is not null
) v
where p.rod_assembleia_id is null
  and p.id::text = v.pergunta_id::text;

-- campanha ↔ fontes ← voto_campanha.empresas_raw (bubble_ids de empresa)
insert into voto_campanha_fontes (campanha_id, empresa_id)
select c.id, e.id
from voto_campanha c
cross join lateral jsonb_array_elements_text(
  voto_raw_array(c.empresas_raw)
) as m(bid)
join empresa e on e.bubble_id = m.bid
on conflict (campanha_id, empresa_id) do nothing;

-- ── Índices ────────────────────────────────────────────────────────────────

create index if not exists idx_voto_rod_campanha
  on voto_rod_assembleias (campanha_id);
create index if not exists idx_voto_assembleias_rodada
  on voto_assembleias (rod_assembleia_id);
create index if not exists idx_voto_perguntas_rodada
  on voto_assembleias_perguntas (rod_assembleia_id, ordem);
create index if not exists idx_voto_opcoes_pergunta
  on voto_opcoes_resposta (pergunta_id);
-- Aptos e trava de voto único são por RODADA (regra confirmada em 2026-07-19).
create index if not exists idx_voto_aptos_rodada_cpf
  on voto_assembleias_aptos (rod_assembleia_id, cpf);
create index if not exists idx_voto_online_rodada_eleitor
  on voto_online (rod_assembleia_id, eleitor_id);
create index if not exists idx_voto_online_pergunta
  on voto_online (pergunta_id, resposta_id);

-- ── Storage ────────────────────────────────────────────────────────────────

-- Bucket privado para editais, atas e cards (acesso só por URL assinada).
insert into storage.buckets (id, name, public)
values ('assembleias', 'assembleias', false)
on conflict (id) do nothing;
