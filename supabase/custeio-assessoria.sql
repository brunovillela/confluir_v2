-- Custeio Institucional: beneficiário do tipo "Assessoria" (16/10/2026).
-- A assessoria sai do cadastro de fornecedores (`empresa`); o custeio guarda
-- o id para reabrir a edição e para a ordem nascer com o fornecedor como
-- favorecido (beneficiario_fornecedor_id). Idempotente.

alter table public.institucional_custeios
  add column if not exists fornecedor_id uuid references public.empresa(id);

create index if not exists idx_custeios_fornecedor
  on public.institucional_custeios (fornecedor_id)
  where fornecedor_id is not null;
