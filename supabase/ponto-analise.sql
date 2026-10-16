-- ============================================================================
-- Análise do controle de ponto (16/10/2026): indicadores e resenha por IA por
-- remessa, por ano e por departamento. Idempotente — rodar no SQL Editor.
--
-- 1. MARCAÇÕES: a IA lê o espelho de ponto (PDF com texto — os do Secullum
--    lançados no Confluir) e guarda as marcações de cada dia no próprio
--    registro. Delas saem jornada acima de 10 h, intervalo curto, menos de
--    11 h entre jornadas, domingos/feriados e 7 dias seguidos trabalhados.
--    Espelhos escaneados (os vindos do Bubble) não são lidos.
-- 2. RESENHAS: o texto da IA fica guardado (com os indicadores usados) até
--    alguém pedir outro. Escopo remessa (chave = id da remessa), ano (chave =
--    AAAA) ou departamento (chave = AAAA:<id do departamento>).
-- ============================================================================

alter table public.pessoal_registro_ponto
  add column if not exists marcacoes jsonb,
  add column if not exists marcacoes_lidas_em timestamptz,
  add column if not exists marcacoes_erro text;

comment on column public.pessoal_registro_ponto.marcacoes is
  'Marcações diárias lidas do espelho pela IA: { departamento, carga_diaria, dias: [{ data, ocorrencia, marcacoes[] }] }.';

create table if not exists public.pessoal_ponto_resenhas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  escopo text not null check (escopo in ('remessa', 'ano', 'departamento')),
  chave text not null,
  conteudo jsonb not null,
  indicadores jsonb,
  modelo text,
  gerada_em timestamptz not null default now(),
  gerada_por uuid references public.usuarios(id),
  unique (emp_proprietaria_id, escopo, chave)
);

comment on table public.pessoal_ponto_resenhas is
  'Resenhas redigidas por IA sobre o controle de ponto (riscos trabalhistas, quem acompanhar), por remessa, ano ou departamento.';

alter table public.pessoal_ponto_resenhas enable row level security;
drop policy if exists tenant_isolation on public.pessoal_ponto_resenhas;
create policy tenant_isolation on public.pessoal_ponto_resenhas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.pessoal_ponto_resenhas to authenticated;

notify pgrst, 'reload schema';
