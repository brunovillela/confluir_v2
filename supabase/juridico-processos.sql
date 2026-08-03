-- Confluir — Jurídico: Processos (registro simples) (2026-07-24)
--
-- Cadastro enxuto das ações judiciais acompanhadas pelo sindicato — SEM
-- controle de andamentos, prazos ou audiências (decisão do Bruno). A tabela
-- `juridico_processos` já existia VAZIA, migrada do Bubble, com boa parte do
-- modelo: numero_processo, coletivo (individual×coletivo), finalizado,
-- status_processo, parte_assessorada, outras_partes[] (parte contrária) e a
-- junção N:N `juridico_processos_filiados` (processo_id + filiado_id, ambas
-- FK, PK composta) também já existe.
--
-- Este script acrescenta só o que falta para o registro: a ÁREA do direito
-- (`tipo`), o responsável interno, as observações e a data de abertura, mais
-- índices e o RLS deny-all. `assessoria_id` (assessoria externa) do legado
-- fica dormente — sem tabela de assessorias no schema; entra numa evolução
-- futura se necessário.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Campos do registro simples
-- ---------------------------------------------------------------------------
alter table public.juridico_processos
  add column if not exists tipo text,
  add column if not exists data_abertura date,
  add column if not exists observacoes text,
  add column if not exists responsavel_id uuid references public.usuarios (id),
  add column if not exists registrado_por_id uuid references public.usuarios (id);

comment on column public.juridico_processos.tipo is
  'Área do direito (Trabalhista, Cível, Previdenciário, …). Lista controlada '
  'na aplicação (lib/juridico-constantes.ts).';

comment on column public.juridico_processos.data_abertura is
  'Data de distribuição/abertura do processo. Opcional; a ordenação cai para '
  'created_at quando ausente.';

comment on column public.juridico_processos.responsavel_id is
  'Usuário do sindicato responsável pelo acompanhamento do processo.';

comment on column public.juridico_processos.registrado_por_id is
  'Usuário do painel que cadastrou o processo.';

-- ---------------------------------------------------------------------------
-- 2) Índices para a listagem e a busca reversa por filiado
-- ---------------------------------------------------------------------------
create index if not exists juridico_processos_emp_idx
  on public.juridico_processos (emp_proprietaria_id, data_abertura desc);
create index if not exists juridico_processos_status_idx
  on public.juridico_processos (status_processo);
create index if not exists juridico_processos_tipo_idx
  on public.juridico_processos (tipo);
create index if not exists juridico_processos_responsavel_idx
  on public.juridico_processos (responsavel_id);
-- processo_id já é coberto pela PK composta; falta o lado do filiado.
create index if not exists juridico_processos_filiados_filiado_idx
  on public.juridico_processos_filiados (filiado_id);

-- ---------------------------------------------------------------------------
-- 3) RLS deny-all — padrão do projeto: dados só via service role no servidor
-- ---------------------------------------------------------------------------
alter table public.juridico_processos enable row level security;
alter table public.juridico_processos_filiados enable row level security;
