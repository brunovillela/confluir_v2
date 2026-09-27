-- OPCIONAL (27/09/2026): preenche a forma de recebimento no CADASTRO de cada
-- filiado a partir do seu recebimento mais recente (maior competência).
-- Rodar DEPOIS de supabase/recebe-forma-backfill.sql.
-- Só preenche quem está "não informado" (forma_recebimento is null): não
-- mexe em forma escolhida à mão nem em forma vinda de lista nova. Grava a
-- competência em forma_recebimento_ordem, então uma lista mais antiga não a
-- troca depois. Em empate na mesma competência, vale o maior valor. Idempotente.

with ultimo as (
  select distinct on (r.filiado_id)
         r.filiado_id,
         r.forma_recebimento,
         m.ordem
    from public.filiacao_recebe r
    join public.filiacao_recebe_remessa m on m.id = r.remessa_id
   where r.filiado_id is not null
     and r.forma_recebimento is not null
     and m.ordem is not null
   order by r.filiado_id, m.ordem desc, r.valor desc nulls last
)
update public.filiacoes f
   set forma_recebimento = u.forma_recebimento,
       forma_recebimento_ordem = u.ordem
  from ultimo u
 where f.id = u.filiado_id
   and f.forma_recebimento is null;

-- Conferência: cadastros por forma (null = não informado).
select forma_recebimento, count(*) as filiados
  from public.filiacoes
 group by forma_recebimento
 order by forma_recebimento nulls last;
