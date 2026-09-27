-- Forma de recebimento dos lançamentos ANTIGOS (27/09/2026, regra do usuário):
--   fonte = INSS  → boleto
--   outras fontes → consignado
-- O INSS é reconhecido pelo CNPJ (29.979.036/0001-40), não pelo nome — vale
-- para qualquer tenant. Lançamentos SEM fonte (5.756 em 27/09) ficam como
-- estão (null): não dá para saber a forma sem a fonte.
-- Só toca quem ainda não tem forma (forma_recebimento is null): listas
-- importadas depois de 27/09 já vêm com a forma escolhida. Idempotente.
-- Pré-requisito: supabase/recebe-forma-recebimento.sql.

-- 1. INSS → boleto
update public.filiacao_recebe r
   set forma_recebimento = 'boleto'
  from public.empresa e
 where r.fonte_pg_id = e.id
   and e.cnpj_cpf = '29979036000140'
   and r.forma_recebimento is null;

-- 2. Demais fontes → consignado
update public.filiacao_recebe r
   set forma_recebimento = 'consignado'
 where r.fonte_pg_id is not null
   and r.forma_recebimento is null
   and not exists (
     select 1 from public.empresa e
      where e.id = r.fonte_pg_id and e.cnpj_cpf = '29979036000140'
   );

-- Conferência: quantos por forma (null = sem fonte).
select forma_recebimento, count(*) as lancamentos
  from public.filiacao_recebe
 group by forma_recebimento
 order by forma_recebimento nulls last;
