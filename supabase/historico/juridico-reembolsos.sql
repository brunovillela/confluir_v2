-- Confluir — Jurídico: Reembolsos de processo (2026-07-24)
--
-- O ESCRITÓRIO DE ADVOCACIA responsável pelo caso gasta (custas, perícia,
-- deslocamento…) e o sindicato REEMBOLSA (decisão do Bruno). Modelo:
--
--  • O escritório é uma EMPRESA (fornecedor). Fica amarrado ao PROCESSO na
--    coluna `juridico_processos.assessoria_id` (já existia do Bubble, solta;
--    aqui ganha FK para `empresa` e índice). Todo reembolso do processo paga
--    esse escritório.
--  • Esteira em DUAS ETAPAS: a gestão jurídica APROVA/REPROVA o reembolso; ao
--    aprovar, gera uma ordem de pagamento tipo 'Reembolso' em 'Em autorização'
--    (favorecido = escritório) que ainda passa pela ALÇADA do Financeiro —
--    nunca se gera ordem já autorizada.
--
-- A tabela `juridico_reembolsos` já existia VAZIA (valor, data_pagamento,
-- descricao_despesa, comprovante_despesa, processo_id→juridico_processos,
-- ordem_pagamento_id→ordens_pagamento). Este script acrescenta os campos da
-- esteira, os índices e o RLS.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

-- ---------------------------------------------------------------------------
-- 1) Escritório responsável no processo (assessoria_id → empresa)
-- ---------------------------------------------------------------------------
comment on column public.juridico_processos.assessoria_id is
  'Escritório de advocacia responsável pelo caso (linha de empresa/fornecedor). '
  'Favorecido dos reembolsos do processo.';

create index if not exists juridico_processos_assessoria_idx
  on public.juridico_processos (assessoria_id);

-- FK para integridade (a tabela está vazia, então adicionar é seguro).
do $$
begin
  if not exists (
    select 1 from information_schema.table_constraints
    where constraint_name = 'juridico_processos_assessoria_fk'
      and table_name = 'juridico_processos'
  ) then
    alter table public.juridico_processos
      add constraint juridico_processos_assessoria_fk
      foreign key (assessoria_id) references public.empresa (id);
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- 2) Campos da esteira de aprovação do reembolso
-- ---------------------------------------------------------------------------
alter table public.juridico_reembolsos
  add column if not exists situacao text not null default 'aguardando',
  add column if not exists data_despesa date,
  add column if not exists solicitante_id uuid references public.usuarios (id),
  add column if not exists avaliador_id uuid references public.usuarios (id),
  add column if not exists avaliacao_data timestamptz,
  add column if not exists avaliacao_observacao text;

comment on column public.juridico_reembolsos.situacao is
  'aguardando | aprovado | reprovado. O estado ''pago'' deriva da ordem de '
  'pagamento vinculada (ordem_pagamento_id.pago).';

comment on column public.juridico_reembolsos.comprovante_despesa is
  'Caminho do comprovante no bucket privado `juridico`. Nunca URL pública — a '
  'URL assinada é gerada no servidor na hora da exibição.';

-- ---------------------------------------------------------------------------
-- 3) Índices
-- ---------------------------------------------------------------------------
create index if not exists juridico_reembolsos_processo_idx
  on public.juridico_reembolsos (processo_id);
create index if not exists juridico_reembolsos_situacao_idx
  on public.juridico_reembolsos (emp_proprietaria_id, situacao);
create index if not exists juridico_reembolsos_ordem_idx
  on public.juridico_reembolsos (ordem_pagamento_id);

-- ---------------------------------------------------------------------------
-- 4) RLS deny-all — dados só via service role no servidor
-- ---------------------------------------------------------------------------
alter table public.juridico_reembolsos enable row level security;
