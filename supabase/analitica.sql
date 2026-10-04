-- Confluir — Camada analítica (2026-10-04, onda 3 / I1)
--
-- Quatro "fatos" mensais em views materializadas, atualizadas uma vez por
-- noite pelo cron /api/analitica/tick (e sob demanda no painel executivo).
-- O painel lê pelas funções analitica_*(p_emp, p_meses), que SEMPRE filtram
-- pelo tenant informado — as views em si não ficam expostas a anon/authenticated.
--
--   fato_filiacao_mensal    entradas, saídas e ativos ao fim de cada mês
--   fato_arrecadacao_mensal valor, lançamentos e pagantes por mês, tipo e fonte
--   fato_despesa_mensal     ordens PAGAS por mês, tipo, centro de custo e departamento
--                           (respeitando o rateio quando existe)
--   fato_frota_mensal       abastecimento, km, manutenção, multas e aluguel por veículo
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente (drop/create).
-- Primeira carga: a função analitica_atualizar() no fim deste arquivo.

-- ── Índices de apoio nas tabelas-base ───────────────────────────────────────
create index if not exists ordens_pagamento_emp_sit_pag_idx
  on public.ordens_pagamento (emp_proprietaria_id, situacao, data_pagamento);
create index if not exists filiacao_recebe_remessa_idx
  on public.filiacao_recebe (remessa_id);
create index if not exists filiacoes_emp_ativo_em_idx
  on public.filiacoes (emp_proprietaria_id, ativo_em);
create index if not exists filiacoes_emp_inativo_em_idx
  on public.filiacoes (emp_proprietaria_id, inativo_em);
create index if not exists veiculos_abastecimentos_veic_data_idx
  on public.veiculos_abastecimentos (veiculo_id, data_hora_abastecimento);

-- ── 1. Filiação ─────────────────────────────────────────────────────────────
-- Entrada = quando virou "Ativo" (ativo_em; cadastros antigos: a primeira
-- data de filiação dos vínculos). Saída = inativo_em (ou a desfiliação do
-- vínculo). Ativos ao fim do mês = entradas até o mês − saídas até o mês.
drop materialized view if exists public.fato_filiacao_mensal;
create materialized view public.fato_filiacao_mensal as
with pessoas as (
  select
    f.emp_proprietaria_id,
    f.id,
    f.filiacao_condicao = 'Ativo' as ativo_hoje,
    -- Datas REAIS (entram nas séries de entradas/saídas)
    coalesce(f.ativo_em::date, v.primeira_filiacao) as entrada_real,
    case when f.filiacao_condicao = 'Ativo' then null
         else coalesce(f.inativo_em::date, v.ultima_desfiliacao) end as saida_real,
    -- Datas de CONTAGEM (estoque de ativos): quem é ativo hoje sem data entra
    -- pela data da condição ou do cadastro; quem não é ativo e não tem data
    -- de saída sai pela data da condição (ou nunca contou).
    coalesce(f.ativo_em::date, v.primeira_filiacao, f.condicao_desde::date, f.created_at::date) as entrada_conta,
    case when f.filiacao_condicao = 'Ativo' then null
         else coalesce(f.inativo_em::date, v.ultima_desfiliacao, f.condicao_desde::date,
                       coalesce(f.ativo_em::date, v.primeira_filiacao, f.condicao_desde::date, f.created_at::date)) end as saida_conta
  from public.filiacoes f
  left join lateral (
    select min(coalesce(x.data_filiacao, x.filiacao_data_adesao)) as primeira_filiacao,
           max(coalesce(x.data_desfiliacao, x.filiacao_data_saida)) as ultima_desfiliacao
    from public.filiacao_vinculos x where x.filiado_id = f.id
  ) v on true
  where f.filiacao_excluida is not true
    and f.mesclado_em is null
    and f.anonimizada_em is null
),
meses as (
  select distinct emp_proprietaria_id, m::date as mes
  from pessoas, generate_series(date_trunc('month', now()) - interval '59 months', date_trunc('month', now()), interval '1 month') m
)
select
  m.emp_proprietaria_id,
  m.mes,
  (select count(*) from pessoas p where p.emp_proprietaria_id = m.emp_proprietaria_id and p.entrada_real >= m.mes and p.entrada_real < m.mes + interval '1 month')::int as entradas,
  (select count(*) from pessoas p where p.emp_proprietaria_id = m.emp_proprietaria_id and p.saida_real   >= m.mes and p.saida_real   < m.mes + interval '1 month')::int as saidas,
  (select count(*) from pessoas p where p.emp_proprietaria_id = m.emp_proprietaria_id
      and p.entrada_conta is not null and p.entrada_conta < m.mes + interval '1 month'
      and (p.saida_conta is null or p.saida_conta >= m.mes + interval '1 month'))::int as ativos_fim_mes
