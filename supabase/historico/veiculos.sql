-- ═══════════════════════════════════════════════════════════════════════════
-- VEÍCULOS — frota, condutores, agendamentos, abastecimentos, infrações e
-- contratos de aluguel (rodar no SQL Editor do Supabase)
--
-- Modelo (espelha o Bubble; decisões confirmadas com o Bruno em 2026-07-19):
-- • `veiculos` é a frota (170 migrados; só 9 ativos — 153 são alugados).
-- • `veiculos_agendamentos` é a SOLICITAÇÃO de veículo (só condutor
--   autorizado com CNH válida solicita); `veiculos_disponibilidade` é a
--   MOVIMENTAÇÃO real (retirada/devolução com hodômetro e sede).
-- • Abastecimentos novos exigem veículo + hodômetro (o legado veio sem
--   vínculo com veículo — só condutor — e fica FORA dos indicadores de
--   consumo); entrada principal é importação de fatura/planilha em lote.
-- • Infrações: notificação → justificativa (sindical ou não) → avaliação →
--   ordem de pagamento (tipo legado 'Multa de trânsito'). Não sindical gera
--   cobrança ao infrator (funcionário → contracheque; diretor → desconto em
--   diárias, fluxo ainda a criar) com baixa no Financeiro e histórico
--   imutável para a auditoria do Conselho Fiscal.
-- • Contratos de aluguel ganham vínculo veículo↔contrato (não existia no
--   Bubble) e ordens novas nascem 'Em autorização' com o tipo legado
--   'Locação de veículos - Mensalidade'.
--
-- O Bubble segue em produção até a virada — tratar legado como leitura.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Condutores (cadastro de CNH por usuário) ───────────────────────────────

create table if not exists veiculos_condutores (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references empresa(id),
  usuario_id uuid not null references usuarios(id) unique,
  cnh_numero text,
  cnh_categoria text,
  cnh_validade date,
  -- Caminho no bucket 'veiculos' (PDF/imagem da CNH).
  cnh_arquivo_url text,
  autorizado boolean not null default false,
  autorizado_por_id uuid references usuarios(id),
  autorizado_em timestamptz,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Backfill: quem tinha a flag legada `usuarios.cnh_autorizado` vira condutor
-- autorizado (sem os dados da CNH — completar no cadastro novo). Idempotente.
insert into veiculos_condutores (usuario_id, autorizado, emp_proprietaria_id)
select u.id, true, u.emp_proprietaria_id
from usuarios u
where u.cnh_autorizado = true
on conflict (usuario_id) do nothing;

-- ── Frota ──────────────────────────────────────────────────────────────────

alter table veiculos
  -- Vínculo veículo → contrato de aluguel vigente (não existia no Bubble).
  add column if not exists contrato_aluguel_id uuid references veiculo_contratos_aluguel(id);

create index if not exists idx_veiculos_contrato
  on veiculos (contrato_aluguel_id);

-- ── Agendamentos (solicitações) ────────────────────────────────────────────

alter table veiculos_agendamentos
  -- solicitada | atendida | retirada | concluida | negada | cancelada | expirada
  add column if not exists situacao text,
  add column if not exists atendido_por_id uuid references usuarios(id),
  add column if not exists atendido_em timestamptz,
  add column if not exists negado_motivo text;

-- Backfill (decisão 2026-07-19): atendidos viram histórico 'concluida';
-- não atendidos são antigos e viram 'expirada' — NÃO entram na fila do
-- gestor. Idempotente (situacao is null).
update veiculos_agendamentos
set situacao = case when atendido = true then 'concluida' else 'expirada' end
where situacao is null;

create index if not exists idx_veiculos_agendamentos_situacao
  on veiculos_agendamentos (situacao, data_retirada);
create index if not exists idx_veiculos_agendamentos_condutor
  on veiculos_agendamentos (condutor_id, created_at desc);

-- ── Movimentações (retirada/devolução) ─────────────────────────────────────

alter table veiculos_disponibilidade
  -- Solicitação que originou a movimentação (fluxo novo; legado fica nulo).
  add column if not exists agendamento_id uuid references veiculos_agendamentos(id),
  add column if not exists registrado_por_id uuid references usuarios(id);

create index if not exists idx_veiculos_disponibilidade_veiculo
  on veiculos_disponibilidade (veiculo_id, created_at desc);
create index if not exists idx_veiculos_disponibilidade_condutor
  on veiculos_disponibilidade (condutor_id, created_at desc);
-- Movimentações em aberto (veículo na rua): sem data de devolução.
create index if not exists idx_veiculos_disponibilidade_abertas
  on veiculos_disponibilidade (veiculo_id)
  where data_devolucao is null;

-- ── Abastecimentos ─────────────────────────────────────────────────────────

-- Lotes de importação de fatura/planilha (caminho principal de entrada).
create table if not exists veiculos_abastecimentos_lotes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references empresa(id),
  arquivo_nome text,
  importado_por_id uuid references usuarios(id),
  qtd_linhas integer not null default 0,
  observacao text,
  created_at timestamptz not null default now()
);

alter table veiculos_abastecimentos
  -- O legado veio SEM veículo (só condutor) — lançamentos novos exigem
  -- veículo + hodômetro no aplicativo; aqui fica nullable por causa dele.
  add column if not exists veiculo_id uuid references veiculos(id),
  add column if not exists hodometro numeric,
  add column if not exists lote_id uuid references veiculos_abastecimentos_lotes(id);

