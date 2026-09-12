-- ===========================================================================
-- Busca de filiados pela matrícula na fonte (12/09/2026)
-- ===========================================================================
-- A busca rápida do módulo Filiação, a lista de filiados e os seletores de
-- filiado (sugerirFiliados em src/lib/db/filiados.ts) passam a achar a pessoa
-- também pela matrícula do empregador, que mora no vínculo:
-- filiacao_vinculos.matricula ("Matrícula na fonte" nas telas) e o legado
-- filiacao_vinculos.fonte_pg_matricula.
--
-- A comparação ignora máscara, caixa e zeros à esquerda: "0012345-6",
-- "12345-6" e "123456" são a mesma matrícula. Os índices por expressão deixam
-- a busca por prefixo rápida (operadores ~>=~ e ~<~ de text_pattern_ops, que
-- funcionam com parâmetro, ao contrário de LIKE).
--
-- Sem esta função o app não quebra: cai num ilike por prefixo no texto cru,
-- que acha menos porque depende da máscara digitada.
--
-- Só o service role executa. A organização é filtrada em p_emp.
-- ===========================================================================

create index if not exists filiacao_vinculos_matricula_busca_idx
  on public.filiacao_vinculos (
    emp_proprietaria_id,
    (ltrim(upper(regexp_replace(matricula, '[^A-Za-z0-9]', '', 'g')), '0')) text_pattern_ops
  );

create index if not exists filiacao_vinculos_fonte_pg_matricula_busca_idx
  on public.filiacao_vinculos (
    emp_proprietaria_id,
    (ltrim(upper(regexp_replace(fonte_pg_matricula, '[^A-Za-z0-9]', '', 'g')), '0')) text_pattern_ops
  );

create or replace function public.filiados_por_matricula_vinculo(
  p_emp uuid,
  p_termo text,
  p_limite integer default 200
)
returns table (filiado_id uuid, matricula text)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with t as (
    select ltrim(upper(regexp_replace(coalesce(p_termo, ''), '[^A-Za-z0-9]', '', 'g')), '0') as termo
  ),
  achados as (
    -- A matrícula normalizada só tem [0-9A-Z]; "[" vem logo depois de "Z",
    -- então [termo, termo || '[') é exatamente "começa com termo".
    select v.filiado_id, v.matricula
    from public.filiacao_vinculos v, t
    where length(t.termo) >= 3
      and v.emp_proprietaria_id = p_emp
      and ltrim(upper(regexp_replace(v.matricula, '[^A-Za-z0-9]', '', 'g')), '0') ~>=~ t.termo
      and ltrim(upper(regexp_replace(v.matricula, '[^A-Za-z0-9]', '', 'g')), '0') ~<~ (t.termo || '[')
    union all
    select v.filiado_id, v.fonte_pg_matricula
    from public.filiacao_vinculos v, t
    where length(t.termo) >= 3
      and v.emp_proprietaria_id = p_emp
      and ltrim(upper(regexp_replace(v.fonte_pg_matricula, '[^A-Za-z0-9]', '', 'g')), '0') ~>=~ t.termo
      and ltrim(upper(regexp_replace(v.fonte_pg_matricula, '[^A-Za-z0-9]', '', 'g')), '0') ~<~ (t.termo || '[')
  )
  select distinct on (a.filiado_id) a.filiado_id, a.matricula
  from achados a
  where a.filiado_id is not null
  order by a.filiado_id
  limit greatest(1, least(coalesce(p_limite, 200), 1000));
$$;

revoke all on function public.filiados_por_matricula_vinculo(uuid, text, integer)
  from public, anon, authenticated;
grant execute on function public.filiados_por_matricula_vinculo(uuid, text, integer)
  to service_role;

-- Conferência (troque pelo id da organização e por uma matrícula real):
-- select * from public.filiados_por_matricula_vinculo('<id da organização>'::uuid, '123456');
