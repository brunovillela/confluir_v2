-- Confluir — Jurídico: Homologações de rescisão trabalhista (2026-07-24)
--
-- O sindicato HOMOLOGA a rescisão do contrato de trabalho — assiste o
-- trabalhador no acerto rescisório, filiado ou não. A tabela
-- `juridico_homologacoes` já existia com 599 registros migrados do Bubble
-- (jan/2024 → jul/2025), com estes campos: data, data_demissao, motivo,
-- fonte_pg_id (empregador), filiado_id, trabalhador_nao_filiado, parecer_url.
--
-- LIMITAÇÃO DO LEGADO: 460 de 599 registros são de NÃO-FILIADOS e a tabela
-- nunca guardou nome nem CPF do trabalhador não-filiado — esses registros
-- ficam anônimos (só data, motivo e empregador). Este script acrescenta as
-- colunas para IDENTIFICAR o trabalhador não-filiado nos registros NOVOS,
-- sem tentar recuperar o que o Bubble não gravou.
--
-- O parecer jurídico passa a ser um PDF no bucket privado `juridico`
-- (nenhum dos 599 legados tem parecer). `parecer_url` guarda o CAMINHO no
-- bucket — a URL assinada é gerada no servidor na hora da exibição, padrão
-- do projeto. O nome mantém-se por compatibilidade com o legado (que já
-- aceitava URL absoluta); o código trata caminho e URL.
--
-- Processos jurídicos ficam para uma rodada futura (a tabela vazia
-- `juridico_processos` já existe e não é tocada aqui).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Identificação do trabalhador não-filiado, observações e autoria
-- ---------------------------------------------------------------------------
alter table public.juridico_homologacoes
  add column if not exists trabalhador_nome text,
  add column if not exists trabalhador_cpf text,
  add column if not exists observacoes text,
  add column if not exists registrado_por_id uuid references public.usuarios (id);

comment on column public.juridico_homologacoes.trabalhador_nome is
  'Nome do trabalhador quando NÃO-FILIADO (filiado_id nulo). Nos filiados o '
  'nome vem de filiacoes. Os 460 não-filiados migrados do Bubble ficam sem '
  'nome — o legado não gravou; só se preenche daqui pra frente.';

comment on column public.juridico_homologacoes.trabalhador_cpf is
  'CPF (só dígitos) do trabalhador não-filiado. Idem: legado sem CPF.';

comment on column public.juridico_homologacoes.registrado_por_id is
  'Usuário do painel que cadastrou a homologação. Nulo no legado.';

-- ---------------------------------------------------------------------------
-- 2) Índices para a listagem (período, empregador, filiado, motivo)
-- ---------------------------------------------------------------------------
create index if not exists juridico_homologacoes_data_idx
  on public.juridico_homologacoes (emp_proprietaria_id, data desc);
create index if not exists juridico_homologacoes_filiado_idx
  on public.juridico_homologacoes (filiado_id);
create index if not exists juridico_homologacoes_fonte_idx
  on public.juridico_homologacoes (fonte_pg_id);
create index if not exists juridico_homologacoes_motivo_idx
  on public.juridico_homologacoes (motivo);

-- ---------------------------------------------------------------------------
-- 3) Storage — bucket privado para os pareceres (PDF)
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('juridico', 'juridico', false)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- 4) RLS deny-all — padrão do projeto: dados só via service role no servidor
-- ---------------------------------------------------------------------------
alter table public.juridico_homologacoes enable row level security;
