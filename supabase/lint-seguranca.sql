-- ===========================================================================
-- Remediação dos avisos do Database Linter do Supabase (25/07/2026)
-- ===========================================================================
-- Cobre os itens ACIONÁVEIS por SQL. Dois itens são de dashboard (ao final).
--
-- NÃO cobre os 35× `rls_enabled_no_policy` (INFO): são o deny-all PROJETADO.
-- Todas aquelas tabelas são acessadas só por service_role (legado do Bubble,
-- plataforma como `tenants`/`plataforma_admins`, staging `saude_cat_import`).
-- RLS ligado + zero policy = ninguém do papel authenticated/anon lê → backstop.
-- Nenhuma delas está em TABELAS_TENANT/TABELAS_TENANT_POR_PAI (conferido).
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) ERROR — Security Definer View: lgpd_retencoes_vencidas
-- ---------------------------------------------------------------------------
-- A view lê saude_assistidos (dados de saúde) e, como SECURITY DEFINER, roda
-- com os privilégios do criador → IGNORA o tenant_isolation da tabela base.
-- security_invoker = on faz a view respeitar a RLS de quem consulta (o JWT do
-- tenant vê só o seu; service_role continua ignorando RLS, como sempre).
alter view public.lgpd_retencoes_vencidas set (security_invoker = on);

-- ---------------------------------------------------------------------------
-- 2) WARN — Function Search Path Mutable (11 funções)
-- ---------------------------------------------------------------------------
-- search_path não fixo permite que um chamador anteponha um schema controlado
-- e sequestre referências não-qualificadas. Fixar em `public, pg_temp` mantém
-- o comportamento atual (todas as refs relevantes já são qualificadas:
-- auth.jwt(), public.cat_nz, ...) e fecha o vetor. pg_temp por último = objetos
-- temporários não conseguem sombrear os de public.
-- Loop por NOME cobre qualquer assinatura/sobrecarga sem precisar dos tipos.
do $$
declare
  r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in (
        'set_updated_at', 'voto_raw_array', 'set_emp_from_jwt',
        'cat_nz', 'cat_data', 'cat_bool', 'cat_titulo',
        'cat_sentenca', 'cat_codigo', 'cat_descricao', 'cat_cid'
      )
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) WARN — Leaked Password Protection (NÃO é SQL — dashboard)
-- ---------------------------------------------------------------------------
-- Authentication → Sign In / Providers → "Leaked password protection" → ON.
-- Checa senhas contra o HaveIBeenPwned (útil pro cadastro por senha do portal).
--
-- (Opcional, mesma tela) OTP/magic-link expiry ≤ 1h se o linter reclamar depois.
