-- Confluir — matrículas sindicais anteriores
--
-- POR QUÊ: o arranjo da numeração do SINDIPETRO-NF (17/11/2026) trocou a
-- matrícula sindical de 1.549 cadastros, e o número antigo só ficou no texto
-- do prontuário. Carteirinha impressa, planilha antiga ou o próprio filiado
-- ainda trazem o número velho: a busca precisa achar a pessoa por ele, e a
-- troca precisa poder ser conferida (ou desfeita) sem depender de arquivo solto.
--
-- COMO:
--  1. filiacao_matriculas_anteriores: um número que o cadastro já teve, até
--     quando, por qual foi trocado e por quê.
--  2. Gatilho em filiacoes: toda troca de matricula_sindical (edição, mesclagem,
--     script) guarda o número antigo sozinha — nenhum caminho precisa lembrar.
--  3. Carga das trocas do arranjo de 17/11/2026, lidas das notas do prontuário.
-- Idempotente.

create table if not exists public.filiacao_matriculas_anteriores (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  filiacao_id uuid not null references public.filiacoes(id) on delete cascade,
  matricula text not null,
  matricula_numero integer,
  substituida_por text,
  ate timestamptz not null default now(),
  motivo text,
  created_at timestamptz not null default now(),
  constraint filiacao_matriculas_anteriores_unica unique (filiacao_id, matricula)
);

create index if not exists filiacao_matriculas_anteriores_numero_idx
  on public.filiacao_matriculas_anteriores (emp_proprietaria_id, matricula_numero);

alter table public.filiacao_matriculas_anteriores enable row level security;
drop policy if exists tenant_isolation on public.filiacao_matriculas_anteriores;
create policy tenant_isolation on public.filiacao_matriculas_anteriores to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.filiacao_matriculas_anteriores from public, anon;
grant select on table public.filiacao_matriculas_anteriores to authenticated;
grant all on table public.filiacao_matriculas_anteriores to service_role;

comment on table public.filiacao_matriculas_anteriores is 'Matrículas sindicais que o cadastro já teve: a busca acha a pessoa pelo número antigo e a troca fica conferível (18/11/2026). Preenchida pelo gatilho de filiacoes. [lgpd:sensivel_sindical|titulares:filiados]';
comment on column public.filiacao_matriculas_anteriores.matricula is 'O número antigo, como estava gravado. [lgpd:sensivel_sindical]';
comment on column public.filiacao_matriculas_anteriores.matricula_numero is 'O número antigo como inteiro (para a busca exata). [lgpd:sensivel_sindical]';
comment on column public.filiacao_matriculas_anteriores.substituida_por is 'O número que entrou no lugar (null = matrícula apagada). [lgpd:sensivel_sindical]';
comment on column public.filiacao_matriculas_anteriores.ate is 'Até quando o cadastro teve esse número.';
comment on column public.filiacao_matriculas_anteriores.motivo is 'Por que trocou, quando se sabe (arranjo da numeração, mesclagem). [lgpd:nenhum]';

-- ── Gatilho: toda troca guarda o número antigo ─────────────────────────────
create or replace function public.filiacao_guardar_matricula_anterior()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if coalesce(old.matricula_sindical, '') <> ''
     and old.matricula_sindical is distinct from new.matricula_sindical then
    insert into public.filiacao_matriculas_anteriores
      (emp_proprietaria_id, filiacao_id, matricula, matricula_numero, substituida_por, ate, motivo)
    values (
      old.emp_proprietaria_id, old.id, old.matricula_sindical,
      case when old.matricula_sindical ~ '^\s*\d{1,9}\s*$' then trim(old.matricula_sindical)::integer end,
      nullif(new.matricula_sindical, ''), now(),
      nullif(current_setting('confluir.motivo_matricula', true), '')
    )
    on conflict on constraint filiacao_matriculas_anteriores_unica
      do update set substituida_por = excluded.substituida_por, ate = excluded.ate,
                    motivo = coalesce(excluded.motivo, filiacao_matriculas_anteriores.motivo);
  end if;
  return null;
end;
$$;
revoke all on function public.filiacao_guardar_matricula_anterior() from public, anon, authenticated;

drop trigger if exists filiacao_guardar_matricula_anterior on public.filiacoes;
create trigger filiacao_guardar_matricula_anterior
  after update of matricula_sindical on public.filiacoes
  for each row execute function public.filiacao_guardar_matricula_anterior();

-- ── Carga: as trocas do arranjo de 17/11/2026 (texto do prontuário) ─────────
insert into public.filiacao_matriculas_anteriores
  (emp_proprietaria_id, filiacao_id, matricula, matricula_numero, substituida_por, ate, motivo)
select p.emp_proprietaria_id, p.filiacao_id, m[1], m[1]::integer, m[2], p.data::timestamptz,
       'Arranjo da numeração (17/11/2026): ' || m[3]
  from public.filiacao_prontuario p
  cross join lateral regexp_match(
    p.descricao,
    '^Matrícula sindical alterada de (\d+) para (\d+) no arranjo da numeração \(17/11/2026\): (.*)\.$'
  ) as m
 where p.descricao like 'Matrícula sindical alterada de % no arranjo da numeração%'
   and p.filiacao_id is not null
on conflict on constraint filiacao_matriculas_anteriores_unica do nothing;
