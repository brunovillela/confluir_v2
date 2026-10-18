-- ===========================================================================
-- Diagnóstico de link/código de e-mail recusado (11/09/2026)
-- ===========================================================================
-- O Supabase Auth devolve o mesmo erro (otp_expired) para link vencido, já
-- usado ou substituído. Esta função deixa o app (só service_role) perguntar à
-- tabela interna auth.one_time_tokens se o token ainda existe e quando foi
-- criado. Usada por src/lib/auth-diagnostico.ts; sem ela o app só perde o
-- diagnóstico, nada quebra.
--
-- Não devolve token nem e-mail: só se existe e os horários.
-- O Supabase grava o hash com prefixo "pkce_" no fluxo PKCE; por isso o IN.
-- auth.one_time_tokens é interna do GoTrue. Se um dia mudar, a função passa
-- a dar erro e o app volta à mensagem genérica.
-- ===========================================================================

create or replace function public.auth_diagnostico_token(
  p_token_hash text,
  p_email text default null
)
returns jsonb
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with alvo as (
    select t.created_at
    from auth.one_time_tokens t
    where t.token_hash in (
      p_token_hash,
      'pkce_' || p_token_hash,
      regexp_replace(p_token_hash, '^pkce_', '')
    )
    order by t.created_at desc
    limit 1
  )
  select jsonb_build_object(
    'token_encontrado', exists (select 1 from alvo),
    'token_criado_em', (select created_at from alvo),
    'ultimo_token_email_em', case
      when p_email is null then null
      else (
        select max(t.created_at)
        from auth.one_time_tokens t
        where lower(t.relates_to) = lower(p_email)
      )
    end
  );
$$;

revoke all on function public.auth_diagnostico_token(text, text)
  from public, anon, authenticated;
grant execute on function public.auth_diagnostico_token(text, text)
  to service_role;

-- Conferência (deve devolver token_encontrado = false):
-- select public.auth_diagnostico_token('inexistente', 'ninguem@exemplo.com');
