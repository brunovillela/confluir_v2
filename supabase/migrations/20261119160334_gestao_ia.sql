-- Confluir — Gestão: Inteligência Artificial da entidade
--
-- POR QUÊ: o módulo Gestão (19/11/2026) dá aos administradores da entidade o
-- controle da IA: usar uma chave de API própria (a conta da entidade paga o
-- que consome), ver quanto cada pessoa, processo, departamento e módulo usa,
-- pôr um teto mensal e desligar a IA de um módulo. Até aqui a chave era uma
-- só, da plataforma (OPENAI_API_KEY), e o uso não ficava registrado.
--
-- COMO:
--  1. ia_config: uma linha por entidade. A chave de API chega pelo formulário
--     e é gravada CIFRADA pela aplicação (AES-256-GCM, chave em variável de
--     ambiente, a entidade como dado autenticado — lib/segredos.ts). O banco
--     nunca vê a chave em claro e a tela só mostra os 4 últimos caracteres.
--     Também guarda o modelo escolhido, o teto mensal, os preços para estimar
--     o custo e os módulos com a IA desligada.
--  2. ia_uso: uma linha por chamada à IA (lib/ia.ts): quem, qual processo e
--     módulo, o departamento da pessoa naquele momento, o modelo, os tokens,
--     a duração e se deu certo. NÃO guarda o texto enviado nem o devolvido.
--  3. gestao_eventos: o que os administradores mudaram na Gestão (chave
--     trocada ou removida, teto, modelo, módulos desligados) e quem mudou.
-- RLS por entidade (tenant_isolation) e set_emp_from_jwt. Idempotente.

-- ── 1. ia_config ───────────────────────────────────────────────────────────
create table if not exists public.ia_config (
  emp_proprietaria_id uuid primary key references public.empresa(id) on delete cascade,
  chave_cifrada text,
  chave_versao smallint,
  chave_final text,
  chave_definida_por uuid references public.usuarios(id) on delete set null,
  chave_definida_em timestamptz,
  chave_testada_em timestamptz,
  chave_teste_erro text,
  modelo text,
  ia_ativa boolean not null default true,
  modulos_desligados text[] not null default '{}'::text[],
  limite_mensal_usd numeric(12,2),
  bloquear_no_limite boolean not null default false,
  preco_entrada_usd_milhao numeric(12,4),
  preco_entrada_cache_usd_milhao numeric(12,4),
  preco_saida_usd_milhao numeric(12,4),
  atualizado_por uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint ia_config_chave_final_curta check (chave_final is null or length(chave_final) <= 4),
  constraint ia_config_limite_positivo check (limite_mensal_usd is null or limite_mensal_usd > 0)
);

alter table public.ia_config enable row level security;
drop policy if exists tenant_isolation on public.ia_config;
create policy tenant_isolation on public.ia_config to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.ia_config from public, anon;
grant select, insert, update, delete on table public.ia_config to authenticated;
grant all on table public.ia_config to service_role;

drop trigger if exists set_emp_from_jwt on public.ia_config;
create trigger set_emp_from_jwt before insert on public.ia_config
  for each row execute function public.set_emp_from_jwt();

comment on table public.ia_config is 'Configuração da IA da entidade (Gestão › Inteligência Artificial, 19/11/2026): chave de API própria cifrada pela aplicação, modelo, teto mensal, preços para estimar o custo e módulos com a IA desligada. [lgpd:credencial|titulares:funcionarios]';
comment on column public.ia_config.chave_cifrada is 'Chave de API da entidade cifrada com AES-256-GCM pela aplicação (lib/segredos.ts); a chave de cifra fica em variável de ambiente, fora do banco. Nunca é devolvida à tela. [lgpd:credencial]';
comment on column public.ia_config.chave_versao is 'Qual chave de cifra foi usada (0 = derivada de SAUDE_RELATORIO_CHAVE, 1 = SEGREDOS_CHAVE), para permitir a rotação.';
comment on column public.ia_config.chave_final is 'Os 4 últimos caracteres da chave, só para identificá-la na tela. [lgpd:credencial]';
comment on column public.ia_config.chave_definida_por is 'Quem cadastrou a chave atual. [lgpd:identificacao]';
comment on column public.ia_config.chave_definida_em is 'Quando a chave atual foi cadastrada.';
comment on column public.ia_config.chave_testada_em is 'Último teste de conexão com a chave atual.';
comment on column public.ia_config.chave_teste_erro is 'Erro do último teste (nulo = deu certo). [lgpd:nenhum]';
comment on column public.ia_config.modelo is 'Modelo escolhido pela entidade; nulo = o padrão da plataforma (MODELO_IA).';
comment on column public.ia_config.ia_ativa is 'false = toda a IA desligada na entidade.';
comment on column public.ia_config.modulos_desligados is 'Módulos (slug de lib/ia-processos.ts) em que a IA está desligada.';
comment on column public.ia_config.limite_mensal_usd is 'Teto de custo estimado por mês, em US$ (precisa dos preços). Nulo = sem teto.';
comment on column public.ia_config.bloquear_no_limite is 'true = ao atingir o teto, a IA para até o mês seguinte; false = só avisa.';
comment on column public.ia_config.preco_entrada_usd_milhao is 'Preço do modelo por 1 milhão de tokens de entrada, em US$ (para estimar o custo).';
comment on column public.ia_config.preco_entrada_cache_usd_milhao is 'Preço por 1 milhão de tokens de entrada lidos do cache, em US$.';
comment on column public.ia_config.preco_saida_usd_milhao is 'Preço por 1 milhão de tokens de saída (inclui o raciocínio), em US$.';
comment on column public.ia_config.atualizado_por is 'Quem salvou a configuração por último. [lgpd:identificacao]';