from meses m;
create unique index fato_filiacao_mensal_pk on public.fato_filiacao_mensal (emp_proprietaria_id, mes);

-- ── 2. Arrecadação ──────────────────────────────────────────────────────────
drop materialized view if exists public.fato_arrecadacao_mensal;
create materialized view public.fato_arrecadacao_mensal as
select
  r.emp_proprietaria_id,
  make_date((r.ordem / 100)::int, (r.ordem % 100)::int, 1) as mes,
  coalesce(r.tipo, 'Associativa') as tipo,
  coalesce(l.fonte_pg_id, r.emp_contratante_id) as fonte_id,
  -- chave sem null para o índice único (o refresh concorrente exige colunas simples)
  coalesce(l.fonte_pg_id, r.emp_contratante_id, '00000000-0000-0000-0000-000000000000'::uuid) as fonte_chave,
  sum(coalesce(l.valor, 0))::numeric(14,2) as valor,
  count(*)::int as lancamentos,
  count(distinct coalesce(l.filiado_id::text, l.cpf))::int as pagantes
from public.filiacao_recebe_remessa r
join public.filiacao_recebe l on l.remessa_id = r.id
where r.ordem is not null and r.ordem between 200001 and 210012 and (r.ordem % 100) between 1 and 12
group by 1, 2, 3, 4, 5;
create unique index fato_arrecadacao_mensal_pk
  on public.fato_arrecadacao_mensal (emp_proprietaria_id, mes, tipo, fonte_chave);

-- ── 3. Despesa (ordens pagas) ───────────────────────────────────────────────
drop materialized view if exists public.fato_despesa_mensal;
create materialized view public.fato_despesa_mensal as
with pagas as (
  select o.*, coalesce(o.valor_pago, o.valor_inicial_cobranca, o.valor, 0) as valor_efetivo
  from public.ordens_pagamento o
  where o.situacao = 'Paga' and o.excluido is not true and o.data_pagamento is not null
),
linhas as (
  -- ordens com rateio: cada parte no seu centro de custo/departamento
  select p.emp_proprietaria_id, p.data_pagamento, p.tipo, r.centro_custo_despesa_id, r.departamento_id, r.valor::numeric as valor, p.id as ordem_id
  from pagas p join public.ordens_pagamento_rateio r on r.ordem_id = p.id
  union all
  -- ordens sem rateio: o valor inteiro no centro/departamento da ordem
  select p.emp_proprietaria_id, p.data_pagamento, p.tipo, p.centro_custo_despesa_id, p.departamento_id, p.valor_efetivo, p.id
  from pagas p
  where not exists (select 1 from public.ordens_pagamento_rateio r where r.ordem_id = p.id)
)
select
  emp_proprietaria_id,
  date_trunc('month', data_pagamento)::date as mes,
  coalesce(tipo, '(sem tipo)') as tipo,
  centro_custo_despesa_id,
  departamento_id,
  coalesce(centro_custo_despesa_id, '00000000-0000-0000-0000-000000000000'::uuid) as centro_chave,
  coalesce(departamento_id, '00000000-0000-0000-0000-000000000000'::uuid) as departamento_chave,
  sum(valor)::numeric(14,2) as valor,
  count(distinct ordem_id)::int as ordens
