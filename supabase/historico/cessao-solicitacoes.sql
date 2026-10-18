-- Confluir — Cessão de espaços, FASE 2 (2026-09-24)
--
-- O pedido: o link público onde o solicitante registra a necessidade, e as
-- exigências de segurança que as respostas dele disparam. A esteira (visita,
-- autorização, custeio) e o termo assinado vêm nas fases 3 e 4.
--
-- ── POR QUE AS EXIGÊNCIAS SÃO CONGELADAS ────────────────────────────────────
-- `cessao_espaco_exigencias` é a REGRA, que a entidade muda quando quiser.
-- `cessao_solicitacao_exigencias` é o que valeu NAQUELE pedido. Sem a cópia, a
-- entidade ajustaria a regra em novembro e o termo assinado em setembro
-- passaria a dizer outra coisa — num documento que fala de segurança de
-- pessoas, isso não pode acontecer.
--
-- ── OS GATILHOS ─────────────────────────────────────────────────────────────
-- A quantidade de bombeiros civis e seguranças sai de duas fontes que SOMAM:
--   • a faixa de público (gatilho 'publico', com `de`/`ate` pessoas);
--   • as condições do evento — público infantil, idoso ou com mobilidade
--     reduzida, bebida alcoólica e evento de possível estresse emocional
--     (assembleias, debates), cada uma com seu acréscimo.
-- O pedido guarda a resposta de cada gatilho E o resultado, com a conta à
-- vista: é isso que o solicitante vê antes de enviar.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Requer supabase/cessao-espacos.sql (fase 1). Executar UMA VEZ.

-- ── 1. As regras de segurança do espaço ──────────────────────────────────────

