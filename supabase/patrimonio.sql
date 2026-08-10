-- ═══════════════════════════════════════════════════════════════════════════
-- PATRIMÔNIO — itens, recintos, notas fiscais, cautelas e responsáveis
-- (a partir do export do Bubble `confluir00.bubble` — rodar no SQL Editor).
--
-- RECONCILIAÇÃO COM O BANCO REAL (introspecção via PostgREST 2026-08-10):
-- A migração do Bubble JÁ criou 2 das 5 tabelas, VAZIAS, com estes nomes:
--   • patrimonio_recinto  (id, bubble_id, nome_recinto, codigo, descricao_fisica,
--                          sede public.sedes_enum, emp_proprietaria_id, created_at)
--   • patrimonio_nota_fiscal (id, bubble_id, entrada, numero_nota, arquivo_nota,
--                          data_emissao, fornecedor_id, created_at)
-- As outras 3 NÃO existem e são criadas aqui:
--   • patrimonio_item                → "Patrimônio - Item"
--   • patrimonio_item_responsavel    → "Item - Responsável" (CAUTELA)
--   • patrimonio_recinto_responsavel → "Recinto - Responsável"
--
-- Por isso este script NÃO recria as 2 existentes (só garante índices nas
-- colunas REAIS) e segue a nomenclatura delas nas novas: `created_at` só
-- (sem updated_at), `bubble_id text`, `emp_proprietaria_id → empresa(id)`.
--
-- Mapeamentos (padrão do projeto, ver veiculos.sql / compras.sql):
-- • "EMP PROPRIETARIA" → emp_proprietaria_id → empresa(id) (RLS do tenant).
-- • "FORNECEDOR" → empresa(id) (fornecedores são `empresa`).
-- • "SEDE" (Recinto) → já veio como enum public.sedes_enum (mantido).
-- • "User"/"FUNCIONÁRIO"/"RESPONSÁVEL" → usuarios(id).
-- • Listas do Bubble (Recinto.ITENS, NF.ITENS, RESPONSÁVEIS ...) = relações
--   reversas — FK no lado "muitos", sem tabela de junção.
--
-- O Bubble segue em produção até a virada — tratar legado como leitura.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Recinto (JÁ EXISTE — só índices) ───────────────────────────────────────
create index if not exists idx_patrimonio_recinto_sede
  on patrimonio_recinto (sede);

-- ── Nota fiscal (JÁ EXISTE) ────────────────────────────────────────────────
-- A migração criou esta tabela SEM emp_proprietaria_id (ao contrário de
-- patrimonio_recinto), então ficou fora da isolação de tenant. Adiciona a
-- coluna para entrar no fluxo uniforme (rls-emp-todas.sql cuida da policy).
alter table patrimonio_nota_fiscal
  add column if not exists emp_proprietaria_id uuid references empresa(id);

create index if not exists idx_patrimonio_nf_fornecedor
  on patrimonio_nota_fiscal (fornecedor_id);

-- ── Item (NOVA: o bem patrimonial) ─────────────────────────────────────────

