-- Confluir — Contratos: categorias (2026-08-01)
--
-- A tabela `contratos_categorias` já existe (migrada do Bubble, com `nome` e o
-- flag `sigiloso`), mas estava sem uso. Aqui adicionamos o vínculo do contrato
-- à categoria. Depois, RE-RODAR supabase/rls-emp-todas.sql (garante RLS/grant/
-- trigger em `contratos_categorias` e `contratos`, ambas com emp_proprietaria_id).

alter table public.contratos
  add column if not exists categoria_id uuid references public.contratos_categorias(id);
create index if not exists idx_contratos_categoria
  on public.contratos (categoria_id);
