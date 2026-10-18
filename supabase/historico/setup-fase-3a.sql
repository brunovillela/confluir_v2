-- Confluir — Fase 3A: preparação do banco para autenticação
-- Executar UMA VEZ no SQL Editor do Supabase (Dashboard → SQL Editor).
-- Script idempotente: pode rodar de novo sem efeitos colaterais.
--
-- Modelo de identidade (medido no banco em 2026-07-12):
--   • `usuarios` = todas as contas migradas do Bubble; funcionário do
--     sistema é quem tem registro em `permissoes`. O vínculo com o
--     Supabase Auth usa `usuarios.auth_user_id`.
--   • Filiados NÃO usam coluna de vínculo: a identidade é o CPF gravado
--     em `user_metadata.cpf` da conta Auth (filiacoes tem ~3 registros
--     históricos por CPF; o app agrega por CPF).

-- 1) Uma conta Auth nunca pode apontar para dois cadastros de usuário.
create unique index if not exists usuarios_auth_user_id_unico
  on public.usuarios (auth_user_id)
  where auth_user_id is not null;

-- 2) Consultas de autenticação por CPF e por vínculo precisam de índice
--    (filiacoes tem 20k linhas; lookups a cada login/proxy).
create index if not exists filiacoes_cpf_idx
  on public.filiacoes (cpf)
  where cpf is not null;

create index if not exists voto_assembleias_aptos_assembleia_cpf_idx
  on public.voto_assembleias_aptos (assembleia_id, cpf);

create index if not exists permissoes_usuario_id_idx
  on public.permissoes (usuario_id);

-- 3) Garantia: RLS habilitado em TODAS as tabelas do schema public.
--    Sem políticas definidas, anon/authenticated não leem nada — todo acesso
--    a dados passa pelo servidor Next.js (service role). Já está assim hoje;
--    este bloco garante que novas tabelas não fiquem de fora.
do $$
declare r record;
begin
  for r in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', r.tablename);
  end loop;
end $$;
