-- Confluir — Prontuário do filiado (atualizado em 2026-07-15)
-- A tabela `filiacao_prontuario` foi MIGRADA do Bubble (12,9k registros) —
-- este script agora só cria o índice de consulta e garante o RLS.
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create index if not exists filiacao_prontuario_filiacao_idx
  on public.filiacao_prontuario (filiacao_id, data desc)
  where filiacao_id is not null;

-- Padrão do projeto: RLS deny-all (acesso só pelo servidor, service role)
alter table public.filiacao_prontuario enable row level security;