create table if not exists patrimonio_item (
  id uuid primary key default gen_random_uuid(),
  bubble_id text unique,
  emp_proprietaria_id uuid references empresa(id),
  nome text,                          -- "Nome"
  descricao text,                     -- "Descrição"
  numero_patrimonio text,             -- "Número de patrimônio"
  numero_patrimonio_antigo text,      -- "Número de patrimônio antigo"
  numero_unico text,                  -- "Número único"
  ativo boolean not null default true,-- "Ativo?"
  recinto_id uuid references patrimonio_recinto(id),                 -- "RECINTO"
  nota_fiscal_entrada_id uuid references patrimonio_nota_fiscal(id), -- "NOTA FISCAL ENTRADA"
  nota_fiscal_saida_id uuid references patrimonio_nota_fiscal(id),   -- "NOTA FISCAL SAÍDA"
  -- "RESPONSÁVEL CAUTELA": detentor atual (denormalizado do Bubble;
  -- derivável de patrimonio_item_responsavel em aberto — mantido por fidelidade).
  responsavel_cautela_id uuid references usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_patrimonio_item_recinto
  on patrimonio_item (recinto_id);
create index if not exists idx_patrimonio_item_nf_entrada
  on patrimonio_item (nota_fiscal_entrada_id);
create index if not exists idx_patrimonio_item_nf_saida
  on patrimonio_item (nota_fiscal_saida_id);
create index if not exists idx_patrimonio_item_numero
  on patrimonio_item (numero_patrimonio);
create index if not exists idx_patrimonio_item_ativo
  on patrimonio_item (ativo);

-- ── Cautela: Item - Responsável (NOVA: histórico de guarda temporária) ─────

create table if not exists patrimonio_item_responsavel (
  id uuid primary key default gen_random_uuid(),
  bubble_id text unique,
  emp_proprietaria_id uuid references empresa(id),
  item_id uuid not null references patrimonio_item(id),  -- "ITEM"
  responsavel_id uuid references usuarios(id),            -- "RESPONSÁVEL"
  inicio date,                                            -- "Início"
  termino date,                                           -- "Término"
  arquivo_cautela text,          -- "Arquivo da Cautela" (bucket 'patrimonio')
  created_at timestamptz not null default now()
);

create index if not exists idx_patrimonio_item_resp_item
  on patrimonio_item_responsavel (item_id, inicio desc);
create index if not exists idx_patrimonio_item_resp_responsavel
  on patrimonio_item_responsavel (responsavel_id);
-- Cautelas em aberto (item na mão de alguém): sem término.
create index if not exists idx_patrimonio_item_resp_abertas
  on patrimonio_item_responsavel (item_id)
  where termino is null;

-- ── Recinto - Responsável (NOVA: histórico de responsáveis por recinto) ────

create table if not exists patrimonio_recinto_responsavel (
  id uuid primary key default gen_random_uuid(),
  bubble_id text unique,
  emp_proprietaria_id uuid references empresa(id),
  recinto_id uuid not null references patrimonio_recinto(id),  -- "RECINTO"
  funcionario_id uuid references usuarios(id),                 -- "FUNCIONÁRIO"
  inicio date,                                                 -- "Início"
  termino date,                                                -- "Término"
  atual boolean not null default false,                        -- "Atual"
  created_at timestamptz not null default now()
);

create index if not exists idx_patrimonio_recinto_resp_recinto
  on patrimonio_recinto_responsavel (recinto_id, inicio desc);
create index if not exists idx_patrimonio_recinto_resp_funcionario
  on patrimonio_recinto_responsavel (funcionario_id);
create index if not exists idx_patrimonio_recinto_resp_atual
  on patrimonio_recinto_responsavel (recinto_id)
  where atual = true;

-- ── Storage ────────────────────────────────────────────────────────────────

-- Bucket privado para arquivos de nota fiscal e de cautela
-- (acesso só por URL assinada gerada no servidor).
insert into storage.buckets (id, name, public)
values ('patrimonio', 'patrimonio', false)
on conflict (id) do nothing;

-- ── RLS ────────────────────────────────────────────────────────────────────
--
-- NÃO ligar deny-all aqui. As 3 tabelas novas têm emp_proprietaria_id; basta
-- RE-RODAR supabase/rls-emp-todas.sql (idempotente e auto-cura): ele liga a RLS
-- e cria a policy `tenant_isolation` + grants + trigger set_emp_from_jwt em toda
-- tabela do schema public com essa coluna. (patrimonio_recinto e
-- patrimonio_nota_fiscal já entraram nas 109 originais.)
--
-- Depois, registrar as 3 novas em src/lib/supabase/tabelas-tenant.ts para o
-- Proxy de escrita rotear pelo JWT do tenant.
