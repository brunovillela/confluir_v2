-- Confluir — Custeio Institucional (2026-08-13)
--
-- Local onde a instituição registra custeios que faz EM FAVOR DE pessoas
-- (não compras, não folha, não reembolso de filiado): diretores em atividade
-- sindical, filiados demitidos políticos e convidados de eventos (filiados ou
-- externos). Substitui dois "penduricalhos" do legado: convidado lançado como
-- fornecedor, e diretor pago como reembolso de filiado.
--
-- Fluxo: cadastra (rascunho) → submete (aguardando_autorizacao) → um autorizador
-- interno autoriza (autorizado) → gera ordens_pagamento em "Em autorização" que
-- passam pela alçada do Financeiro como qualquer despesa. Dois portões em série.
--
-- Cada FINALIDADE é por tenant (extensível: cada sindicato cria as suas) e
-- carrega o CENTRO DE CUSTO padrão; cada custeio herda esse centro e a ordem já
-- nasce classificada.
--
-- Favorecido de gente-sem-conta (diretor/convidado): a ordem ganha campos
-- avulsos (beneficiario_nome_avulso/_doc_avulso) — NÃO vira empresa/fornecedor.
--
-- IMPORTANTE (ordem de execução):
--   1) rodar ESTE script;
--   2) RE-RODAR supabase/rls-emp-todas.sql — as 3 tabelas novas têm
--      emp_proprietaria_id e precisam da política tenant_isolation + grant +
--      trigger set_emp_from_jwt (backstop data-driven, sem deny-all).
-- As colunas de permissão DEVEM existir antes do catálogo entrar em produção —
-- `atualizarAcesso` grava TODAS as chaves no update e quebraria sem elas.

-- 1) Permissões dedicadas da área (ver + editar + autorizar) ------------------
alter table public.permissoes
  add column if not exists custeio_institucional boolean default false;
alter table public.permissoes
  add column if not exists custeio_institucional_edicao boolean default false;
alter table public.permissoes
  add column if not exists custeio_institucional_autorizacao boolean default false;

-- Concede aos administradores já existentes (linhas com usuario_id — hoje o Bruno).
update public.permissoes
  set custeio_institucional = true,
      custeio_institucional_edicao = true,
      custeio_institucional_autorizacao = true
  where usuario_id is not null;

-- 2) Finalidades (por tenant, com centro de custo padrão) --------------------
create table if not exists public.institucional_custeio_finalidades (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa(id),
  nome text not null,
  descricao text,
  -- Sugere o tipo de beneficiário ao criar o custeio (não trava):
  -- 'diretor' | 'filiado' | 'convidado' | 'livre'
  tipo_beneficiario_sugerido text not null default 'livre',
  -- Centro de custo padrão herdado por cada lançamento desta finalidade.
  centro_custo_despesa_id uuid references public.centros_de_custo(id),
  ativa boolean not null default true,
  ordem int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_custeio_finalidades_emp
  on public.institucional_custeio_finalidades (emp_proprietaria_id);

-- 3) Convidados externos (cadastro leve, reutilizável — NUNCA em `empresa`) ---
create table if not exists public.institucional_custeio_convidados (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa(id),
  nome text not null,
  cpf text,
  email text,
  telefone text,
  -- Dados bancários do convidado (para o favorecido avulso da ordem)
  banco text,
  agencia text,
  conta text,
  tipo_conta text,
  pix text,
  tipo_chave_pix text,
  observacoes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_custeio_convidados_emp
  on public.institucional_custeio_convidados (emp_proprietaria_id);

-- 4) Custeios (a concessão) --------------------------------------------------
create table if not exists public.institucional_custeios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa(id),
  codigo text,                         -- CUST-AAAA.MMDD.HHMM.SSNN (fuso de SP)

  finalidade_id uuid references public.institucional_custeio_finalidades(id),

  -- Beneficiário polimórfico: um destes três, conforme tipo_beneficiario.
  tipo_beneficiario text not null,     -- 'diretor' | 'filiado' | 'convidado'
  diretoria_integrante_id uuid references public.diretoria_integrantes(id),
  filiacao_id uuid references public.filiacoes(id),
  convidado_id uuid references public.institucional_custeio_convidados(id),

  -- Snapshot: congela nome/doc/banco na concessão (histórico não muda se a
  -- ficha do diretor ou o cadastro do convidado forem editados depois).
  beneficiario_nome text,
  beneficiario_cpf text,
  banco text,
  agencia text,
  conta text,
  tipo_conta text,
  pix text,
  tipo_chave_pix text,

  descricao text,
  evento text,                         -- opcional (caso convidado)
  centro_custo_despesa_id uuid references public.centros_de_custo(id),

  -- Cadência: pontual (1 ordem) ou recorrente (N ordens no tempo).
  cadencia text not null default 'pontual',      -- 'pontual' | 'recorrente'
  valor_parcela numeric,
  num_parcelas int not null default 1,
  periodicidade text not null default 'unica',   -- 'mensal' | 'anual' | 'unica'
  primeiro_vencimento date,
  forma_pagamento text,

  -- Portão interno de autorização (antes da alçada do Financeiro).
  situacao text not null default 'rascunho',
  -- rascunho | aguardando_autorizacao | autorizado | reprovado | cancelado
  criado_por_id uuid references public.usuarios(id),
  autorizador_id uuid references public.usuarios(id),
  autorizado_em timestamptz,
  motivo_reprovacao text,

  excluido boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_custeios_emp
  on public.institucional_custeios (emp_proprietaria_id);
create index if not exists idx_custeios_situacao
  on public.institucional_custeios (situacao);
create index if not exists idx_custeios_finalidade
  on public.institucional_custeios (finalidade_id);

-- 5) Vínculo do custeio na ordem de pagamento + favorecido avulso ------------
-- Espelha o que contrato_id/processo_compra_id já fizeram em ordens_pagamento.
alter table public.ordens_pagamento
  add column if not exists custeio_id uuid references public.institucional_custeios(id);
alter table public.ordens_pagamento
  add column if not exists beneficiario_nome_avulso text;
alter table public.ordens_pagamento
  add column if not exists beneficiario_doc_avulso text;
create index if not exists idx_ordens_custeio
  on public.ordens_pagamento (custeio_id) where custeio_id is not null;

-- 6) Seed das finalidades iniciais (uma por tenant, idempotente) --------------
-- Centro de custo fica NULO — cada organização vincula o seu na tela de
-- Finalidades. tipo_beneficiario_sugerido pré-seleciona o beneficiário certo.
insert into public.institucional_custeio_finalidades
  (emp_proprietaria_id, nome, tipo_beneficiario_sugerido, ordem)
select t.empresa_id, f.nome, f.tipo, f.ordem
from public.tenants t
cross join (values
  ('Diretor — atividade sindical', 'diretor',   1),
  ('Demitido político',            'filiado',   2),
  ('Convidado de evento',          'convidado', 3)
) as f(nome, tipo, ordem)
where not exists (
  select 1 from public.institucional_custeio_finalidades x
  where x.emp_proprietaria_id = t.empresa_id and x.nome = f.nome
);