from linhas
group by 1, 2, 3, 4, 5, 6, 7;
create unique index fato_despesa_mensal_pk
  on public.fato_despesa_mensal (emp_proprietaria_id, mes, tipo, centro_chave, departamento_chave);

-- ── 4. Frota ────────────────────────────────────────────────────────────────
drop materialized view if exists public.fato_frota_mensal;
create materialized view public.fato_frota_mensal as
with meses as (
  select v.emp_proprietaria_id, v.id as veiculo_id, m::date as mes
  from public.veiculos v,
       generate_series(date_trunc('month', now()) - interval '35 months', date_trunc('month', now()), interval '1 month') m
),
abast as (
  select veiculo_id, date_trunc('month', data_hora_abastecimento)::date as mes,
         sum(coalesce(valor_abastecimento, 0)) as valor, sum(coalesce(volume_abastecido, 0)) as litros,
         max(hodometro) - min(hodometro) as km, count(*) as qtd
  from public.veiculos_abastecimentos where veiculo_id is not null and data_hora_abastecimento is not null
  group by 1, 2
),
manut as (
  select veiculo_id, date_trunc('month', realizada_em)::date as mes, sum(coalesce(valor, 0)) as valor, count(*) as qtd
  from public.veiculos_manutencoes where veiculo_id is not null and realizada_em is not null
  group by 1, 2
),
multas as (
  select veiculo_id, date_trunc('month', infracao_data)::date as mes, sum(coalesce(infracao_custo, 0)) as valor, count(*) as qtd
  from public.veiculos_infracoes where veiculo_id is not null and infracao_data is not null
  group by 1, 2
)
select
  m.emp_proprietaria_id,
  m.mes,
  m.veiculo_id,
  coalesce(a.valor, 0)::numeric(14,2) as abastecimento_valor,
  coalesce(a.litros, 0)::numeric(14,2) as abastecimento_litros,
  greatest(coalesce(a.km, 0), 0)::int as km_rodados,
  coalesce(a.qtd, 0)::int as abastecimentos,
  coalesce(mn.valor, 0)::numeric(14,2) as manutencao_valor,
  coalesce(mn.qtd, 0)::int as manutencoes,
  coalesce(mu.valor, 0)::numeric(14,2) as multas_valor,
  coalesce(mu.qtd, 0)::int as multas,
  coalesce((
    select c.valor_mensal from public.veiculo_contratos_aluguel c
    where c.id = v.contrato_aluguel_id
      and (c.vigencia_inicio is null or c.vigencia_inicio < m.mes + interval '1 month')
      and (c.vigencia_termino is null or c.vigencia_termino >= m.mes)
  ), 0)::numeric(14,2) as aluguel_valor
from meses m
join public.veiculos v on v.id = m.veiculo_id
left join abast a on a.veiculo_id = m.veiculo_id and a.mes = m.mes
left join manut mn on mn.veiculo_id = m.veiculo_id and mn.mes = m.mes
left join multas mu on mu.veiculo_id = m.veiculo_id and mu.mes = m.mes
where coalesce(a.qtd, 0) + coalesce(mn.qtd, 0) + coalesce(mu.qtd, 0) > 0
   or v.contrato_aluguel_id is not null;
create unique index fato_frota_mensal_pk on public.fato_frota_mensal (emp_proprietaria_id, mes, veiculo_id);

-- ── Controle de atualização ─────────────────────────────────────────────────
create table if not exists public.analitica_atualizacoes (
  fato text primary key,
  atualizado_em timestamptz not null default now(),
  duracao_ms int
);
alter table public.analitica_atualizacoes enable row level security;
revoke all on public.analitica_atualizacoes from anon, authenticated;
revoke all on public.fato_filiacao_mensal, public.fato_arrecadacao_mensal,
  public.fato_despesa_mensal, public.fato_frota_mensal from anon, authenticated;

