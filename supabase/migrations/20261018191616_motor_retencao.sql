-- Confluir — Motor de retenção (seção 4 de docs/lgpd/retencao.md)
--
-- POR QUÊ:
--   A Onda B4 fixou 35 prazos de retenção (RT01–RT35), mas só a votação
--   (RT10, RT11) descartava sozinha. Uma rotina por tabela não escala: cada
--   uma teria seu próprio prazo, sua tela e nenhum registro do que apagou.
--   O plano da seção 4 pede um motor único: regras por entidade, prazo
--   ajustável acima de um mínimo travado, cron mensal, simulação antes de
--   apagar, livro de execuções e bloqueio por litígio.
--
-- COMO:
--   1. lgpd_regras_retencao: uma linha por entidade e código RT. Guarda a
--      tabela e a coluna-âncora (documentação; o que cada código faz está em
--      src/lib/lgpd/retencao-regras.ts), o prazo padrão, o mínimo legal, o
--      prazo escolhido pela entidade (nulo = padrão) e a ação. `ativa` é o
--      interruptor da EXECUÇÃO REAL: desligada (padrão), o cron só simula.
--      O CHECK impede prazo abaixo do mínimo.
--   2. lgpd_retencao_execucoes: livro de cada rodada (simulação ou real):
--      regra, prazo usado, data de corte, linhas afetadas, arquivos
--      removidos, registros poupados por bloqueio, quem disparou. Só números
--      e nomes de tabela: nenhum dado do titular entra no livro.
--   3. lgpd_bloqueios_litigio: "em processo" (legal hold). Um CPF, um
--      e-mail ou um registro (tabela + id) bloqueado fica fora de qualquer
--      regra até alguém encerrar o bloqueio.
--   4. As três primeiras regras (RT30, RT31, RT02) entram desligadas para
--      todas as entidades de `tenants`; entidade nova recebe as linhas pelo
--      próprio motor (upsert ao simular).
--   RLS tenant_isolation nas três tabelas. A entidade lê e grava regras e
--   bloqueios pelo painel; o livro é só leitura e inserção (ninguém edita
--   nem apaga uma execução pela API).

-- ── 1. Regras ───────────────────────────────────────────────────────────────

create table if not exists public.lgpd_regras_retencao (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  codigo text not null,
  tabela text not null,
  coluna_ancora text not null,
  prazo_padrao_dias integer not null,
  prazo_minimo_dias integer not null default 0,
  prazo_dias integer,
  acao text not null default 'eliminar',
  ativa boolean not null default false,
  ativada_em timestamptz,
  ativada_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint lgpd_regras_retencao_codigo_check check (codigo ~ '^RT[0-9]{2}$'),
  constraint lgpd_regras_retencao_acao_check check (acao in ('eliminar', 'anonimizar')),
  constraint lgpd_regras_retencao_minimo_check check (prazo_minimo_dias >= 0 and prazo_padrao_dias >= prazo_minimo_dias),
  constraint lgpd_regras_retencao_prazo_check check (prazo_dias is null or prazo_dias >= prazo_minimo_dias),
  constraint lgpd_regras_retencao_unica unique (emp_proprietaria_id, codigo)
);

alter table public.lgpd_regras_retencao enable row level security;
drop policy if exists tenant_isolation on public.lgpd_regras_retencao;
create policy tenant_isolation on public.lgpd_regras_retencao
  to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

revoke all on table public.lgpd_regras_retencao from public, anon, authenticated;
grant select, insert, update on table public.lgpd_regras_retencao to authenticated;
grant all on table public.lgpd_regras_retencao to service_role;

