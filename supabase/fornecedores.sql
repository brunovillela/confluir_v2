-- ═══════════════════════════════════════════════════════════════════════════
-- FORNECEDORES — cadastro completo (rodar no SQL Editor do Supabase)
--
-- Fornecedor = linha de `empresa`. O detalhe usa duas tabelas migradas
-- VAZIAS do Bubble:
--   • `dados_bancarios` — já tem fornecedor_id → empresa; usada como está.
--   • `enderecos` — genérica (usuario_id/filiado_id), ganha `empresa_id`
--     para endereços de fornecedores.
-- Ordens de pagamento legadas vieram SEM vínculo de fornecedor (100% null
-- na migração) — a lista de ordens do fornecedor cobre as novas (compras,
-- faturas de hotel) até uma re-migração na virada.
-- ═══════════════════════════════════════════════════════════════════════════

alter table enderecos
  add column if not exists empresa_id uuid references empresa(id);

create index if not exists idx_enderecos_empresa
  on enderecos (empresa_id);
create index if not exists idx_dados_bancarios_fornecedor
  on dados_bancarios (fornecedor_id);
create index if not exists idx_contratos_fornecedor
  on contratos (fornecedor_id);
-- Lista de ordens do fornecedor (favorecido em qualquer das duas colunas).
create index if not exists idx_ordens_fornecedor
  on ordens_pagamento (fornecedor_id);
create index if not exists idx_ordens_beneficiario_fornecedor
  on ordens_pagamento (beneficiario_fornecedor_id);

-- Padrão do projeto: RLS deny-all — dados só via service role no servidor.
alter table enderecos enable row level security;
alter table dados_bancarios enable row level security;
