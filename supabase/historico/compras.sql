-- ═══════════════════════════════════════════════════════════════════════════
-- COMPRAS — processos de aquisição (rodar no SQL Editor do Supabase)
--
-- Modelo (espelha o Bubble, confirmado com o Bruno em 2026-07-18):
-- `compras_solicitacoes` É o processo de aquisição — um registro por
-- processo, nas duas modalidades:
--   • Aquisição direta: o departamento compra e registra tudo de uma vez
--     (fornecedor, valor, nota fiscal); nasce "comprado".
--   • Via Compras: o departamento SOLICITA; o setor de compras cota com
--     fornecedores (`compras_propostas`), escolhe 1+ propostas e efetiva.
-- Cada proposta ESCOLHIDA vira um desdobramento de fornecimento/pagamento
-- (`compras_fornecimentos`, tabela nova): compra → ordem de pagamento
-- (tipo 'Compras', situação 'Em autorização' — aprovada por alçada na área
-- de avaliações) → recebimento.
--
-- Migração Bubble veio "oca": nas 6.500 solicitações só sobreviveram codigo,
-- projeto (~50%), flags (comprado/recebido/em_cotacao), compra_valor,
-- recebimento_data e cotacao_propostas_raw (array de bubble_ids). O vínculo
-- proposta→processo e ordem→processo é refeito aqui por backfill.
-- O Bubble segue em produção até a virada — tratar legado como leitura.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Solicitações (processos) ───────────────────────────────────────────────

alter table compras_solicitacoes
  -- true = aquisição direta; false = via setor de compras; null = legado.
  add column if not exists aquisicao_direta boolean;

-- ── Propostas ──────────────────────────────────────────────────────────────

alter table compras_propostas
  add column if not exists escolhida boolean not null default false,
  add column if not exists escolhida_em timestamptz,
  add column if not exists escolhida_por_id uuid references usuarios(id);

-- Backfill do vínculo proposta → processo: `cotacao_propostas_raw` é JSONB
-- com os bubble_ids das propostas — na migração veio como STRING jsonb
-- contendo o array serializado (ex.: "[\"169...\"]"), com "null" para vazio;
-- o CASE também cobre um eventual array jsonb de verdade. Expande os arrays
-- e junta por bubble_id (bem mais rápido que comparar tudo contra tudo).
-- Validado em 2026-07-18: 100% de match nos processos antigos; os RECENTES
-- referenciam propostas que a sincronização ainda não trouxe — este UPDATE é
-- idempotente (processo_compra_id is null): RE-RODAR na virada de chave.
update compras_propostas p
set processo_compra_id = m.processo_id
from (
  select s.id as processo_id, e.bubble_id
  from compras_solicitacoes s
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(s.cotacao_propostas_raw) = 'array'
        then s.cotacao_propostas_raw
      when jsonb_typeof(s.cotacao_propostas_raw) = 'string'
           and (s.cotacao_propostas_raw #>> '{}') like '[%'
        then (s.cotacao_propostas_raw #>> '{}')::jsonb
      else '[]'::jsonb
    end
  ) as e(bubble_id)
) m
where p.processo_compra_id is null
  and p.bubble_id = m.bubble_id;

create index if not exists idx_compras_propostas_processo
  on compras_propostas (processo_compra_id);

-- ── Ordens de pagamento ligadas ao processo ────────────────────────────────

-- Cada ordem tem codigo PRÓPRIO (conferido no banco em 2026-07-18); o vínculo
-- ordem→processo do Bubble (pagamento_ordens_raw) veio nulo na migração, então
-- as 789 ordens legadas de compras ficam sem processo até uma re-migração na
-- virada de chave. Ordens novas nascem com processo_compra_id preenchido.
alter table ordens_pagamento
  add column if not exists processo_compra_id uuid references compras_solicitacoes(id);

create index if not exists idx_ordens_processo_compra
  on ordens_pagamento (processo_compra_id);
create index if not exists idx_ordens_tipo_situacao
  on ordens_pagamento (tipo, situacao);

-- ── Fornecimentos (desdobramentos por fornecedor) ──────────────────────────

create table if not exists compras_fornecimentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references empresa(id),
  processo_id uuid not null references compras_solicitacoes(id),
  -- Proposta escolhida que originou o desdobramento (null = aquisição direta).
  proposta_id uuid references compras_propostas(id),
  fornecedor_id uuid not null references empresa(id),
  valor numeric not null check (valor >= 0),
  forma_pagamento text,
  previsao_entrega date,
  comprador_id uuid references usuarios(id),
  data_compra date,
  -- Caminho no bucket 'compras' (nota fiscal / comprovante da compra).
  nota_fiscal_url text,
  ordem_pagamento_id uuid references ordens_pagamento(id),
  recebido boolean not null default false,
  recebimento_data date,
  recebimento_recebido_por_id uuid references usuarios(id),
  -- Fornecimento conferido e considerado adequado à solicitação?
  recebimento_de_acordo boolean,
  recebimento_observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compras_fornecimentos_processo
  on compras_fornecimentos (processo_id);
-- Área de recebimentos: o que ainda tem para chegar.
create index if not exists idx_compras_fornecimentos_pendentes
  on compras_fornecimentos (recebido, previsao_entrega);

-- ── Índices de listagem ────────────────────────────────────────────────────

create index if not exists idx_compras_solicitacoes_codigo
  on compras_solicitacoes (codigo desc);
create index if not exists idx_compras_solicitacoes_criacao
  on compras_solicitacoes (created_at desc);

-- ── Storage ────────────────────────────────────────────────────────────────

-- Bucket privado para notas fiscais e PDFs de proposta (acesso só por URL
-- assinada gerada no servidor).
insert into storage.buckets (id, name, public)
values ('compras', 'compras', false)
on conflict (id) do nothing;

-- ── RLS ────────────────────────────────────────────────────────────────────

-- Padrão do projeto: RLS deny-all — dados só via service role no servidor.
alter table compras_solicitacoes enable row level security;
alter table compras_propostas enable row level security;
alter table compras_fornecimentos enable row level security;
