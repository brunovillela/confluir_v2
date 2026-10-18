-- Confluir — Comparador de acordos coletivos (Fase 2, 2026-09-29)
--
-- Uma comparação é entre DOIS documentos: A (base: o acordo anterior, o
-- vigente) e B (o novo, a proposta, o de outra empresa). Cada cláusula de A é
-- pareada com a de B que trata do mesmo assunto:
--   igual     — o texto não mudou (desconsiderando espaços e pontuação)
--   alterada  — mudou; a IA resume a mudança e avalia para o trabalhador
--   nova      — só em B
--   suprimida — só em A
-- O pareamento é salvo (com os ajustes manuais) para não refazer a cada visita.
--
-- Idempotente. Pré-requisito: supabase/acordos-texto-clausulas.sql.

create table if not exists acordo_comparacoes (id uuid primary key default gen_random_uuid());
alter table acordo_comparacoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table acordo_comparacoes add column if not exists acordo_a_id uuid references acordo_coletivo(id) on delete cascade;
alter table acordo_comparacoes add column if not exists acordo_b_id uuid references acordo_coletivo(id) on delete cascade;
alter table acordo_comparacoes add column if not exists titulo text;
alter table acordo_comparacoes add column if not exists analise_avisos text;
alter table acordo_comparacoes add column if not exists criado_por_id uuid references usuarios(id);
alter table acordo_comparacoes add column if not exists created_at timestamptz not null default now();
alter table acordo_comparacoes add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_acordo_comparacoes_emp
  on acordo_comparacoes (emp_proprietaria_id, created_at desc);

create table if not exists acordo_comparacao_pares (id uuid primary key default gen_random_uuid());
alter table acordo_comparacao_pares add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table acordo_comparacao_pares add column if not exists comparacao_id uuid references acordo_comparacoes(id) on delete cascade;
alter table acordo_comparacao_pares add column if not exists clausula_a_id uuid references acordo_clausulas(id) on delete set null;
alter table acordo_comparacao_pares add column if not exists clausula_b_id uuid references acordo_clausulas(id) on delete set null;
alter table acordo_comparacao_pares add column if not exists situacao text not null default 'alterada';
-- Como o par foi feito: titulo | texto | ia | manual.
alter table acordo_comparacao_pares add column if not exists origem_par text;
alter table acordo_comparacao_pares add column if not exists similaridade numeric;
alter table acordo_comparacao_pares add column if not exists tema text;
alter table acordo_comparacao_pares add column if not exists resumo_mudanca text;
-- Para o trabalhador: favoravel | desfavoravel | neutra (sugestão da IA; a entidade corrige).
alter table acordo_comparacao_pares add column if not exists avaliacao text;
alter table acordo_comparacao_pares add column if not exists avaliacao_motivo text;
alter table acordo_comparacao_pares add column if not exists avaliacao_manual boolean not null default false;
alter table acordo_comparacao_pares add column if not exists ordem integer not null default 0;

create index if not exists idx_acordo_comparacao_pares
  on acordo_comparacao_pares (comparacao_id, ordem);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'acordo_comparacao_pares_situacao_check') then
    alter table acordo_comparacao_pares add constraint acordo_comparacao_pares_situacao_check
      check (situacao in ('igual', 'alterada', 'nova', 'suprimida'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'acordo_comparacao_pares_avaliacao_check') then
    alter table acordo_comparacao_pares add constraint acordo_comparacao_pares_avaliacao_check
      check (avaliacao is null or avaliacao in ('favoravel', 'desfavoravel', 'neutra'));
  end if;
end $$;

-- ── RLS por tenant ───────────────────────────────────────────────────────────

alter table acordo_comparacoes enable row level security;
drop policy if exists tenant_isolation on acordo_comparacoes;
create policy tenant_isolation on acordo_comparacoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on acordo_comparacoes to authenticated;
drop trigger if exists set_emp_from_jwt on acordo_comparacoes;
create trigger set_emp_from_jwt before insert on acordo_comparacoes
  for each row execute function public.set_emp_from_jwt();

alter table acordo_comparacao_pares enable row level security;
drop policy if exists tenant_isolation on acordo_comparacao_pares;
create policy tenant_isolation on acordo_comparacao_pares for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on acordo_comparacao_pares to authenticated;
drop trigger if exists set_emp_from_jwt on acordo_comparacao_pares;
create trigger set_emp_from_jwt before insert on acordo_comparacao_pares
  for each row execute function public.set_emp_from_jwt();
