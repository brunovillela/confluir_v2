-- ═══════════════════════════════════════════════════════════════════════════
-- CONTRATOS — módulo de Compras (rodar no SQL Editor do Supabase)
--
-- A tabela `contratos` já existe e veio migrada do Bubble (480 linhas). Este
-- script só complementa o que o módulo precisa — não recria nem apaga nada.
--
-- Decisões (24/07):
--   • `valor` — coluna NOVA, exposta a partir de agora (o legado não tinha
--     valor no contrato; o dinheiro fluía só pelas ordens de pagamento).
--   • Vínculo direto contrato↔ordem_pagamento: NÃO criado agora, mas é
--     OBRIGATÓRIO antes do lançamento real (hoje as ordens do contrato só
--     aparecem pela via indireta do fornecedor). Ver comentário no fim.
--   • `aditivo`/`contrato_principal_id` já existem: 106 marcados como aditivo,
--     mas só 6 apontam o principal — os órfãos aparecem como contrato comum
--     com aviso; re-ligação por código fica para a virada.
--   • Fluxo de autorização (`autorizacao_*`) permanece dormente nesta fase.
-- ═══════════════════════════════════════════════════════════════════════════

-- Valor de referência do contrato (mensal ou global, a critério do gestor).
alter table contratos
  add column if not exists valor numeric(15, 2);

-- Índices para listagem, alerta de vencimento e hierarquia de aditivos.
create index if not exists idx_contratos_fornecedor
  on contratos (fornecedor_id);
create index if not exists idx_contratos_departamento
  on contratos (departamento_id);
create index if not exists idx_contratos_principal
  on contratos (contrato_principal_id);
create index if not exists idx_contratos_vigencia_termino
  on contratos (vigencia_termino);
create index if not exists idx_contratos_emp_proprietaria
  on contratos (emp_proprietaria_id);

-- Padrão do projeto: RLS deny-all — dados só via service role no servidor.
alter table contratos enable row level security;

-- ─────────────────────────────────────────────────────────────────────────
-- PENDENTE ANTES DO LANÇAMENTO REAL — vínculo direto contrato ↔ ordem:
--   alter table ordens_pagamento
--     add column if not exists contrato_id uuid references contratos(id);
--   create index if not exists idx_ordens_contrato
--     on ordens_pagamento (contrato_id);
-- Enquanto essa coluna não existir, o detalhe do contrato lista as ordens
-- pela via indireta do fornecedor (mesmo comportamento do detalhe do
-- fornecedor). Ao criar a coluna, trocar para o vínculo direto.
-- ─────────────────────────────────────────────────────────────────────────
