-- Confluir — Congressos: grupos, propostas, relatoria e plenária (Fase 3)
--
-- POR QUÊ: no papel, o relator anota à mão, o relatório do grupo é redigitado
-- de madrugada, a fusão de propostas parecidas se perde e o resultado da
-- plenária fica só na ata. O módulo passa a guardar cada proposta com todas as
-- versões (texto nunca é sobrescrito), de onde ela veio (caderno, grupo,
-- plenária, fusão de outras), os apontamentos e emendas de cada grupo, a
-- apreciação no grupo quando o regimento prevê, a entrega do relatório do
-- grupo e o resultado de cada votação da plenária (contagem do crachá).
-- Regra de pronto do plano: dizer de onde veio cada proposta aprovada.
--
-- COMO:
--   congresso_grupos.relatorio_entregue_em/_por   entrega trava o grupo
--   congresso_grupo_funcoes     coordenação e relatoria de cada grupo
--   congresso_propostas         a proposta, com número, eixo, grupo de origem,
--                               situação, consenso/debate e destaque
--   congresso_proposta_versoes  cada texto (só inserção)
--   congresso_proposta_origens  de quais propostas uma fusão nasceu
--   congresso_apontamentos      anotação ou emenda do grupo (só inserção;
--                               retirar marca retirado_em)
--   congresso_apreciacoes       votação no grupo, quando há
--   congresso_votacoes (+ _itens) resultado da plenária, de uma proposta ou
--                               de um bloco
--   permissoes.congressos_relatoria  consolidação e mesa da plenária
-- Idempotente.

alter table public.congresso_grupos
  add column if not exists relatorio_entregue_em timestamptz,
  add column if not exists relatorio_entregue_por text;

create table if not exists public.congresso_grupo_funcoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  grupo_id uuid not null references public.congresso_grupos(id) on delete cascade,
  participante_id uuid not null references public.congresso_participantes(id) on delete cascade,
  funcao text not null check (funcao in ('coordenacao', 'relatoria', 'relatoria_adjunta')),
  escolha text not null default 'eleita' check (escolha in ('eleita', 'indicada')),
  created_at timestamptz not null default now()
);
create unique index if not exists congresso_grupo_funcoes_um
  on public.congresso_grupo_funcoes (grupo_id, participante_id, funcao);

create table if not exists public.congresso_propostas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  numero integer not null check (numero > 0),
  eixo_id uuid references public.congresso_eixos(id) on delete set null,
  grupo_id uuid references public.congresso_grupos(id) on delete set null,
  origem text not null default 'grupo'
    check (origem in ('caderno', 'etapa_anterior', 'documento', 'grupo', 'plenaria', 'fusao')),
  origem_descricao text,
  abrangencia text,
  texto text not null check (length(trim(texto)) > 0),
  versao integer not null default 1 check (versao > 0),
  situacao text not null default 'em_debate'
    check (situacao in ('em_debate', 'entregue', 'fundida', 'plenaria', 'aprovada', 'rejeitada', 'retirada', 'anais')),
  classificacao text check (classificacao is null or classificacao in ('consenso', 'debate')),
  fundida_em uuid references public.congresso_propostas(id) on delete set null,
  ordem integer not null default 0,
  destaque_por text,
  destaque_em timestamptz,
  criada_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists congresso_propostas_numero on public.congresso_propostas (congresso_id, numero);
create index if not exists congresso_propostas_eixo on public.congresso_propostas (congresso_id, eixo_id, situacao);
create index if not exists congresso_propostas_grupo on public.congresso_propostas (grupo_id);

create table if not exists public.congresso_proposta_versoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  proposta_id uuid not null references public.congresso_propostas(id) on delete cascade,
  versao integer not null check (versao > 0),
  texto text not null,
  motivo text not null default 'criada'
    check (motivo in ('criada', 'grupo', 'consolidacao', 'fusao', 'plenaria', 'correcao')),
  autor text,
  created_at timestamptz not null default now()
);
create unique index if not exists congresso_proposta_versoes_um on public.congresso_proposta_versoes (proposta_id, versao);

