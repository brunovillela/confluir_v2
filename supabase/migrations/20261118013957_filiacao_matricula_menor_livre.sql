-- Confluir — matrícula sindical: a menor livre, escolhida no banco
--
-- POR QUÊ: desde 17/11/2026 o cadastro novo recebe a MENOR matrícula sindical
-- vaga. O sistema calculava isso lendo as ~20 mil matrículas da entidade a
-- cada cadastro (20 páginas pela API) e gravava sem trava: dois cadastros no
-- mesmo instante podiam pegar o mesmo número, e a "devolução" do perdedor
-- ainda deixava um número falso em filiacao_matriculas_anteriores.
--
-- COMO:
--  1. Índice parcial (entidade, número) só dos cadastros não excluídos — o
--     conjunto que segura número.
--  2. filiacao_matriculas_livres(p_emp, p_qtd): as p_qtd menores livres, numa
--     consulta. Entre 1 e (números em uso + p_qtd) há sempre p_qtd vagos.
--  3. filiacao_atribuir_matricula(p_emp, p_id): dá a menor livre a um cadastro
--     sem matrícula, sob uma trava por entidade (pg_advisory_xact_lock):
--     cadastros simultâneos entram em fila e cada um leva um número diferente.
--     Cadastro que já tem matrícula fica como está.
-- Só o service role executa (o app chama .rpc pelo service). Idempotente.

create index if not exists filiacoes_matricula_numero_vivos_idx
  on public.filiacoes (emp_proprietaria_id, matricula_sindical_numero)
  where matricula_sindical_numero is not null and filiacao_excluida is not true;

create or replace function public.filiacao_matriculas_livres(p_emp uuid, p_qtd integer default 1)
returns integer[]
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(array_agg(n order by n), '{}'::integer[])
    from (
      select g as n
        from generate_series(
               1,
               (select count(*)::integer
                  from filiacoes
                 where emp_proprietaria_id = p_emp
                   and filiacao_excluida is not true
                   and matricula_sindical_numero between 1 and 9999999) + greatest(p_qtd, 1)
             ) as g
       where not exists (
               select 1
                 from filiacoes f
                where f.emp_proprietaria_id = p_emp
                  and f.filiacao_excluida is not true
                  and f.matricula_sindical_numero = g
             )
       order by g
       limit greatest(p_qtd, 1)
    ) livres;
$$;

create or replace function public.filiacao_atribuir_matricula(p_emp uuid, p_id uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_atual text;
  v_numero integer;
begin
  select matricula_sindical into v_atual
    from filiacoes
   where id = p_id and emp_proprietaria_id = p_emp
   for update;
  if not found then
    return null;
  end if;
  if coalesce(trim(v_atual), '') <> '' then
    return v_atual;
  end if;

  -- Uma atribuição por vez na entidade; a trava cai no fim da transação.
  perform pg_advisory_xact_lock(hashtextextended('filiacao_matricula:' || p_emp::text, 0));
  v_numero := (public.filiacao_matriculas_livres(p_emp, 1))[1];

  update filiacoes
     set matricula_sindical = v_numero::text,
         matricula_sindical_numero = v_numero,
         updated_at = now()
   where id = p_id;
  return v_numero::text;
end;
$$;

revoke all on function public.filiacao_matriculas_livres(uuid, integer) from public, anon, authenticated;
revoke all on function public.filiacao_atribuir_matricula(uuid, uuid) from public, anon, authenticated;
grant execute on function public.filiacao_matriculas_livres(uuid, integer) to service_role;
grant execute on function public.filiacao_atribuir_matricula(uuid, uuid) to service_role;

comment on function public.filiacao_matriculas_livres(uuid, integer) is 'As p_qtd menores matrículas sindicais livres da entidade (cadastro excluído não segura número). 18/11/2026.';
comment on function public.filiacao_atribuir_matricula(uuid, uuid) is 'Dá a menor matrícula sindical livre a um cadastro sem matrícula, com trava por entidade (sem número repetido entre cadastros simultâneos). 18/11/2026.';
