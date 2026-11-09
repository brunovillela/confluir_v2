-- Confluir — Congressos e conferências: base (Fase 1)
--
-- POR QUÊ: congressos, plenárias e conferências têm regimento próprio, e as
-- regras mudam de uma edição para outra (quem vota, como se formam as
-- delegações, limites por base, prazos). O módulo guarda cada evento com a sua
-- configuração versionada, em vez de embutir as regras no código. Plano em
-- docs/plano-congressos.md e catálogo em docs/plano-congressos-configuracao.md.
--
-- COMO:
--   congressos                    o congresso, ligado a um evento do módulo
--                                 Eventos, com a configuração vigente (jsonb)
--   congresso_config_versoes      cada versão da configuração (só inserção)
--   congresso_papeis              papéis do congresso e a matriz de direitos
--   congresso_unidades            bases, entidades, segmentos ou ramos, com
--                                 limite de delegados
--   congresso_eixos, _grupos,     programa: eixos temáticos, grupos de
--   _sessoes                      trabalho e sessões
--   congresso_participantes       pessoas do congresso (filiadas ou não)
--   congresso_participante_historico  trilha de cada pessoa (só inserção)
--
-- Tudo com RLS por tenant (tenant_isolation), set_emp_from_jwt e auditoria.
-- Idempotente.

create table if not exists public.congressos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  evento_id uuid references public.eventos(id) on delete set null,
  nome text not null check (length(trim(nome)) > 0),
  edicao integer check (edicao is null or edicao > 0),
  tema text,
  modo text not null default 'promove' check (modo in ('promove', 'participa')),
  situacao text not null default 'preparacao'
    check (situacao in ('preparacao', 'inscricoes', 'em_andamento', 'encerrado', 'cancelado')),
  etapa_anterior_id uuid references public.congressos(id) on delete set null,
  etapa_seguinte_id uuid references public.congressos(id) on delete set null,
  etapa_seguinte_nome text,
  config jsonb not null default '{}'::jsonb,
  config_versao integer not null default 1,
  regimento_aprovado_em timestamptz,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create index if not exists congressos_emp on public.congressos (emp_proprietaria_id, created_at desc);
create index if not exists congressos_evento on public.congressos (evento_id);

create table if not exists public.congresso_config_versoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  versao integer not null check (versao > 0),
  config jsonb not null,
  motivo text,
  deliberacao text,
  autor_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists congresso_config_versoes_um
  on public.congresso_config_versoes (congresso_id, versao);

