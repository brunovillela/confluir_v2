-- Confluir — saúde da numeração sindical
--
-- POR QUÊ: a numeração da matrícula sindical é sequencial (17/11/2026): sem
-- buracos, sem número repetido, e o cadastro unido fica com o menor número do
-- par. O arranjo do SINDIPETRO-NF acertou isso uma vez; o painel precisa
-- mostrar quando algo sai do lugar (número digitado à mão, cadastro excluído,
-- importação), sem precisar de outro levantamento por script.
--
-- COMO: filiacao_numeracao_saude(p_emp, p_limite) devolve, num jsonb, os
-- totais e as listas (até p_limite itens cada) de:
--   buracos (em faixas de/até), números repetidos, cadastros unidos que ficaram
--   com o número maior quando o menor está livre, cadastros sem número e
--   matrícula fora do padrão (não numérica ou com mais de 7 dígitos).
-- Só cadastros não excluídos seguram número. Os buracos saem por janela
-- (lead) sobre os números em uso, sem gerar a série inteira.
-- Só o service role executa. Idempotente.

create or replace function public.filiacao_numeracao_saude(p_emp uuid, p_limite integer default 200)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with vivos as (
    select id, nome_completo, matricula_sindical, matricula_sindical_numero as n, created_at
      from filiacoes
     where emp_proprietaria_id = p_emp
       and filiacao_excluida is not true
  ),
  numerados as (
    select * from vivos where n between 1 and 9999999
  ),
  usados as (
    select distinct n from numerados
  ),
  faixas as (
    select de, ate, ate - de + 1 as qtd
      from (
        select n + 1 as de, lead(n) over (order by n) - 1 as ate
          from (select 0 as n union all select n from usados) x
      ) t
     where ate >= de
  ),
  repetidas as (
    select n,
           jsonb_agg(jsonb_build_object('id', id, 'nome', nome_completo, 'criado', created_at) order by created_at) as cadastros
      from numerados
     group by n
    having count(*) > 1
  ),
  unidos as (
    select p.id, p.nome_completo as nome, p.n as atual, min(s.matricula_sindical_numero) as menor
      from numerados p
      join filiacoes s
        on s.mesclado_em_id = p.id
       and s.emp_proprietaria_id = p_emp
       and s.filiacao_excluida is true
     where s.matricula_sindical_numero between 1 and 9999999
       and s.matricula_sindical_numero < p.n
       and not exists (select 1 from usados u where u.n = s.matricula_sindical_numero)
     group by p.id, p.nome_completo, p.n
  ),
  sem_numero as (
    select id, nome_completo as nome, created_at as criado
      from vivos
     where coalesce(trim(matricula_sindical), '') = ''
  ),
  fora as (
    select id, nome_completo as nome, matricula_sindical as matricula
      from vivos
     where coalesce(trim(matricula_sindical), '') <> ''
       and (n is null or n not between 1 and 9999999)
  )
  select jsonb_build_object(
    'em_uso', (select count(*) from numerados),
    'maior', (select coalesce(max(n), 0) from usados),
    'buracos', (select coalesce(sum(qtd), 0) from faixas),
    'faixas_buracos', coalesce((select jsonb_agg(jsonb_build_object('de', de, 'ate', ate, 'qtd', qtd) order by de)
                                  from (select * from faixas order by de limit p_limite) f), '[]'::jsonb),
    'repetidas', (select count(*) from repetidas),
    'lista_repetidas', coalesce((select jsonb_agg(jsonb_build_object('numero', n, 'cadastros', cadastros) order by n)
                                   from (select * from repetidas order by n limit p_limite) r), '[]'::jsonb),
    'unidos_maior', (select count(*) from unidos),
    'lista_unidos', coalesce((select jsonb_agg(to_jsonb(u) order by u.atual)
                                from (select * from unidos order by atual limit p_limite) u), '[]'::jsonb),
    'sem_numero', (select count(*) from sem_numero),
    'lista_sem_numero', coalesce((select jsonb_agg(to_jsonb(s) order by s.criado desc)
                                    from (select * from sem_numero order by criado desc limit p_limite) s), '[]'::jsonb),
    'fora_padrao', (select count(*) from fora),
    'lista_fora_padrao', coalesce((select jsonb_agg(to_jsonb(f) order by f.nome)
                                     from (select * from fora order by nome limit p_limite) f), '[]'::jsonb)
  );
$$;

revoke all on function public.filiacao_numeracao_saude(uuid, integer) from public, anon, authenticated;
grant execute on function public.filiacao_numeracao_saude(uuid, integer) to service_role;

comment on function public.filiacao_numeracao_saude(uuid, integer) is 'Saúde da numeração sindical da entidade: buracos, repetidas, unidos com o número maior, sem número e fora do padrão (18/11/2026).';
