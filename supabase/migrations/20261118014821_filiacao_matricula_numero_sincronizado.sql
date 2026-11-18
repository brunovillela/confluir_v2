-- Confluir — matricula_sindical_numero sempre igual ao texto da matrícula
--
-- POR QUÊ: a menor matrícula livre e a saúde da numeração (18/11/2026) leem
-- matricula_sindical_numero, mas nem todo caminho de gravação o preenchia: 11
-- cadastros (10 da demo, 1 do SINDIPETRO-NF) tinham a matrícula em texto e o
-- número vazio — a "menor livre" daria um número já em uso.
--
-- COMO:
--  1. Gatilho BEFORE INSERT/UPDATE OF matricula_sindical deriva o número do
--     texto (só dígitos, até 9; senão null). Nenhum caminho precisa lembrar.
--  2. Acerta os cadastros fora de sincronia (só a coluna numérica; não toca a
--     matrícula nem dispara o registro de matrícula anterior).
-- Idempotente.

create or replace function public.filiacao_sincronizar_matricula_numero()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.matricula_sindical_numero := case
    when trim(coalesce(new.matricula_sindical, '')) ~ '^\d{1,9}$'
      then trim(new.matricula_sindical)::integer
    else null
  end;
  return new;
end;
$$;
revoke all on function public.filiacao_sincronizar_matricula_numero() from public, anon, authenticated;

drop trigger if exists filiacao_sincronizar_matricula_numero on public.filiacoes;
create trigger filiacao_sincronizar_matricula_numero
  before insert or update of matricula_sindical, matricula_sindical_numero on public.filiacoes
  for each row execute function public.filiacao_sincronizar_matricula_numero();

update public.filiacoes
   set matricula_sindical_numero = case
         when trim(coalesce(matricula_sindical, '')) ~ '^\d{1,9}$' then trim(matricula_sindical)::integer
         else null
       end
 where matricula_sindical_numero is distinct from case
         when trim(coalesce(matricula_sindical, '')) ~ '^\d{1,9}$' then trim(matricula_sindical)::integer
         else null
       end;
