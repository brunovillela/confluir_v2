-- ============================================================================
-- Ofícios  (2026-07-22)
--
-- Documento numerado por ano. Três tipos:
--   • desfiliacao / filiacao — AUTOMÁTICOS: a lista de pessoas é puxada dos
--     vínculos (filiacao_vinculos) da fonte pagadora destinatária.
--   • manual — corpo livre, sem lista (como um e-mail).
--
-- Cabeçalho/rodapé vêm da tenant (empresa) + sede; o signatário é um integrante
-- da diretoria vigente (snapshot de nome/cargo no momento da emissão). O PDF é
-- gerado como view de impressão (o projeto não gera PDF no servidor).
--
-- Numeração: atribuída SÓ na emissão. `unique(emp, ano, numero)` garante que não
-- há repetição; múltiplos rascunhos (numero NULL) coexistem (NULLs são distintos).
--
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.
-- ============================================================================

create table if not exists oficios (
  id uuid primary key default gen_random_uuid(),
  bubble_id text,                       -- dedup na importação do histórico
  tipo text not null default 'manual',  -- desfiliacao | filiacao | manual
  numero integer,                       -- NULL enquanto rascunho
  ano integer,
  data date,                            -- data do documento
  sede_id uuid references empresa_sede (id) on delete set null,
  destinatario_empresa_id uuid references empresa (id) on delete set null,
  destinatario_texto text,              -- escape p/ quem não está no cadastro
  assunto text,
  corpo text,
  saudacao text default 'Prezados,',
  fecho text default 'Cordialmente,',
  assinante_integrante_id uuid references diretoria_integrantes (id) on delete set null,
  assinante_nome text,                  -- snapshot
  assinante_cargo text,                 -- snapshot
  situacao text not null default 'Rascunho',  -- Rascunho | Emitido | Cancelado
  emitido_em timestamptz,
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint oficios_numero_ano_unico unique (emp_proprietaria_id, ano, numero)
);

create index if not exists idx_oficios_ano on oficios (ano);
create index if not exists idx_oficios_situacao on oficios (situacao);
create index if not exists idx_oficios_destinatario on oficios (destinatario_empresa_id);

-- Lista de filiados de um ofício automático. Nome e matrícula ficam em SNAPSHOT:
-- o ofício emitido é documento histórico e não pode mudar se o cadastro mudar.
create table if not exists oficios_filiados (
  id uuid primary key default gen_random_uuid(),
  oficio_id uuid not null references oficios (id) on delete cascade,
  filiacao_id uuid,
  vinculo_id uuid,   -- filiacao_vinculos.id — permite excluir da lista de pendentes
  nome text,
  matricula text,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_oficios_filiados_oficio on oficios_filiados (oficio_id);
create index if not exists idx_oficios_filiados_vinculo on oficios_filiados (vinculo_id);
