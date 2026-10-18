-- ============================================================================
-- Diretoria: liberações sindicais e instâncias  (2026-07-22)
--
-- • Liberação sindical: por força de ACT, um empregador (fonte pagadora) libera
--   o diretor — permanente ou pontualmente — para a atividade sindical. Controla
--   vigência (início/fim), o diretor, o empregador e o documento que oficializou.
--   Um diretor "liberado" é o que tem liberação vigente hoje.
-- • Instância: entidade em que o sindicato tem assento. Cada assento vincula
--   um diretor à instância, com cargo, mandato (início/fim) e documento de posse.
--
-- Documentos (liberação e posse) ficam no bucket privado `diretoria`.
-- Rodar uma vez no SQL Editor do Supabase. Idempotente.
-- ============================================================================

-- Liberações sindicais -------------------------------------------------------
create table if not exists diretoria_liberacoes (
  id uuid primary key default gen_random_uuid(),
  integrante_id uuid not null references diretoria_integrantes (id) on delete cascade,
  empresa_id uuid references empresa (id) on delete set null,  -- fonte pagadora que libera
  tipo text not null default 'permanente',                      -- permanente | pontual
  inicio date,
  fim date,                                                     -- null = permanente / sem término
  documento_url text,                                           -- doc que oficializou (bucket diretoria)
  observacao text,
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diretoria_liberacoes_integrante
  on diretoria_liberacoes (integrante_id);

comment on table diretoria_liberacoes is
  'Liberações sindicais: empregador (empresa_id) libera o diretor (integrante_id) para atividade sindical. Vigente = hoje entre inicio e fim (fim null = permanente).';

-- Instâncias (entidades com assento do sindicato) ---------------------------
create table if not exists diretoria_instancias (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Assentos: diretor representando o sindicato numa instância -----------------
create table if not exists diretoria_instancia_assentos (
  id uuid primary key default gen_random_uuid(),
  instancia_id uuid not null references diretoria_instancias (id) on delete cascade,
  integrante_id uuid references diretoria_integrantes (id) on delete set null,
  cargo text,
  mandato_inicio date,
  mandato_fim date,
  documento_url text,                                           -- doc que oficializa o cargo
  emp_proprietaria_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_diretoria_assentos_instancia
  on diretoria_instancia_assentos (instancia_id);
create index if not exists idx_diretoria_assentos_integrante
  on diretoria_instancia_assentos (integrante_id);