comment on table public.lgpd_regras_retencao is 'Regras do motor de retenção (seção 4 de docs/lgpd/retencao.md): uma linha por entidade e código RT, com prazo padrão, mínimo legal, prazo escolhido e ação. Desligada (ativa = false), o cron mensal só SIMULA; ligada, elimina ou anonimiza de fato. O comportamento de cada código está em src/lib/lgpd/retencao-motor.ts. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.lgpd_regras_retencao.codigo is 'Código da tabela de prazos de retencao.md (RT01–RT35).';
comment on column public.lgpd_regras_retencao.tabela is 'Tabela principal que a regra varre (documentação; a regra pode tocar tabelas filhas e o Storage).';
comment on column public.lgpd_regras_retencao.coluna_ancora is 'Coluna com a data a partir da qual o prazo corre.';
comment on column public.lgpd_regras_retencao.prazo_padrao_dias is 'Prazo proposto em retencao.md, em dias.';
comment on column public.lgpd_regras_retencao.prazo_minimo_dias is 'Mínimo legal travado: a entidade não pode escolher prazo menor.';
comment on column public.lgpd_regras_retencao.prazo_dias is 'Prazo escolhido pela entidade, em dias; nulo = padrão. A RT30 ignora este campo e usa eventos_config.retencao_foto_dias.';
comment on column public.lgpd_regras_retencao.acao is 'eliminar ou anonimizar.';
comment on column public.lgpd_regras_retencao.ativa is 'Execução real ligada pela entidade. Desligada, o cron só simula e registra no livro o que sairia.';
comment on column public.lgpd_regras_retencao.ativada_em is 'Quando a execução real foi ligada pela última vez.';
comment on column public.lgpd_regras_retencao.ativada_por is 'Usuário que ligou a execução real. [lgpd:identificacao]';

-- ── 2. Livro de execuções ───────────────────────────────────────────────────

create table if not exists public.lgpd_retencao_execucoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  regra_id uuid references public.lgpd_regras_retencao(id) on delete set null,
  codigo text not null,
  modo text not null,
  origem text not null default 'cron',
  prazo_dias integer not null,
  corte timestamptz not null,
  linhas_afetadas integer not null default 0,
  arquivos_removidos integer not null default 0,
  bloqueadas integer not null default 0,
  detalhe jsonb not null default '{}'::jsonb,
  erro text,
  usuario_id uuid references public.usuarios(id) on delete set null,
  iniciada_em timestamptz not null default now(),
  concluida_em timestamptz,
  constraint lgpd_retencao_execucoes_modo_check check (modo in ('simulacao', 'real')),
  constraint lgpd_retencao_execucoes_origem_check check (origem in ('cron', 'painel'))
);

create index if not exists idx_lgpd_retencao_execucoes_regra
  on public.lgpd_retencao_execucoes (emp_proprietaria_id, codigo, iniciada_em desc);

alter table public.lgpd_retencao_execucoes enable row level security;
drop policy if exists tenant_isolation on public.lgpd_retencao_execucoes;
create policy tenant_isolation on public.lgpd_retencao_execucoes
  to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

revoke all on table public.lgpd_retencao_execucoes from public, anon, authenticated;
grant select, insert on table public.lgpd_retencao_execucoes to authenticated;
grant all on table public.lgpd_retencao_execucoes to service_role;

comment on table public.lgpd_retencao_execucoes is 'Livro do motor de retenção: uma linha por regra executada (simulação ou real), com prazo, data de corte, linhas afetadas, arquivos removidos do Storage e registros poupados por bloqueio de litígio. Só contagens e nomes de tabela, nenhum dado do titular. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.lgpd_retencao_execucoes.codigo is 'Código RT da regra (cópia, para o livro sobreviver à regra).';
comment on column public.lgpd_retencao_execucoes.modo is 'simulacao (lista o que sairia, sem apagar) ou real.';
comment on column public.lgpd_retencao_execucoes.origem is 'cron (rodada mensal) ou painel (simulação pedida na tela).';
comment on column public.lgpd_retencao_execucoes.prazo_dias is 'Prazo efetivo usado na rodada.';
comment on column public.lgpd_retencao_execucoes.corte is 'Data de corte: registros com a âncora anterior a ela entram na regra.';
comment on column public.lgpd_retencao_execucoes.linhas_afetadas is 'Registros eliminados ou anonimizados (na simulação: os que seriam).';
comment on column public.lgpd_retencao_execucoes.arquivos_removidos is 'Arquivos apagados do Storage (na simulação: os que seriam).';
comment on column public.lgpd_retencao_execucoes.bloqueadas is 'Registros que cairiam na regra, mas foram poupados por bloqueio de litígio.';
comment on column public.lgpd_retencao_execucoes.detalhe is 'Contagem por tabela e observações (limite atingido, falhas de Storage). Sem dado pessoal.';
comment on column public.lgpd_retencao_execucoes.erro is 'Mensagem de erro, quando a rodada falhou.';
comment on column public.lgpd_retencao_execucoes.usuario_id is 'Quem pediu a simulação no painel; nulo no cron. [lgpd:identificacao]';
comment on column public.lgpd_retencao_execucoes.iniciada_em is 'Início da rodada.';
comment on column public.lgpd_retencao_execucoes.concluida_em is 'Fim da rodada; nulo se ela não terminou.';

