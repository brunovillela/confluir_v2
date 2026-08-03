-- ============================================================================
-- Cadastro da organização (tenant) e da diretoria  (2026-07-22)
--
-- Pré-requisitos dos Ofícios:
--   • Cabeçalho/rodapé do ofício vêm da tenant (`empresa` c763…) + sedes.
--     As sedes não tinham telefone → coluna nova. Endereços já existiam
--     (vinham nulos e são preenchidos pelo cadastro).
--   • O signatário do ofício é um integrante da diretoria vigente. NÃO havia
--     tabela de integrantes — criada aqui. `diretoria_mandatos` já existe.
--
-- O logo da tenant vai para o bucket PÚBLICO `organizacao` (logo não é
-- sigiloso; URL pública facilita o PDF); o caminho fica em `empresa.logomarca`.
--
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- 1) Telefones da sede (rodapé do ofício) -----------------------------------
alter table empresa_sede
  add column if not exists telefones text;

comment on column empresa_sede.telefones is
  'Telefones de contato da sede, texto livre (ex.: "(22) 2765-9550 / (22) 99742-3547"). Usado no rodapé dos ofícios.';

-- 2) Integrantes da diretoria (não existia) ---------------------------------
create table if not exists diretoria_integrantes (
  id uuid primary key default gen_random_uuid(),
  mandato_id uuid not null references diretoria_mandatos (id) on delete cascade,
  -- Vínculo opcional com a conta do usuário; hoje quase ninguém está integrado
  -- ao painel, então o integrante é identificado por nome + cargo.
  usuario_id uuid references usuarios (id) on delete set null,
  nome text not null,
  cargo text,
  ordem integer not null default 0,
  -- Se pode figurar como signatário de ofícios.
  pode_assinar boolean not null default true,
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table diretoria_integrantes is
  'Roster de integrantes de cada mandato da diretoria. O signatário de um ofício sai daqui (pode_assinar = true no mandato vigente).';

create index if not exists idx_diretoria_integrantes_mandato
  on diretoria_integrantes (mandato_id);