-- ── 2. ia_uso ──────────────────────────────────────────────────────────────
create table if not exists public.ia_uso (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  criado_em timestamptz not null default now(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  departamento_id uuid references public.empresa_departamentos(id) on delete set null,
  processo text not null default 'nao_identificado',
  modulo text not null default 'outros',
  tipo text not null default 'texto',
  modelo text not null,
  origem_chave text not null default 'plataforma',
  tokens_entrada integer not null default 0,
  tokens_entrada_cache integer not null default 0,
  tokens_saida integer not null default 0,
  tokens_raciocinio integer not null default 0,
  custo_estimado_usd numeric(12,6),
  duracao_ms integer,
  sucesso boolean not null default true,
  erro text,
  constraint ia_uso_tipo_valido check (tipo in ('texto', 'json', 'pdf', 'imagem')),
  constraint ia_uso_origem_valida check (origem_chave in ('entidade', 'plataforma', 'bloqueada'))
);

create index if not exists ia_uso_emp_data_idx on public.ia_uso (emp_proprietaria_id, criado_em desc);
create index if not exists ia_uso_emp_usuario_idx on public.ia_uso (emp_proprietaria_id, usuario_id, criado_em desc);

alter table public.ia_uso enable row level security;
drop policy if exists tenant_isolation on public.ia_uso;
create policy tenant_isolation on public.ia_uso to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.ia_uso from public, anon;
grant select, insert, update, delete on table public.ia_uso to authenticated;
grant all on table public.ia_uso to service_role;

drop trigger if exists set_emp_from_jwt on public.ia_uso;
create trigger set_emp_from_jwt before insert on public.ia_uso
  for each row execute function public.set_emp_from_jwt();

comment on table public.ia_uso is 'Uma linha por chamada à IA (lib/ia.ts): quem pediu, processo, módulo, departamento, modelo, tokens, custo estimado e resultado. Não guarda o texto enviado nem o devolvido (19/11/2026). [lgpd:identificacao|titulares:funcionarios]';
comment on column public.ia_uso.usuario_id is 'Quem estava logado quando a IA foi chamada; nulo em tarefa agendada, bot ou fluxo público. [lgpd:identificacao]';
comment on column public.ia_uso.departamento_id is 'Departamento da pessoa no momento da chamada (o primeiro que coordena ou integra).';
comment on column public.ia_uso.processo is 'Identificador do processo que chamou a IA (catálogo em lib/ia-processos.ts), ex.: compras.descricao.';
comment on column public.ia_uso.modulo is 'Módulo do processo (slug do catálogo), ex.: compras, financeiro, pessoal.';
comment on column public.ia_uso.tipo is 'Entrada da chamada: texto, json (texto com resposta estruturada), pdf ou imagem.';
comment on column public.ia_uso.origem_chave is 'Qual chave pagou: entidade (chave própria), plataforma (OPENAI_API_KEY) ou bloqueada (não chamou: IA desligada ou teto atingido).';
comment on column public.ia_uso.tokens_entrada is 'Tokens de entrada (inclui os do cache).';
comment on column public.ia_uso.tokens_entrada_cache is 'Parte dos tokens de entrada lida do cache (mais barata).';
comment on column public.ia_uso.tokens_saida is 'Tokens de saída (inclui o raciocínio).';
comment on column public.ia_uso.tokens_raciocinio is 'Parte dos tokens de saída gasta no raciocínio interno do modelo.';
comment on column public.ia_uso.custo_estimado_usd is 'Custo estimado em US$ pelos preços de ia_config no momento da chamada; nulo sem preços.';
comment on column public.ia_uso.duracao_ms is 'Duração da chamada em milissegundos.';
comment on column public.ia_uso.erro is 'Mensagem de erro amigável quando a chamada falhou (nunca o conteúdo). [lgpd:nenhum]';

-- ── 3. gestao_eventos ──────────────────────────────────────────────────────
create table if not exists public.gestao_eventos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  criado_em timestamptz not null default now(),
  usuario_id uuid references public.usuarios(id) on delete set null,
  area text not null,
  acao text not null,
  detalhe text
);

