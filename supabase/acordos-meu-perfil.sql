-- Confluir — Acordos Coletivos no Meu Perfil (2026-08-31)
--
-- Marca quais acordos são "da entidade com os PRÓPRIOS funcionários" (o
-- sindicato como empregador). Só os marcados aparecem na área Meu Perfil dos
-- funcionários — inclusive com a vigência vencida; saem apenas quando a
-- situação vira 'arquivado' (classificado como não vigente).
--
-- Idempotente. Executar UMA VEZ no SQL Editor do Supabase.

alter table acordo_coletivo
  add column if not exists com_funcionarios_entidade boolean not null default false;