create table if not exists public.congresso_papeis (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  categoria text not null default 'outro'
    check (categoria in ('delegado', 'suplente', 'nato', 'observador', 'convidado', 'expositor',
                         'assessor', 'imprensa', 'equipe', 'comissao', 'outro')),
  cor text,
  ordem integer not null default 0,
  direitos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists congresso_papeis_nome
  on public.congresso_papeis (congresso_id, lower(trim(nome)));

create table if not exists public.congresso_unidades (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  tipo text not null default 'base'
    check (tipo in ('base', 'entidade', 'segmento', 'ramo', 'delegacao')),
  nome text not null check (length(trim(nome)) > 0),
  limite_delegados integer check (limite_delegados is null or limite_delegados >= 0),
  socios integer check (socios is null or socios >= 0),
  observacao text,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists congresso_unidades_nome
  on public.congresso_unidades (congresso_id, tipo, lower(trim(nome)));

create table if not exists public.congresso_eixos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  descricao text,
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.congresso_grupos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  eixo_id uuid references public.congresso_eixos(id) on delete set null,
  nome text not null check (length(trim(nome)) > 0),
  sala text,
  vagas integer check (vagas is null or vagas > 0),
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create table if not exists public.congresso_sessoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  tipo text not null default 'plenaria'
    check (tipo in ('credenciamento', 'plenaria', 'mesa_debate', 'grupo', 'setorial',
                    'atividade_conjunta', 'cultural', 'eleicao', 'outra')),
  titulo text not null check (length(trim(titulo)) > 0),
  inicio timestamptz,
  fim timestamptz,
  grupo_id uuid references public.congresso_grupos(id) on delete set null,
  eixo_id uuid references public.congresso_eixos(id) on delete set null,
  local text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint congresso_sessoes_horario check (fim is null or inicio is null or fim >= inicio)
);
create index if not exists congresso_sessoes_congresso on public.congresso_sessoes (congresso_id, inicio);

create table if not exists public.congresso_participantes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  nome text not null check (length(trim(nome)) > 0),
  nome_social text,
  cpf text check (cpf is null or cpf ~ '^[0-9]{11}$'),
  email text,
  telefone text,
  genero text,
  filiacao_id uuid references public.filiacoes(id) on delete set null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  papel_id uuid references public.congresso_papeis(id) on delete set null,
  unidade_id uuid references public.congresso_unidades(id) on delete set null,
  grupo_id uuid references public.congresso_grupos(id) on delete set null,
  titular_id uuid references public.congresso_participantes(id) on delete set null,
  situacao text not null default 'inscrito'
    check (situacao in ('inscrito', 'confirmado', 'lista_espera', 'recusado', 'cancelado')),
  origem text not null default 'manual'
    check (origem in ('manual', 'nato', 'inscricao', 'planilha', 'indicacao', 'ata', 'copia')),
  inscrito_em timestamptz not null default now(),
  acessibilidade text,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists congresso_participantes_cpf
  on public.congresso_participantes (congresso_id, cpf) where cpf is not null;
create unique index if not exists congresso_participantes_filiacao
  on public.congresso_participantes (congresso_id, filiacao_id) where filiacao_id is not null;
create index if not exists congresso_participantes_ordem
  on public.congresso_participantes (congresso_id, unidade_id, inscrito_em);

create table if not exists public.congresso_participante_historico (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  participante_id uuid references public.congresso_participantes(id) on delete set null,
  acao text not null,
  detalhe jsonb not null default '{}'::jsonb,
  autor_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists congresso_participante_historico_pessoa
  on public.congresso_participante_historico (participante_id, created_at);

do $$
declare
  t text;
begin
  foreach t in array array[
    'congressos', 'congresso_config_versoes', 'congresso_papeis', 'congresso_unidades',
    'congresso_eixos', 'congresso_grupos', 'congresso_sessoes', 'congresso_participantes',
    'congresso_participante_historico'
  ] loop
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
  end loop;
end $$;

-- Tabelas editáveis.
grant select, insert, update, delete on table
  public.congressos, public.congresso_papeis, public.congresso_unidades, public.congresso_eixos,
  public.congresso_grupos, public.congresso_sessoes, public.congresso_participantes
  to authenticated;
-- Trilhas: só inserção e leitura.
revoke update, delete on table public.congresso_config_versoes, public.congresso_participante_historico from authenticated;
grant select, insert on table public.congresso_config_versoes, public.congresso_participante_historico to authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['congressos', 'congresso_papeis', 'congresso_unidades', 'congresso_participantes'] loop
    execute format('drop trigger if exists auditoria_registrar on public.%I', t);
    execute format('create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- Permissões. Quem já cuida de Votações (assembleias) recebe as duas, para o
-- módulo não nascer invisível; a entidade ajusta depois em Permissões.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'permissoes' and column_name = 'congressos'
  ) then
    alter table public.permissoes
      add column congressos boolean default false,
      add column congressos_gestao boolean default false;
    update public.permissoes set congressos = true, congressos_gestao = true where assembleias = true;
  end if;
end $$;
comment on column public.permissoes.congressos is 'Congressos e conferências: consultar congressos, configuração e participantes. [lgpd:nenhum]';
comment on column public.permissoes.congressos_gestao is 'Congressos e conferências: criar, configurar e gerir participantes, delegações e programa. [lgpd:nenhum]';

comment on table public.congressos is 'Congressos, plenárias e conferências que a entidade promove ou de que participa. Cada um aponta para um evento do módulo Eventos e guarda a configuração vigente das regras (regimento como dado). [lgpd:nenhum]';
comment on column public.congressos.modo is 'promove: a entidade organiza; participa: a entidade só envia delegação a um evento externo. [lgpd:nenhum]';
comment on column public.congressos.situacao is 'preparacao, inscricoes, em_andamento, encerrado ou cancelado. [lgpd:nenhum]';
comment on column public.congressos.config is 'Configuração vigente (catálogo em docs/plano-congressos-configuracao.md), normalizada por src/lib/congressos/config.ts. Cópia da última linha de congresso_config_versoes. [lgpd:nenhum]';
comment on column public.congressos.config_versao is 'Número da versão vigente da configuração. [lgpd:nenhum]';
comment on column public.congressos.regimento_aprovado_em is 'Quando o regimento foi aprovado; depois disso, mudar a configuração exige registrar a deliberação. [lgpd:nenhum]';
comment on column public.congressos.etapa_seguinte_nome is 'Nome da etapa seguinte quando ela não está no Confluir (ex.: Plenafup 2027). [lgpd:nenhum]';

comment on table public.congresso_config_versoes is 'Histórico da configuração de cada congresso (só inserção): quem mudou, por quê e, depois da aprovação do regimento, a deliberação que autorizou. [lgpd:nenhum]';
comment on column public.congresso_config_versoes.autor_id is 'Quem gravou a versão. [lgpd:identificacao]';

comment on table public.congresso_papeis is 'Papéis do congresso (delegado, nato, suplente, observador, convidado…) com a matriz de direitos em jsonb (voz, voto, assinar moção, candidatar-se, quórum…). [lgpd:nenhum]';
comment on table public.congresso_unidades is 'Bases, entidades, segmentos ou ramos que formam as delegações, com limite de delegados e número de sócios para o cálculo de vagas. [lgpd:nenhum]';
comment on table public.congresso_eixos is 'Eixos temáticos do congresso. [lgpd:nenhum]';
comment on table public.congresso_grupos is 'Grupos de trabalho (GT) do congresso, com eixo e vagas. [lgpd:nenhum]';
comment on table public.congresso_sessoes is 'Sessões do programa (plenária, mesa, grupo, setorial, atividade conjunta…), com horário. [lgpd:nenhum]';

comment on table public.congresso_participantes is 'Pessoas do congresso: delegados, natos, suplentes, observadores, convidados. Podem ser filiados ou não. A participação revela atuação sindical. [lgpd:identificacao,sensivel_sindical|titulares:delegados, observadores e convidados de congressos]';
comment on column public.congresso_participantes.nome is 'Nome civil. [lgpd:identificacao]';
comment on column public.congresso_participantes.nome_social is 'Nome social, usado no crachá e nas listas quando informado. [lgpd:identificacao]';
comment on column public.congresso_participantes.cpf is 'CPF só com dígitos, para evitar duplicidade e conferir no credenciamento. [lgpd:identificacao]';
comment on column public.congresso_participantes.email is 'E-mail para o link pessoal e avisos do congresso. [lgpd:identificacao]';
comment on column public.congresso_participantes.telefone is 'Telefone de contato. [lgpd:identificacao]';
comment on column public.congresso_participantes.genero is 'Gênero declarado, usado só para conferir cotas e paridade. [lgpd:identificacao]';
comment on column public.congresso_participantes.filiacao_id is 'Filiado correspondente, quando houver. [lgpd:sensivel_sindical]';
comment on column public.congresso_participantes.usuario_id is 'Usuário do Confluir correspondente (ex.: diretor nato). [lgpd:identificacao]';
comment on column public.congresso_participantes.papel_id is 'Papel no congresso (define os direitos). [lgpd:sensivel_sindical]';
comment on column public.congresso_participantes.unidade_id is 'Base, entidade ou segmento que a pessoa representa. [lgpd:sensivel_sindical]';
comment on column public.congresso_participantes.titular_id is 'Para suplentes: o titular a quem a pessoa substitui. [lgpd:nenhum]';
comment on column public.congresso_participantes.situacao is 'inscrito, confirmado, lista_espera, recusado ou cancelado. [lgpd:nenhum]';
comment on column public.congresso_participantes.origem is 'Como entrou: manual, nato, inscricao, planilha, indicacao, ata ou copia. [lgpd:nenhum]';
comment on column public.congresso_participantes.inscrito_em is 'Horário da inscrição; decide a ordem quando o regimento define delegados por ordem de inscrição. [lgpd:nenhum]';
comment on column public.congresso_participantes.acessibilidade is 'Necessidade de acessibilidade informada pela pessoa. Pode revelar deficiência: mostrar só a quem organiza. [lgpd:sensivel_saude]';
comment on column public.congresso_participantes.observacao is 'Observação interna da comissão. [lgpd:identificacao]';

comment on table public.congresso_participante_historico is 'Trilha de cada participante (só inserção): inscrição, troca de papel ou base, lista de espera, cancelamento. [lgpd:sensivel_sindical|titulares:participantes de congressos]';
comment on column public.congresso_participante_historico.detalhe is 'O que mudou (antes e depois). [lgpd:sensivel_sindical]';
comment on column public.congresso_participante_historico.autor_id is 'Quem fez a alteração. [lgpd:identificacao]';