create table if not exists cessao_espaco_exigencias (id uuid primary key default gen_random_uuid());
alter table cessao_espaco_exigencias add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_espaco_exigencias add column if not exists espaco_id uuid references cessao_espacos(id) on delete cascade;
alter table cessao_espaco_exigencias add column if not exists gatilho text not null default 'publico';
-- Faixa de público (só para o gatilho 'publico'). `ate` nulo = sem teto.
alter table cessao_espaco_exigencias add column if not exists de integer;
alter table cessao_espaco_exigencias add column if not exists ate integer;
alter table cessao_espaco_exigencias add column if not exists bombeiros integer not null default 0;
alter table cessao_espaco_exigencias add column if not exists segurancas integer not null default 0;
-- Exigência que não é gente: rampa, acompanhante, ambulância, alvará.
alter table cessao_espaco_exigencias add column if not exists observacao text;
alter table cessao_espaco_exigencias add column if not exists created_at timestamptz not null default now();
alter table cessao_espaco_exigencias add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_exig_gatilho') then
    alter table cessao_espaco_exigencias add constraint ck_cessao_exig_gatilho
      check (gatilho in ('publico', 'infantil', 'idoso', 'mobilidade', 'bebida', 'estresse')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_exig_faixa') then
    alter table cessao_espaco_exigencias add constraint ck_cessao_exig_faixa
      check (gatilho <> 'publico' or (de is not null and (ate is null or ate >= de))) not valid;
  end if;
end $$;

create index if not exists idx_cessao_exig_espaco
  on cessao_espaco_exigencias (espaco_id, gatilho, de);

comment on table cessao_espaco_exigencias is
  'Regras de bombeiro civil e segurança do espaço, por faixa de público e por condição do evento. Somam entre si.';

alter table cessao_espaco_exigencias enable row level security;
drop policy if exists tenant_isolation on cessao_espaco_exigencias;
create policy tenant_isolation on cessao_espaco_exigencias for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_espaco_exigencias to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_espaco_exigencias;
create trigger set_emp_from_jwt before insert on cessao_espaco_exigencias
  for each row execute function public.set_emp_from_jwt();

-- ── 2. A solicitação ─────────────────────────────────────────────────────────

create table if not exists cessao_solicitacoes (id uuid primary key default gen_random_uuid());
alter table cessao_solicitacoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_solicitacoes add column if not exists espaco_id uuid references cessao_espacos(id);
-- Número sequencial por tenant, para a equipe conversar sobre o pedido.
alter table cessao_solicitacoes add column if not exists numero integer;

-- Quem pede
alter table cessao_solicitacoes add column if not exists solicitante_nome text;
alter table cessao_solicitacoes add column if not exists solicitante_cpf text;
alter table cessao_solicitacoes add column if not exists solicitante_email text;
alter table cessao_solicitacoes add column if not exists solicitante_telefone text;
-- Entidade/empresa que o solicitante representa, quando houver.
alter table cessao_solicitacoes add column if not exists entidade text;
-- Pessoa que responde pelo solicitante no dia (vai para o termo).
alter table cessao_solicitacoes add column if not exists representante_nome text;
alter table cessao_solicitacoes add column if not exists representante_telefone text;
-- Como a identidade foi estabelecida: 'email' (código), 'filiado' (CPF na
-- base) ou 'interno' (sessão do painel).
alter table cessao_solicitacoes add column if not exists identificacao text;
alter table cessao_solicitacoes add column if not exists filiacao_id uuid references filiacoes(id);
alter table cessao_solicitacoes add column if not exists usuario_id uuid references usuarios(id);

-- Quando
alter table cessao_solicitacoes add column if not exists inicio timestamptz;
alter table cessao_solicitacoes add column if not exists termino timestamptz;
-- Montagem e desmontagem: o espaço fica ocupado antes e depois do evento.
alter table cessao_solicitacoes add column if not exists montagem_inicio timestamptz;
alter table cessao_solicitacoes add column if not exists desmontagem_termino timestamptz;

-- O que
alter table cessao_solicitacoes add column if not exists finalidade text;
alter table cessao_solicitacoes add column if not exists publico_estimado integer;
-- Respostas dos gatilhos, na ordem em que a tela pergunta.
alter table cessao_solicitacoes add column if not exists tem_infantil boolean not null default false;
alter table cessao_solicitacoes add column if not exists tem_idoso boolean not null default false;
alter table cessao_solicitacoes add column if not exists tem_mobilidade boolean not null default false;
alter table cessao_solicitacoes add column if not exists tem_bebida boolean not null default false;
alter table cessao_solicitacoes add column if not exists tem_estresse boolean not null default false;
alter table cessao_solicitacoes add column if not exists observacoes text;

-- Situação (a esteira completa entra na fase 3)
alter table cessao_solicitacoes add column if not exists situacao text not null default 'rascunho';
alter table cessao_solicitacoes add column if not exists recusa_motivo text;
alter table cessao_solicitacoes add column if not exists enviada_em timestamptz;

-- Confirmação do e-mail: código de 6 dígitos guardado como HASH salgado pelo
-- token (mesma mecânica de eventos-publico.ts).
alter table cessao_solicitacoes add column if not exists token uuid not null default gen_random_uuid();
alter table cessao_solicitacoes add column if not exists codigo_hash text;
alter table cessao_solicitacoes add column if not exists codigo_expira_em timestamptz;
alter table cessao_solicitacoes add column if not exists codigo_tentativas integer not null default 0;
alter table cessao_solicitacoes add column if not exists email_confirmado_em timestamptz;

alter table cessao_solicitacoes add column if not exists created_at timestamptz not null default now();
alter table cessao_solicitacoes add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_solic_situacao') then
    alter table cessao_solicitacoes add constraint ck_cessao_solic_situacao
      check (situacao in ('rascunho', 'solicitada', 'em_analise', 'recusada', 'cancelada', 'confirmada')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_solic_identificacao') then
    alter table cessao_solicitacoes add constraint ck_cessao_solic_identificacao
      check (identificacao is null or identificacao in ('email', 'filiado', 'interno')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_solic_periodo') then
    alter table cessao_solicitacoes add constraint ck_cessao_solic_periodo
      check (termino is null or inicio is null or termino > inicio) not valid;
  end if;
end $$;

create unique index if not exists ux_cessao_solic_token on cessao_solicitacoes (token);
create unique index if not exists ux_cessao_solic_numero
  on cessao_solicitacoes (emp_proprietaria_id, numero);
create index if not exists idx_cessao_solic_espaco
  on cessao_solicitacoes (espaco_id, inicio);
create index if not exists idx_cessao_solic_situacao
  on cessao_solicitacoes (emp_proprietaria_id, situacao, created_at desc);

comment on table cessao_solicitacoes is
  'Pedido de cessão de um espaço, feito pelo link público ou pelo painel. Guarda quem pede, quando, para quê e as respostas que disparam as exigências de segurança.';

alter table cessao_solicitacoes enable row level security;
drop policy if exists tenant_isolation on cessao_solicitacoes;
create policy tenant_isolation on cessao_solicitacoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_solicitacoes to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_solicitacoes;
create trigger set_emp_from_jwt before insert on cessao_solicitacoes
  for each row execute function public.set_emp_from_jwt();

-- ── 3. As exigências daquele pedido (congeladas) ─────────────────────────────

create table if not exists cessao_solicitacao_exigencias (id uuid primary key default gen_random_uuid());
alter table cessao_solicitacao_exigencias add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_solicitacao_exigencias add column if not exists solicitacao_id uuid references cessao_solicitacoes(id) on delete cascade;
alter table cessao_solicitacao_exigencias add column if not exists gatilho text;
-- O texto que explica de onde veio ("Público de 101 a 200 pessoas").
alter table cessao_solicitacao_exigencias add column if not exists motivo text;
alter table cessao_solicitacao_exigencias add column if not exists bombeiros integer not null default 0;
alter table cessao_solicitacao_exigencias add column if not exists segurancas integer not null default 0;
alter table cessao_solicitacao_exigencias add column if not exists observacao text;
alter table cessao_solicitacao_exigencias add column if not exists created_at timestamptz not null default now();

create index if not exists idx_cessao_solic_exig
  on cessao_solicitacao_exigencias (solicitacao_id);

comment on table cessao_solicitacao_exigencias is
  'Cópia das exigências que valeram no momento do pedido. A regra do espaço pode mudar depois; o que foi acordado, não.';

alter table cessao_solicitacao_exigencias enable row level security;
drop policy if exists tenant_isolation on cessao_solicitacao_exigencias;
create policy tenant_isolation on cessao_solicitacao_exigencias for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_solicitacao_exigencias to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_solicitacao_exigencias;
create trigger set_emp_from_jwt before insert on cessao_solicitacao_exigencias
  for each row execute function public.set_emp_from_jwt();

notify pgrst, 'reload schema';
