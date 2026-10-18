-- Confluir — Livro de exportações e endurecimento da API pública
-- (achados M5 e M6 da RIPD da base multi-entidade, docs/lgpd/ripd-base-multitenant.md)
--
-- POR QUÊ:
--   M5. As exportações em massa (lista de filiados com CPF, relatórios, links
--       de voto dos aptos, CAT, movimento da folha, remessas CNAB…) não
--       deixavam rastro: só as etiquetas tinham registro próprio
--       (comunicacao_etiquetas_emissoes). Sem isso a entidade não consegue
--       dizer quem levou a base para fora, quando e com qual recorte.
--   M6. A API pública (/api/v1/*) tinha um escopo único "leitura", que abria
--       todos os endpoints, inclusive /filiados com CPF, e não registrava
--       nenhuma requisição.
--
-- COMO:
--   1. lgpd_exportacoes: uma linha por arquivo gerado (quem, quando, rota,
--      filtros, formato, quantidade de linhas, categorias de dado pessoal).
--      Só o service_role grava (src/lib/exportacoes.ts, com o tenant
--      explícito); a entidade só LÊ, pela policy tenant_isolation. Ninguém
--      edita nem apaga pela API: é um livro.
--   2. api_requisicoes: uma linha por requisição à API (chave, rota,
--      parâmetros, status, quantidade de linhas, origem). Mesmo regime.
--   3. api_chaves.escopos passa a ser por endpoint: agenda, eventos,
--      arrecadacao, despesas, filiados e filiados_cpf (o CPF só sai com este
--      escopo explícito). O antigo "leitura" vira os cinco escopos sem CPF:
--      a chave ativa continua funcionando (sem reemitir), mas deixa de
--      receber CPF até a entidade marcar "filiados_cpf" no painel.
--      Default vazio: chave nova não lê nada sem escopo escolhido.

-- ── 1. Livro de exportações ─────────────────────────────────────────────────

create table if not exists public.lgpd_exportacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  usuario_id uuid references public.usuarios(id) on delete set null,
  recurso text not null,
  rota text not null,
  formato text,
  filtros jsonb not null default '{}'::jsonb,
  quantidade integer,
  categorias text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

create index if not exists idx_lgpd_exportacoes_emp
  on public.lgpd_exportacoes (emp_proprietaria_id, created_at desc);
create index if not exists idx_lgpd_exportacoes_usuario
  on public.lgpd_exportacoes (usuario_id, created_at desc);

alter table public.lgpd_exportacoes enable row level security;
drop policy if exists tenant_isolation on public.lgpd_exportacoes;
create policy tenant_isolation on public.lgpd_exportacoes
  for select to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

revoke all on table public.lgpd_exportacoes from public, anon, authenticated;
grant select on table public.lgpd_exportacoes to authenticated;
grant all on table public.lgpd_exportacoes to service_role;

comment on table public.lgpd_exportacoes is 'Livro de exportações (achado M5 da RIPD da base multi-entidade): uma linha por arquivo com dado pessoal gerado no painel (planilha, PDF, CNAB), com quem, quando, rota, filtros e quantidade de linhas. Gravado só pelo service_role (src/lib/exportacoes.ts); a entidade lê em Institucional › Auditoria. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.lgpd_exportacoes.usuario_id is 'Usuário do painel que gerou o arquivo. [lgpd:identificacao]';
comment on column public.lgpd_exportacoes.recurso is 'O que foi exportado, com chave estável (filiados, filiados_relatorio, cat, links_voto…); rótulos em src/lib/exportacoes.ts.';
comment on column public.lgpd_exportacoes.rota is 'Caminho da rota que gerou o arquivo (sem a query string).';
comment on column public.lgpd_exportacoes.formato is 'csv, xlsx, pdf ou cnab.';
comment on column public.lgpd_exportacoes.filtros is 'Parâmetros da URL usados no recorte (busca, situação, fonte, período…). A busca livre pode conter um nome. [lgpd:identificacao]';
comment on column public.lgpd_exportacoes.quantidade is 'Linhas (pessoas ou registros) no arquivo; nulo quando a rota não sabe contar.';
comment on column public.lgpd_exportacoes.categorias is 'Categorias de dado pessoal presentes no arquivo (identificacao, cpf, sindical, saude, financeiro, trabalhista, voto).';
comment on column public.lgpd_exportacoes.created_at is 'Quando o arquivo foi gerado.';

-- ── 2. Log de requisições da API ────────────────────────────────────────────

create table if not exists public.api_requisicoes (
  id bigint generated always as identity primary key,
  emp_proprietaria_id uuid not null references public.empresa(id),
  chave_id uuid references public.api_chaves(id) on delete set null,
  metodo text not null default 'GET',
  rota text not null,
  parametros jsonb not null default '{}'::jsonb,
  status integer not null,
  quantidade integer,
  origem_ip text,
  duracao_ms integer,
  created_at timestamptz not null default now()
);

create index if not exists idx_api_requisicoes_emp
  on public.api_requisicoes (emp_proprietaria_id, created_at desc);
create index if not exists idx_api_requisicoes_chave
  on public.api_requisicoes (chave_id, created_at desc);

alter table public.api_requisicoes enable row level security;
drop policy if exists tenant_isolation on public.api_requisicoes;
create policy tenant_isolation on public.api_requisicoes
  for select to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

revoke all on table public.api_requisicoes from public, anon, authenticated;
grant select on table public.api_requisicoes to authenticated;
grant all on table public.api_requisicoes to service_role;

comment on table public.api_requisicoes is 'Log de cada requisição à API pública /api/v1 (achado M6 da RIPD da base multi-entidade): chave, rota, parâmetros, status HTTP e quantidade de linhas devolvidas, inclusive as recusadas (chave errada, sem escopo, limite). Gravado só pelo service_role (src/lib/api-publica.ts); a entidade lê em Institucional › Auditoria. [lgpd:identificacao|titulares:sistemas e pessoas que usam a chave de API da entidade]';
comment on column public.api_requisicoes.chave_id is 'Chave usada; nulo quando a chave apresentada não existe.';
comment on column public.api_requisicoes.rota is 'Caminho pedido (ex.: /api/v1/filiados).';
comment on column public.api_requisicoes.parametros is 'Query string da requisição, sem a chave. A busca livre pode conter um nome. [lgpd:identificacao]';
comment on column public.api_requisicoes.status is 'Status HTTP devolvido.';
comment on column public.api_requisicoes.quantidade is 'Linhas devolvidas na resposta (nulo quando não há lista).';
comment on column public.api_requisicoes.origem_ip is 'IP de origem (x-forwarded-for), para identificar uso da chave fora do lugar esperado. [lgpd:identificacao]';
comment on column public.api_requisicoes.duracao_ms is 'Tempo de resposta em milissegundos.';
comment on column public.api_requisicoes.created_at is 'Quando a requisição chegou.';

-- ── 3. Escopos por endpoint ─────────────────────────────────────────────────

update public.api_chaves
   set escopos = (
         select coalesce(array_agg(distinct e order by e), '{}'::text[])
           from unnest(
                  array_remove(escopos, 'leitura')
                  || case when 'leitura' = any(escopos)
                          then array['agenda', 'eventos', 'arrecadacao', 'despesas', 'filiados']
                          else '{}'::text[] end
                ) as e
       )
 where 'leitura' = any(escopos);

alter table public.api_chaves alter column escopos set default '{}'::text[];

alter table public.api_chaves drop constraint if exists api_chaves_escopos_validos;
alter table public.api_chaves add constraint api_chaves_escopos_validos
  check (escopos <@ array['agenda', 'eventos', 'arrecadacao', 'despesas', 'filiados', 'filiados_cpf']::text[]);

comment on column public.api_chaves.escopos is 'Endpoints que a chave pode ler: agenda, eventos, arrecadacao, despesas, filiados; filiados_cpf libera o CPF em /filiados (sem ele o campo volta nulo). /eu não exige escopo.';