create table if not exists public.congresso_proposta_origens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  proposta_id uuid not null references public.congresso_propostas(id) on delete cascade,
  origem_id uuid not null references public.congresso_propostas(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint congresso_proposta_origens_diferentes check (proposta_id <> origem_id)
);
create unique index if not exists congresso_proposta_origens_um on public.congresso_proposta_origens (proposta_id, origem_id);

create table if not exists public.congresso_apontamentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  grupo_id uuid references public.congresso_grupos(id) on delete cascade,
  proposta_id uuid references public.congresso_propostas(id) on delete cascade,
  tipo text not null default 'apontamento'
    check (tipo in ('apontamento', 'acrescimo', 'supressao', 'alteracao', 'dissenso')),
  texto text not null check (length(trim(texto)) > 0),
  autor text,
  retirado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists congresso_apontamentos_grupo on public.congresso_apontamentos (grupo_id, created_at);
create index if not exists congresso_apontamentos_proposta on public.congresso_apontamentos (proposta_id);

create table if not exists public.congresso_apreciacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  grupo_id uuid not null references public.congresso_grupos(id) on delete cascade,
  proposta_id uuid not null references public.congresso_propostas(id) on delete cascade,
  a_favor integer not null default 0 check (a_favor >= 0),
  contra integer not null default 0 check (contra >= 0),
  abstencao integer not null default 0 check (abstencao >= 0),
  resultado text not null check (resultado in ('aprovada_direto', 'plenaria', 'plenaria_com_vencida', 'rejeitada')),
  autor text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists congresso_apreciacoes_um on public.congresso_apreciacoes (grupo_id, proposta_id);

create table if not exists public.congresso_votacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  sessao_id uuid references public.congresso_sessoes(id) on delete set null,
  tipo text not null default 'proposta' check (tipo in ('proposta', 'bloco')),
  forma text not null check (forma in ('sem_oposicao', 'visual', 'contagem', 'urna')),
  a_favor integer check (a_favor is null or a_favor >= 0),
  contra integer check (contra is null or contra >= 0),
  abstencao integer check (abstencao is null or abstencao >= 0),
  maioria text not null,
  base_votantes integer,
  resultado text not null check (resultado in ('aprovada', 'rejeitada', 'empate')),
  observacao text,
  registrado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  desfeita_em timestamptz,
  desfeita_por uuid references public.usuarios(id) on delete set null
);
create index if not exists congresso_votacoes_congresso on public.congresso_votacoes (congresso_id, created_at);

create table if not exists public.congresso_votacao_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  votacao_id uuid not null references public.congresso_votacoes(id) on delete cascade,
  proposta_id uuid not null references public.congresso_propostas(id) on delete cascade
);
create unique index if not exists congresso_votacao_itens_um on public.congresso_votacao_itens (votacao_id, proposta_id);
create index if not exists congresso_votacao_itens_proposta on public.congresso_votacao_itens (proposta_id);

do $$
declare
  t text;
