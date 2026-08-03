-- Confluir — Saúde: apontamento no prontuário do filiado (2026-07-21)
--
-- Cada atendimento de saúde registra um apontamento GENÉRICO no prontuário
-- do filiado ("Atendido pela Medicina do Trabalho"), sem qualquer conteúdo
-- clínico. É o rastro administrativo; o conteúdo fica no relatório cifrado.
--
-- Duas notas sobre o desenho:
--
--  • O vínculo `atendimento_id` existe para o apontamento ser IDEMPOTENTE.
--    Sem ele, editar um atendimento criaria um segundo apontamento, e o
--    prontuário do filiado encheria de repetições da mesma consulta.
--    O legado tinha `atendimento_raw` (bubble_id em texto), que veio 100%
--    vazio na migração — não serve de vínculo.
--
--  • O tipo é 'Atendimento de saúde', NÃO 'Atendimento'. Este último já
--    existe com 1.078 registros e significa atendimento de balcão do
--    sindicato ("extrato IR", "reembolsos", "eleições Petros"). Reusar o
--    nome misturaria serviço administrativo com serviço de saúde e tornaria
--    o prontuário impossível de filtrar.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

alter table public.filiacao_prontuario
  add column if not exists atendimento_id uuid
    references public.saude_atendimentos (id) on delete cascade;

comment on column public.filiacao_prontuario.atendimento_id is
  'Atendimento de saúde que originou o apontamento. Garante um apontamento '
  'por atendimento e remove o rastro se o atendimento for excluído. O '
  'apontamento NUNCA contém conteúdo clínico.';

create unique index if not exists filiacao_prontuario_atendimento_uk
  on public.filiacao_prontuario (atendimento_id)
  where atendimento_id is not null;
