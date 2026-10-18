-- Confluir — O dia de início conta como dia de férias/afastamento (2026-10-01)
--
-- Regra nova (lib/periodo-dias.ts): 10 dias a partir de 01/10 vão até 10/10;
-- `termino` é o ÚLTIMO dia, o retorno é o dia seguinte. O legado (Bubble, e os
-- gozos gravados pelo Confluir até hoje) guardava em `termino` a data de
-- RETORNO — um dia depois. Este script recua esses términos em 1 dia.
--
-- Medido em 01/10/2026 antes de rodar:
--   gozos de férias ........ 27 com termino = inicio + dias   (12 já certos)
--   atestados médicos ...... 167 com termino = inicio + qtd  (5 já certos)
--   ausências do Bubble .... 375 com termino > inicio (falta justificada de
--                            sexta gravada até sábado, férias de 20 dias com
--                            21 de intervalo etc.). As 2 criadas no Confluir
--                            (sem bubble_id) ficam como estão.
--
-- Idempotente nos gozos e atestados (a condição deixa de valer após rodar).
-- As AUSÊNCIAS não têm contagem de dias para conferir: rode UMA vez só.

begin;

-- 1. Gozos de férias: termino passa a ser o último dia.
update public.pessoal_ferias_gozo
   set termino = (inicio::date + dias::int - 1)
 where inicio is not null
   and termino is not null
   and dias is not null
   and termino::date = inicio::date + dias::int;

-- 2. Atestados: termino = início + quantidade de dias − 1.
update public.pes_atestados_medicos
   set termino = (inicio::date + quantidade_dias::int - 1)
 where inicio is not null
   and termino is not null
   and quantidade_dias is not null
   and termino::date = inicio::date + quantidade_dias::int;

-- 3. Ausências migradas do Bubble (as ligadas a atestado acompanham o passo 2).
update public.pessoal_ausencias
   set termino = (termino::date - 1)
 where bubble_id is not null
   and inicio is not null
   and termino is not null
   and termino::date > inicio::date;

commit;

-- Conferência (deve voltar 0 nas duas primeiras):
-- select count(*) from pessoal_ferias_gozo where termino::date = inicio::date + dias::int;
-- select count(*) from pes_atestados_medicos where termino::date = inicio::date + quantidade_dias::int;