create index if not exists idx_veiculos_abastecimentos_veiculo
  on veiculos_abastecimentos (veiculo_id, data_hora_abastecimento desc);
create index if not exists idx_veiculos_abastecimentos_data
  on veiculos_abastecimentos (data_hora_abastecimento desc);
create index if not exists idx_veiculos_abastecimentos_lote
  on veiculos_abastecimentos (lote_id);

-- ── Infrações ──────────────────────────────────────────────────────────────

alter table veiculos_infracoes
  -- FK real para a ordem de pagamento da multa (o legado guarda o bubble_id
  -- da ordem no campo texto `ordem_pagamento` — backfill abaixo).
  add column if not exists ordem_pagamento_id uuid references ordens_pagamento(id),
  -- Cobrança ao infrator quando a justificativa NÃO é sindical:
  -- contracheque (funcionário) | diaria (diretor — desconto ainda a criar).
  add column if not exists cobranca_forma text,
  -- pendente | baixada | isenta (sindical). Null = legado sem gestão.
  add column if not exists cobranca_situacao text,
  add column if not exists cobranca_valor numeric,
  add column if not exists baixa_usuario_id uuid references usuarios(id),
  add column if not exists baixa_em timestamptz,
  add column if not exists baixa_observacao text,
  -- Caminho no bucket 'veiculos' (comprovante da baixa).
  add column if not exists baixa_comprovante_url text;

-- Backfill do vínculo infração → ordem pelo bubble_id (idempotente).
update veiculos_infracoes i
set ordem_pagamento_id = o.id
from ordens_pagamento o
where i.ordem_pagamento_id is null
  and i.ordem_pagamento is not null
  and o.bubble_id = i.ordem_pagamento;

-- Backfill da cobrança: reembolso legado concluído vira 'baixada' (a data do
-- reembolso vale como baixa); justificativa sindical vira 'isenta'. O resto
-- fica null — infrações legadas sem gestão de cobrança. Idempotente.
update veiculos_infracoes
set cobranca_situacao = 'baixada',
    baixa_em = reembolso_quando::timestamptz
where cobranca_situacao is null and reembolso = true;

update veiculos_infracoes
set cobranca_situacao = 'isenta'
where cobranca_situacao is null and justificativa_sindical = true;

create index if not exists idx_veiculos_infracoes_veiculo
  on veiculos_infracoes (veiculo_id, infracao_data desc);
create index if not exists idx_veiculos_infracoes_cobranca
  on veiculos_infracoes (cobranca_situacao);

-- Histórico imutável da infração (auditoria do Conselho Fiscal): cada evento
-- do fluxo — notificação, justificativa, avaliação, ordem, cobrança, baixa —
-- gera uma linha; o aplicativo só INSERE (nunca altera ou apaga).
create table if not exists veiculos_infracoes_historico (
  id uuid primary key default gen_random_uuid(),
  infracao_id uuid not null references veiculos_infracoes(id),
  usuario_id uuid references usuarios(id),
  evento text not null,
  detalhe text,
  created_at timestamptz not null default now()
);

create index if not exists idx_veiculos_infracoes_historico
  on veiculos_infracoes_historico (infracao_id, created_at);

-- ── Contratos de aluguel ───────────────────────────────────────────────────

alter table veiculo_contratos_aluguel
  add column if not exists valor_mensal numeric,
  add column if not exists finalidade text;

-- Ordens de aluguel ligadas ao contrato por FK (o legado guarda um array de
-- bubble_ids em `ordens_pagto` — backfill abaixo).
alter table ordens_pagamento
  add column if not exists contrato_aluguel_id uuid references veiculo_contratos_aluguel(id);

-- Backfill ordem → contrato: `ordens_pagto` é JSONB com os bubble_ids das
-- ordens — na migração pode ter vindo como STRING jsonb contendo o array
-- serializado (mesmo padrão de compras.sql). Idempotente; re-rodar na virada.
update ordens_pagamento o
set contrato_aluguel_id = m.contrato_id
from (
  select c.id as contrato_id, e.bubble_id
  from veiculo_contratos_aluguel c
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(c.ordens_pagto) = 'array' then c.ordens_pagto
      when jsonb_typeof(c.ordens_pagto) = 'string'
           and (c.ordens_pagto #>> '{}') like '[%'
        then (c.ordens_pagto #>> '{}')::jsonb
      else '[]'::jsonb
    end
  ) as e(bubble_id)
) m
where o.contrato_aluguel_id is null
  and o.bubble_id = m.bubble_id;

create index if not exists idx_ordens_contrato_aluguel
  on ordens_pagamento (contrato_aluguel_id);

-- ── Storage ────────────────────────────────────────────────────────────────

-- Bucket privado para CNHs, comprovantes de baixa e anexos de infração
-- (acesso só por URL assinada gerada no servidor).
insert into storage.buckets (id, name, public)
values ('veiculos', 'veiculos', false)
on conflict (id) do nothing;

-- ── RLS ────────────────────────────────────────────────────────────────────

-- Padrão do projeto: RLS deny-all — dados só via service role no servidor.
alter table veiculos enable row level security;
alter table veiculos_condutores enable row level security;
alter table veiculos_agendamentos enable row level security;
alter table veiculos_disponibilidade enable row level security;
alter table veiculos_abastecimentos enable row level security;
alter table veiculos_abastecimentos_lotes enable row level security;
alter table veiculos_infracoes enable row level security;
alter table veiculos_infracoes_historico enable row level security;
alter table veiculo_contratos_aluguel enable row level security;
