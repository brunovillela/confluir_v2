-- ============================================================================
-- CPF e matrícula sindical únicos nos cadastros de filiação (2026-09-16).
--
-- RODAR POR ÚLTIMO, depois de:
--   1. supabase/filiacao-duplicidades.sql;
--   2. scripts/limpar-identidade-filiados.mjs --apply;
--   3. resolver os grupos em Filiados › Cadastros pendentes › Possíveis
--      duplicidades (mesclar ou corrigir CPF/matrícula).
--
-- Idempotente e seguro: cada índice só é criado se NÃO houver mais repetição
-- entre os cadastros não excluídos. Enquanto houver, o SQL avisa quantos
-- faltam e segue — dá para rodar de novo depois.
--
-- A partir daí o próprio banco recusa CPF ou matrícula repetidos, qualquer que
-- seja o caminho (tela, importação, script).
-- ============================================================================

do $$
declare
  repetidas integer;
begin
  select count(*) into repetidas from (
    select emp_proprietaria_id, matricula_sindical
      from filiacoes
     where filiacao_excluida is not true and matricula_sindical is not null
     group by 1, 2
    having count(*) > 1
  ) g;
  if repetidas > 0 then
    raise notice 'Matrícula sindical: ainda há % matrícula(s) repetida(s) — índice NÃO criado. Resolva em Possíveis duplicidades e rode de novo.', repetidas;
  else
    execute 'create unique index if not exists ux_filiacoes_matricula_sindical
               on filiacoes (emp_proprietaria_id, matricula_sindical)
               where filiacao_excluida is not true and matricula_sindical is not null';
    raise notice 'Matrícula sindical: índice único criado (ou já existia).';
  end if;

  select count(*) into repetidas from (
    select emp_proprietaria_id, cpf
      from filiacoes
     where filiacao_excluida is not true and cpf is not null
     group by 1, 2
    having count(*) > 1
  ) g;
  if repetidas > 0 then
    raise notice 'CPF: ainda há % CPF(s) repetido(s) — índice NÃO criado. Rode o script de limpeza, resolva em Possíveis duplicidades e rode de novo.', repetidas;
  else
    execute 'create unique index if not exists ux_filiacoes_cpf
               on filiacoes (emp_proprietaria_id, cpf)
               where filiacao_excluida is not true and cpf is not null';
    raise notice 'CPF: índice único criado (ou já existia).';
  end if;
end $$;