create index if not exists gestao_eventos_emp_data_idx on public.gestao_eventos (emp_proprietaria_id, criado_em desc);

alter table public.gestao_eventos enable row level security;
drop policy if exists tenant_isolation on public.gestao_eventos;
create policy tenant_isolation on public.gestao_eventos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.gestao_eventos from public, anon;
grant select, insert on table public.gestao_eventos to authenticated;
grant all on table public.gestao_eventos to service_role;

drop trigger if exists set_emp_from_jwt on public.gestao_eventos;
create trigger set_emp_from_jwt before insert on public.gestao_eventos
  for each row execute function public.set_emp_from_jwt();

comment on table public.gestao_eventos is 'O que os administradores mudaram na Gestão (chave de IA cadastrada ou removida, teto, modelo, módulos desligados) e quem mudou. Só se acrescenta (19/11/2026). [lgpd:identificacao|titulares:funcionarios]';
comment on column public.gestao_eventos.usuario_id is 'Quem fez a mudança. [lgpd:identificacao]';
comment on column public.gestao_eventos.area is 'Área da Gestão: ia, integracoes, acessos.';
comment on column public.gestao_eventos.acao is 'O que foi feito, em poucas palavras (ex.: chave_cadastrada).';
comment on column public.gestao_eventos.detalhe is 'Detalhe legível da mudança; nunca a chave nem dado pessoal além do nome. [lgpd:nenhum]';

-- ── 4. Resumo do uso (painel da Gestão e teto mensal) ──────────────────────
-- Agrega no banco para não esbarrar no teto de 1.000 linhas do PostgREST.
create or replace function public.ia_uso_resumo(p_emp uuid, p_de timestamptz, p_ate timestamptz)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with u as (
    select * from ia_uso
     where emp_proprietaria_id = p_emp
       and criado_em >= p_de and criado_em < p_ate
  ),
  agrega as (
    select dim, chave,
           count(*) as chamadas,
           count(*) filter (where not sucesso and origem_chave <> 'bloqueada') as falhas,
           count(*) filter (where origem_chave = 'bloqueada') as bloqueadas,
           coalesce(sum(tokens_entrada), 0) as tokens_entrada,
           coalesce(sum(tokens_entrada_cache), 0) as tokens_entrada_cache,
           coalesce(sum(tokens_saida), 0) as tokens_saida,
           coalesce(sum(tokens_raciocinio), 0) as tokens_raciocinio,
           sum(custo_estimado_usd) as custo,
           max(criado_em) as ultima
      from (
        select 'usuario' as dim, coalesce(usuario_id::text, '') as chave, * from u
        union all select 'processo', processo, * from u
        union all select 'departamento', coalesce(departamento_id::text, ''), * from u
        union all select 'modulo', modulo, * from u
        union all select 'modelo', modelo, * from u
        union all select 'origem', origem_chave, * from u
        union all select 'dia', to_char(criado_em at time zone 'America/Sao_Paulo', 'YYYY-MM-DD'), * from u
        union all select 'total', '', * from u
      ) x
     group by dim, chave
  )
  select coalesce(jsonb_object_agg(dim, linhas), '{}'::jsonb)
    from (
      select dim, jsonb_agg(jsonb_build_object(
               'chave', chave, 'chamadas', chamadas, 'falhas', falhas, 'bloqueadas', bloqueadas,
               'tokens_entrada', tokens_entrada, 'tokens_entrada_cache', tokens_entrada_cache,
               'tokens_saida', tokens_saida, 'tokens_raciocinio', tokens_raciocinio,
               'custo', custo, 'ultima', ultima
             ) order by tokens_entrada + tokens_saida desc) as linhas
        from agrega
       group by dim
    ) d;
$$;
revoke all on function public.ia_uso_resumo(uuid, timestamptz, timestamptz) from public, anon, authenticated;
grant execute on function public.ia_uso_resumo(uuid, timestamptz, timestamptz) to service_role;
comment on function public.ia_uso_resumo(uuid, timestamptz, timestamptz) is 'Uso da IA da entidade no período, agregado por pessoa, processo, departamento, módulo, modelo, origem da chave e dia (19/11/2026).';

-- Custo estimado e chamadas desde p_de: o teto mensal consulta isto antes de
-- cada chamada (uma soma pelo índice emp+data).
create or replace function public.ia_uso_custo_desde(p_emp uuid, p_de timestamptz)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(custo_estimado_usd), 0)
    from ia_uso
   where emp_proprietaria_id = p_emp
     and criado_em >= p_de;
$$;
revoke all on function public.ia_uso_custo_desde(uuid, timestamptz) from public, anon, authenticated;
grant execute on function public.ia_uso_custo_desde(uuid, timestamptz) to service_role;
comment on function public.ia_uso_custo_desde(uuid, timestamptz) is 'Custo estimado da IA da entidade desde a data (teto mensal da Gestão, 19/11/2026).';