create or replace function public.analitica_atualizar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_inicio timestamptz;
  v_fato text;
  v_saida jsonb := '{}'::jsonb;
begin
  foreach v_fato in array array['fato_filiacao_mensal','fato_arrecadacao_mensal','fato_despesa_mensal','fato_frota_mensal'] loop
    v_inicio := clock_timestamp();
    execute format('refresh materialized view concurrently public.%I', v_fato);
    insert into public.analitica_atualizacoes (fato, atualizado_em, duracao_ms)
    values (v_fato, now(), (extract(epoch from clock_timestamp() - v_inicio) * 1000)::int)
    on conflict (fato) do update set atualizado_em = excluded.atualizado_em, duracao_ms = excluded.duracao_ms;
    v_saida := v_saida || jsonb_build_object(v_fato, (extract(epoch from clock_timestamp() - v_inicio) * 1000)::int);
  end loop;
  return v_saida;
end;
$fn$;
revoke all on function public.analitica_atualizar() from public, anon, authenticated;
grant execute on function public.analitica_atualizar() to service_role;

-- ── Leitura por tenant (o painel chama com o próprio tenant) ────────────────
create or replace function public.analitica_filiacao(p_emp uuid, p_meses int default 12)
returns setof public.fato_filiacao_mensal
language sql security definer set search_path = public stable as $fn$
  select * from public.fato_filiacao_mensal
  where emp_proprietaria_id = p_emp and mes >= date_trunc('month', now()) - make_interval(months => greatest(p_meses, 1) - 1)
  order by mes
$fn$;

create or replace function public.analitica_arrecadacao(p_emp uuid, p_meses int default 12)
returns setof public.fato_arrecadacao_mensal
language sql security definer set search_path = public stable as $fn$
  select * from public.fato_arrecadacao_mensal
  where emp_proprietaria_id = p_emp and mes >= date_trunc('month', now()) - make_interval(months => greatest(p_meses, 1) - 1)
  order by mes, tipo
$fn$;

create or replace function public.analitica_despesa(p_emp uuid, p_meses int default 12)
returns setof public.fato_despesa_mensal
language sql security definer set search_path = public stable as $fn$
  select * from public.fato_despesa_mensal
  where emp_proprietaria_id = p_emp and mes >= date_trunc('month', now()) - make_interval(months => greatest(p_meses, 1) - 1)
  order by mes, tipo
$fn$;

create or replace function public.analitica_frota(p_emp uuid, p_meses int default 12)
returns setof public.fato_frota_mensal
language sql security definer set search_path = public stable as $fn$
  select * from public.fato_frota_mensal
  where emp_proprietaria_id = p_emp and mes >= date_trunc('month', now()) - make_interval(months => greatest(p_meses, 1) - 1)
  order by mes, veiculo_id
$fn$;

create or replace function public.analitica_situacao()
returns setof public.analitica_atualizacoes
language sql security definer set search_path = public stable as $fn$
  select * from public.analitica_atualizacoes order by fato
$fn$;

-- As funções de leitura rodam pelo service role (createAdminClient().rpc):
-- fora de anon/authenticated, como as views.
revoke all on function public.analitica_filiacao(uuid, int), public.analitica_arrecadacao(uuid, int),
  public.analitica_despesa(uuid, int), public.analitica_frota(uuid, int), public.analitica_situacao()
  from public, anon, authenticated;
grant execute on function public.analitica_filiacao(uuid, int), public.analitica_arrecadacao(uuid, int),
  public.analitica_despesa(uuid, int), public.analitica_frota(uuid, int), public.analitica_situacao()
  to service_role;

-- Primeira carga (as views nascem preenchidas pelo create, mas registra a data).
select public.analitica_atualizar();
