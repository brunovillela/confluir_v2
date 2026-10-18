-- Confluir — Filiados: as cinco lacunas de modelo da auditoria Bubble × Supabase
-- (2026-09-08, para a virada do módulo em 14/09)
--
-- A auditoria (scripts/auditar-bubble.mjs) achou cinco coisas que o Bubble
-- guarda e o Confluir não tinha ONDE guardar. Este arquivo cria o lugar; o
-- script scripts/migrar-lacunas-modelo-bubble.mjs traz o conteúdo.
--
--   1. REEMBOLSOS A FILIADOS — 1.848 no Bubble. É o reembolso de R$ 35 por
--      participação (reunião, ato, assembleia), com justificativa, projeto,
--      ordem de pagamento e apontamento no prontuário. As ordens existem aqui
--      (Financeiro); o que se perdia era o elo com o filiado e o porquê.
--   2. CONVÊNIOS — 21 convênios, 6 categorias, 19 unidades de atendimento.
--      `filiacao_convenios` existia vazia e sem tenant; categorias e unidades
--      não tinham tabela.
--   3. DADOS BANCÁRIOS DO FILIADO — 1.111 registros (Pix, agência, conta).
--      `dados_bancarios` só ligava a fornecedor e usuário. É o que paga o
--      reembolso; sem isso cada reembolso pede os dados de novo.
--   4. CONDIÇÃO JUNTO À FONTE — 8.989 preenchidos: "Trabalhador(a) da ativa",
--      "Beneficiário(a) aposentado(a)", "Beneficiário(a) pensionista".
--   5. OFFSHORE — no cadastro (FONTE PG Offshore?, 660) e no vínculo (Lotação
--      offshore?, 2.893). Regime de embarque muda direito e comunicação.
--
-- Idempotente: pode rodar de novo sem efeito. Executar no SQL Editor.

-- ── 1. Reembolsos a filiados ────────────────────────────────────────────────

create table if not exists filiacao_reembolsos (id uuid primary key default gen_random_uuid());
alter table filiacao_reembolsos add column if not exists bubble_id text;
alter table filiacao_reembolsos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_reembolsos add column if not exists filiado_id uuid references filiacoes(id) on delete set null;
alter table filiacao_reembolsos add column if not exists data date;
alter table filiacao_reembolsos add column if not exists justificativa text;
alter table filiacao_reembolsos add column if not exists valor numeric(12,2);
alter table filiacao_reembolsos add column if not exists ordem_pagamento_id uuid references ordens_pagamento(id) on delete set null;
alter table filiacao_reembolsos add column if not exists projeto_id uuid references projeto(id) on delete set null;
alter table filiacao_reembolsos add column if not exists prontuario_id uuid references filiacao_prontuario(id) on delete set null;
-- Quando o reembolso é devolução de contribuição descontada indevidamente.
alter table filiacao_reembolsos add column if not exists pagamento_indevido_id uuid references filiacao_recebe(id) on delete set null;
alter table filiacao_reembolsos add column if not exists criado_por uuid references usuarios(id);
alter table filiacao_reembolsos add column if not exists created_at timestamptz not null default now();
alter table filiacao_reembolsos add column if not exists updated_at timestamptz;

create unique index if not exists ux_filiacao_reembolsos_bubble
  on filiacao_reembolsos (bubble_id);
create index if not exists ix_filiacao_reembolsos_filiado
  on filiacao_reembolsos (emp_proprietaria_id, filiado_id);

-- A regra da entidade: quanto vale cada reembolso e de onde sai o dinheiro.
create table if not exists filiacao_reembolsos_config (id uuid primary key default gen_random_uuid());
alter table filiacao_reembolsos_config add column if not exists bubble_id text;
alter table filiacao_reembolsos_config add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_reembolsos_config add column if not exists valor_reembolso numeric(12,2);
alter table filiacao_reembolsos_config add column if not exists centro_custo_id uuid references centros_de_custo(id) on delete set null;
alter table filiacao_reembolsos_config add column if not exists orcamento_limite boolean not null default false;
alter table filiacao_reembolsos_config add column if not exists orcamento_mensal numeric(12,2);
alter table filiacao_reembolsos_config add column if not exists atualizada_por uuid references usuarios(id);
alter table filiacao_reembolsos_config add column if not exists created_at timestamptz not null default now();
alter table filiacao_reembolsos_config add column if not exists updated_at timestamptz;

create unique index if not exists ux_filiacao_reembolsos_config
  on filiacao_reembolsos_config (emp_proprietaria_id);

-- ── 2. Convênios: categorias, convênios e unidades ──────────────────────────

create table if not exists filiacao_convenios_categorias (id uuid primary key default gen_random_uuid());
alter table filiacao_convenios_categorias add column if not exists bubble_id text;
alter table filiacao_convenios_categorias add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_convenios_categorias add column if not exists categoria text;
alter table filiacao_convenios_categorias add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_filiacao_convenios_categorias_bubble
  on filiacao_convenios_categorias (bubble_id);