begin
  foreach t in array array['congresso_grupo_funcoes', 'congresso_propostas', 'congresso_proposta_versoes',
                           'congresso_proposta_origens', 'congresso_apontamentos', 'congresso_apreciacoes',
                           'congresso_votacoes', 'congresso_votacao_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I to authenticated
         using (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)
         with check (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop trigger if exists auditoria_registrar on public.%I', t);
    execute format('create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- Texto nunca é sobrescrito: versões e origens só recebem inserção.
grant select, insert on table public.congresso_proposta_versoes, public.congresso_proposta_origens to authenticated;
grant select, insert, update, delete on table public.congresso_grupo_funcoes, public.congresso_apreciacoes, public.congresso_votacao_itens to authenticated;
grant select, insert, update on table public.congresso_propostas, public.congresso_apontamentos, public.congresso_votacoes to authenticated;

-- Comissão de relatoria e mesa da plenária, sem precisar configurar o congresso.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'permissoes' and column_name = 'congressos_relatoria'
  ) then
    alter table public.permissoes add column congressos_relatoria boolean default false;
    update public.permissoes set congressos_relatoria = true where congressos_gestao = true;
  end if;
end $$;
comment on column public.permissoes.congressos_relatoria is 'Congressos e conferências: relatoria dos grupos, consolidação das propostas e mesa da plenária. [lgpd:nenhum]';

comment on column public.congresso_grupos.relatorio_entregue_em is 'Quando o relatório do grupo foi entregue; depois disso o grupo não altera mais propostas nem apontamentos. [lgpd:nenhum]';
comment on column public.congresso_grupos.relatorio_entregue_por is 'Nome de quem entregou o relatório (relator pelo link pessoal ou usuário do painel). [lgpd:identificacao]';

comment on table public.congresso_grupo_funcoes is 'Coordenação e relatoria de cada grupo de trabalho, eleitas no grupo ou indicadas pela comissão. [lgpd:sensivel_sindical|titulares:participantes de congressos]';

comment on table public.congresso_propostas is 'Propostas do congresso: caderno de teses, etapas anteriores, novas no grupo ou em plenária, e as nascidas de fusão. O texto atual é a última versão; a autoria é do grupo ou da origem, não de pessoa. [lgpd:nenhum]';
comment on column public.congresso_propostas.texto is 'Texto da versão atual (cópia da última linha de congresso_proposta_versoes). [lgpd:nenhum]';
comment on column public.congresso_propostas.destaque_por is 'Quem pediu destaque na plenária, quando o regimento manda registrar o nome. [lgpd:identificacao]';
comment on column public.congresso_propostas.criada_por is 'Quem registrou a proposta no sistema (relator ou usuário do painel). [lgpd:identificacao]';

comment on table public.congresso_proposta_versoes is 'Cada versão do texto de uma proposta, com o motivo (grupo, consolidação, fusão, plenária). Só inserção: texto nunca é sobrescrito. [lgpd:identificacao|titulares:relatores de congressos]';
comment on column public.congresso_proposta_versoes.autor is 'Nome de quem registrou a versão. [lgpd:identificacao]';

comment on table public.congresso_proposta_origens is 'De quais propostas uma proposta fundida nasceu, para rastrear qualquer resolução até o apontamento inicial. [lgpd:nenhum]';

comment on table public.congresso_apontamentos is 'Anotações e emendas (acréscimo, supressão, alteração) e dissensos registrados pela relatoria de cada grupo. Só inserção; retirar marca retirado_em. [lgpd:identificacao|titulares:relatores de congressos]';
comment on column public.congresso_apontamentos.autor is 'Nome de quem registrou o apontamento (relator), não de quem falou no grupo. [lgpd:identificacao]';

comment on table public.congresso_apreciacoes is 'Votação de uma proposta no grupo (a favor, contra, abstenção) e a classificação pela regra do regimento. [lgpd:identificacao|titulares:relatores de congressos]';
comment on column public.congresso_apreciacoes.autor is 'Nome de quem registrou a contagem. [lgpd:identificacao]';

comment on table public.congresso_votacoes is 'Resultado de cada votação da plenária (de uma proposta ou de um bloco): forma, contagem do crachá, maioria aplicada e resultado. Votos individuais não são guardados. [lgpd:identificacao|titulares:usuários que registram a votação]';
comment on column public.congresso_votacoes.registrado_por is 'Quem lançou o resultado. [lgpd:identificacao]';
comment on column public.congresso_votacoes.desfeita_por is 'Quem desfez o lançamento. [lgpd:identificacao]';

comment on table public.congresso_votacao_itens is 'Propostas de cada votação da plenária (uma, ou várias numa votação em bloco). [lgpd:nenhum]';