-- ── 3. Bloqueio por litígio ─────────────────────────────────────────────────

create table if not exists public.lgpd_bloqueios_litigio (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  cpf text,
  email text,
  tabela text,
  registro_id uuid,
  motivo text not null,
  processo text,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  encerrado_em timestamptz,
  encerrado_por uuid references public.usuarios(id) on delete set null,
  constraint lgpd_bloqueios_litigio_alvo_check check (
    cpf is not null or email is not null or (tabela is not null and registro_id is not null)
  ),
  constraint lgpd_bloqueios_litigio_cpf_check check (cpf is null or cpf ~ '^[0-9]{11}$'),
  constraint lgpd_bloqueios_litigio_email_check check (email is null or email = lower(email))
);

create index if not exists idx_lgpd_bloqueios_litigio_vigentes
  on public.lgpd_bloqueios_litigio (emp_proprietaria_id)
  where encerrado_em is null;

alter table public.lgpd_bloqueios_litigio enable row level security;
drop policy if exists tenant_isolation on public.lgpd_bloqueios_litigio;
create policy tenant_isolation on public.lgpd_bloqueios_litigio
  to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

revoke all on table public.lgpd_bloqueios_litigio from public, anon, authenticated;
grant select, insert, update on table public.lgpd_bloqueios_litigio to authenticated;
grant all on table public.lgpd_bloqueios_litigio to service_role;

comment on table public.lgpd_bloqueios_litigio is 'Bloqueio por litígio (legal hold, item 4 da seção 4 de retencao.md): enquanto vigente, a pessoa (CPF ou e-mail) ou o registro (tabela + id) fica fora de todas as regras do motor de retenção. Encerrar é carimbar encerrado_em; a linha fica como histórico. [lgpd:identificacao|titulares:filiados, interessados, inscritos e demais pessoas envolvidas em processo]';
comment on column public.lgpd_bloqueios_litigio.cpf is 'CPF bloqueado, só dígitos. [lgpd:identificacao]';
comment on column public.lgpd_bloqueios_litigio.email is 'E-mail bloqueado, em minúsculas. [lgpd:identificacao]';
comment on column public.lgpd_bloqueios_litigio.tabela is 'Tabela do registro bloqueado (com registro_id).';
comment on column public.lgpd_bloqueios_litigio.registro_id is 'Id do registro bloqueado na tabela indicada.';
comment on column public.lgpd_bloqueios_litigio.motivo is 'Por que o descarte está suspenso. Pode citar a pessoa ou o caso. [lgpd:identificacao]';
comment on column public.lgpd_bloqueios_litigio.processo is 'Número do processo ou procedimento, quando houver. [lgpd:identificacao]';
comment on column public.lgpd_bloqueios_litigio.criado_por is 'Quem criou o bloqueio. [lgpd:identificacao]';
comment on column public.lgpd_bloqueios_litigio.encerrado_em is 'Fim do bloqueio; nulo = vigente.';
comment on column public.lgpd_bloqueios_litigio.encerrado_por is 'Quem encerrou o bloqueio. [lgpd:identificacao]';

-- ── 4. Primeiras regras, desligadas ─────────────────────────────────────────

insert into public.lgpd_regras_retencao
  (emp_proprietaria_id, codigo, tabela, coluna_ancora, prazo_padrao_dias, prazo_minimo_dias, acao)
select t.empresa_id, r.codigo, r.tabela, r.coluna, r.padrao, r.minimo, 'eliminar'
  from public.tenants t
 cross join (values
   ('RT30', 'eventos_inscricoes', 'foto_capturada_em', 30, 1),
   ('RT31', 'login_tentativas', 'ultima_falha_em', 183, 183),
   ('RT02', 'filiacao_solicitacoes', 'updated_at', 365, 90)
 ) as r(codigo, tabela, coluna, padrao, minimo)
 where t.empresa_id is not null
on conflict (emp_proprietaria_id, codigo) do nothing;
