-- POR QUÊ: Gestão (26/11/2026). A diretoria quer o inventário da IA: cada
--   operação que o sistema faz com IA, por módulo, quanto custa em média e
--   quanto tempo de trabalho ela poupa em relação a uma pessoa fazendo à mão,
--   e o tempo poupado acumulado. O resumo de uso (ia_uso_resumo) soma o custo,
--   mas não diz quantas chamadas tinham preço — a média ficaria errada quando
--   parte das chamadas não tem preço cadastrado — nem o tempo de resposta.
-- COMO:
--   1. ia_config.minutos_humanos (jsonb: processo → minutos): o tempo que uma
--      pessoa levaria em cada operação, ajustado pela Gestão. Sem ajuste, vale
--      a estimativa do catálogo (src/lib/ia-processos.ts).
--   2. ia_uso_inventario(emp, de, ate): por processo, chamadas, sucessos,
--      falhas, barradas, quantas tinham custo, custo, tokens, duração média,
--      modelos usados, primeira e última chamada. Só service_role.
--   Idempotente.

alter table public.ia_config
  add column if not exists minutos_humanos jsonb not null default '{}'::jsonb;

comment on column public.ia_config.minutos_humanos is 'Inventário da IA: minutos que uma pessoa levaria para fazer cada operação à mão (processo de lib/ia-processos.ts → minutos), ajustados pela Gestão; sem ajuste vale a estimativa do catálogo (26/11/2026).';

create or replace function public.ia_uso_inventario(p_emp uuid, p_de timestamptz, p_ate timestamptz)
returns table (
  processo text,
  chamadas bigint,
  sucessos bigint,
  falhas bigint,
  bloqueadas bigint,
  com_custo bigint,
  custo numeric,
  tokens_entrada bigint,
  tokens_saida bigint,
  duracao_media_ms numeric,
  modelos text[],
  primeira timestamptz,
  ultima timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select u.processo,
         count(*) as chamadas,
         count(*) filter (where u.sucesso) as sucessos,
         count(*) filter (where not u.sucesso and u.origem_chave <> 'bloqueada') as falhas,
         count(*) filter (where u.origem_chave = 'bloqueada') as bloqueadas,
         count(*) filter (where u.custo_estimado_usd is not null) as com_custo,
         sum(u.custo_estimado_usd) as custo,
         coalesce(sum(u.tokens_entrada), 0) as tokens_entrada,
         coalesce(sum(u.tokens_saida), 0) as tokens_saida,
         avg(u.duracao_ms) filter (where u.sucesso) as duracao_media_ms,
         array_agg(distinct u.modelo) filter (where u.sucesso) as modelos,
         min(u.criado_em) as primeira,
         max(u.criado_em) as ultima
    from ia_uso u
   where u.emp_proprietaria_id = p_emp
     and u.criado_em >= p_de and u.criado_em < p_ate
   group by u.processo;
$$;
revoke all on function public.ia_uso_inventario(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ia_uso_inventario(uuid, timestamptz, timestamptz) to service_role;
comment on function public.ia_uso_inventario(uuid, timestamptz, timestamptz) is 'Inventário da IA (Gestão, 26/11/2026): por processo, chamadas, sucessos, falhas, barradas, chamadas com custo, custo, tokens, duração média, modelos e primeira/última chamada no período.';
