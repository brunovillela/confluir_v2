-- ============================================================================
-- Movimento da folha para a contabilidade (16/10/2026). Idempotente — rodar no
-- SQL Editor do Supabase ANTES do deploy (`atualizarAcesso` grava todas as
-- chaves do catálogo: as permissões novas precisam existir antes).
--
-- 1. PERMISSÕES
--    pessoal_contabilidade        a contabilidade (escritório externo) consulta
--                                 e exporta as competências ENVIADAS e marca
--                                 como recebidas
--    pessoal_contabilidade_envio  quem confere e ENVIA a competência (hoje a
--                                 Simone; delegável)
-- 2. HISTÓRICO: a trilha de auditoria (trigger registrar_auditoria) passa a
--    cobrir vínculos, endereços, dependentes, níveis, jornada, função e a
--    tabela salarial — é dela que sai o que MUDOU na competência (cargo,
--    lotação, conta, endereço, dependentes…), com data e autor.
-- 3. COMPETÊNCIAS: uma por mês (AAAA-MM). Aberta, o relatório é calculado na
--    hora; ENVIADA, fica a fotografia (snapshot) do que foi entregue — o que
--    entrar depois vai para a competência seguinte, marcado como retroativo.
-- ============================================================================

-- ── 1. Permissões ───────────────────────────────────────────────────────────
alter table public.permissoes
  add column if not exists pessoal_contabilidade boolean,
  add column if not exists pessoal_contabilidade_envio boolean;

comment on column public.permissoes.pessoal_contabilidade is
  'Contabilidade: consultar, exportar e dar recebimento nas competências enviadas do movimento da folha.';
comment on column public.permissoes.pessoal_contabilidade_envio is
  'Conferir e enviar à contabilidade o movimento da folha de cada competência.';

-- ── 2. Trilha de auditoria nas tabelas do Pessoal ───────────────────────────
do $$
declare
  t text;
begin
  if to_regprocedure('public.registrar_auditoria()') is null then
    raise notice 'registrar_auditoria() não existe — rode supabase/auditoria.sql antes.';
    return;
  end if;
  foreach t in array array[
    'vinculos_trabalhistas', 'enderecos', 'pessoal_dependentes',
    'pessoal_nivel_salarial', 'pessoal_nivel_salarial_base',
    'pessoal_funcionario_jornada', 'pessoal_funcionario_funcao'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    execute format('drop trigger if exists auditoria_registrar on public.%I', t);
    execute format(
      'create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()',
      t
    );
  end loop;
end $$;

-- ── 3. Competências do movimento ────────────────────────────────────────────
create table if not exists public.pessoal_folha_competencias (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  competencia text not null check (competencia ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  situacao text not null default 'enviada' check (situacao in ('enviada')),
  enviada_em timestamptz not null default now(),
  enviada_por uuid references public.usuarios(id),
  observacao text,
  snapshot jsonb not null default '[]'::jsonb,
  total_itens integer not null default 0,
  recebida_em timestamptz,
  recebida_por uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  unique (emp_proprietaria_id, competencia)
);

comment on table public.pessoal_folha_competencias is
  'Competências do movimento da folha ENVIADAS à contabilidade, com a fotografia (snapshot) das linhas entregues. Competência sem linha aqui está aberta.';

alter table public.pessoal_folha_competencias enable row level security;
drop policy if exists tenant_isolation on public.pessoal_folha_competencias;
create policy tenant_isolation on public.pessoal_folha_competencias for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.pessoal_folha_competencias to authenticated;

notify pgrst, 'reload schema';