-- A tabela de convênios veio da migração sem tenant e sem chaves; ganha os dois.
create table if not exists filiacao_convenios (id uuid primary key default gen_random_uuid());
alter table filiacao_convenios add column if not exists bubble_id text;
alter table filiacao_convenios add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_convenios add column if not exists categoria_id uuid;
alter table filiacao_convenios add column if not exists conveniador_id uuid;
alter table filiacao_convenios add column if not exists sindicato_id uuid;
alter table filiacao_convenios add column if not exists ativo boolean not null default true;
alter table filiacao_convenios add column if not exists data_termino date;
alter table filiacao_convenios add column if not exists info_sumarias text;
alter table filiacao_convenios add column if not exists info_vantagens text;
alter table filiacao_convenios add column if not exists arquivo_convenio text;
alter table filiacao_convenios add column if not exists foto_principal text;
alter table filiacao_convenios add column if not exists fotos_divulgacao text[];
alter table filiacao_convenios add column if not exists created_at timestamptz not null default now();
alter table filiacao_convenios add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_filiacao_convenios_categoria') then
    alter table filiacao_convenios add constraint fk_filiacao_convenios_categoria
      foreign key (categoria_id) references filiacao_convenios_categorias(id) on delete set null not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_filiacao_convenios_conveniador') then
    alter table filiacao_convenios add constraint fk_filiacao_convenios_conveniador
      foreign key (conveniador_id) references empresa(id) on delete set null not valid;
  end if;
end $$;

create unique index if not exists ux_filiacao_convenios_bubble
  on filiacao_convenios (bubble_id);

-- Onde o filiado é atendido. Telefones e e-mails ficam como listas no próprio
-- registro: são contatos de um balcão, não de uma pessoa — não há por que
-- espalhá-los pelas tabelas de contato de pessoa.
create table if not exists filiacao_convenios_unidades (id uuid primary key default gen_random_uuid());
alter table filiacao_convenios_unidades add column if not exists bubble_id text;
alter table filiacao_convenios_unidades add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_convenios_unidades add column if not exists convenio_id uuid references filiacao_convenios(id) on delete cascade;
alter table filiacao_convenios_unidades add column if not exists nome text;
alter table filiacao_convenios_unidades add column if not exists site text;
alter table filiacao_convenios_unidades add column if not exists atendimento_online boolean not null default false;
alter table filiacao_convenios_unidades add column if not exists atendimento_presencial boolean not null default false;
alter table filiacao_convenios_unidades add column if not exists endereco_id uuid references enderecos(id) on delete set null;
alter table filiacao_convenios_unidades add column if not exists telefones text[];
alter table filiacao_convenios_unidades add column if not exists emails text[];
alter table filiacao_convenios_unidades add column if not exists fotos text[];
alter table filiacao_convenios_unidades add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_filiacao_convenios_unidades_bubble
  on filiacao_convenios_unidades (bubble_id);
create index if not exists ix_filiacao_convenios_unidades_convenio
  on filiacao_convenios_unidades (convenio_id);

-- ── 3. Dados bancários do filiado ───────────────────────────────────────────
-- A tabela é a mesma dos fornecedores e usuários; ganha o dono que faltava e
-- os campos de Pix que o Bubble guardava e aqui não cabiam.

alter table dados_bancarios add column if not exists filiado_id uuid references filiacoes(id) on delete cascade;
alter table dados_bancarios add column if not exists banco_codigo text;
alter table dados_bancarios add column if not exists pix_tipo text;
alter table dados_bancarios add column if not exists pix_beneficiario text;
alter table dados_bancarios add column if not exists prefere_pix boolean not null default false;
alter table dados_bancarios add column if not exists favorito boolean not null default false;
alter table dados_bancarios add column if not exists tipo_dados text;

-- O script grava por upsert em bubble_id; a tabela migrada não tinha o índice.
create unique index if not exists ux_dados_bancarios_bubble on dados_bancarios (bubble_id);
create unique index if not exists ux_enderecos_bubble on enderecos (bubble_id);

create index if not exists ix_dados_bancarios_filiado
  on dados_bancarios (filiado_id) where filiado_id is not null;

-- ── 4. Condição junto à fonte pagadora ──────────────────────────────────────
-- Texto livre com os três valores que o Bubble usa; não é enum porque outra
-- entidade pode ter outros.

alter table filiacoes add column if not exists condicao_na_fonte text;
comment on column filiacoes.condicao_na_fonte is
  'Situação da pessoa junto à fonte pagadora: Trabalhador(a) da ativa, Beneficiário(a) aposentado(a), Beneficiário(a) pensionista.';

-- ── 5. Offshore ─────────────────────────────────────────────────────────────
-- Nulo = não informado; não se assume terra por omissão.

alter table filiacoes add column if not exists fonte_pg_offshore boolean;
alter table filiacao_vinculos add column if not exists lotacao_offshore boolean;

-- ── RLS e trigger de tenant nas tabelas novas ───────────────────────────────
-- Mesmo padrão de supabase/rls-tenant-isolation.sql. Registrar também em
-- src/lib/supabase/tabelas-tenant.ts.

do $$
declare t text;
begin
  foreach t in array array[
    'filiacao_reembolsos',
    'filiacao_reembolsos_config',
    'filiacao_convenios',
    'filiacao_convenios_categorias',
    'filiacao_convenios_unidades'
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
