-- Confluir — Cessão de espaços, FASE 1 (2026-09-24)
--
-- O cadastro do que se cede: o espaço, os ambientes que ele ocupa, os dias e
-- horários em que pode ser cedido e os bloqueios de agenda. A solicitação
-- pública, as exigências de segurança, o custeio e o termo assinado vêm nas
-- fases seguintes — nada aqui depende delas.
--
-- ── O ESPAÇO NÃO É O AMBIENTE ───────────────────────────────────────────────
-- Os ambientes da entidade já estão em `patrimonio_recinto` (auditório, pátio,
-- teatro, área gourmet, cozinha, hall…). O que se cede quase nunca é UM deles:
-- quem pega o teatro leva junto o hall e a sala de projeção. E o mesmo ambiente
-- pode ser oferecido em duas configurações (plateia ou mesas), que são dois
-- espaços cedíveis. Daí a relação MUITOS-PARA-MUITOS em
-- `cessao_espaco_recintos`, e não uma coluna `recinto_id`.
--
-- O ganho concreto disso é o conflito: dois espaços que compartilham um
-- ambiente não podem ser cedidos ao mesmo tempo, e o sistema sabe disso sem
-- que ninguém precise avisar.
--
-- ── A LOTAÇÃO É DO ESPAÇO, NÃO DO AMBIENTE ──────────────────────────────────
-- `capacidade_pessoas` vive aqui, não no recinto: teatro + hall não comporta a
-- soma das partes, e a mesma sala muda de lotação conforme o arranjo (plateia,
-- mesas, de pé). É essa lotação que, na fase 2, dispara a regra de bombeiro
-- civil e segurança.
--
-- ── A SEDE VEM DE `empresa_sede`, NUNCA DO RECINTO ──────────────────────────
-- `patrimonio_recinto.sede` é o enum legado do Bubble (`sedes_enum`, com
-- 'Campos' e 'Macaé'). Herdar dali seria um hardcode de tenant: entidade nova
-- não conseguiria cadastrar espaço nenhum, porque o enum não tem as sedes
-- dela. Por isso `sede_id` aponta para a tabela real.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

-- ── 0. Bucket privado das fotos do espaço ────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('espacos', 'espacos', false)
on conflict (id) do nothing;

-- ── 1. O espaço cedível ──────────────────────────────────────────────────────

create table if not exists cessao_espacos (id uuid primary key default gen_random_uuid());
alter table cessao_espacos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_espacos add column if not exists nome text;
-- Endereço do link público da fase 2 (/espaco/<slug>). Único por tenant.
alter table cessao_espacos add column if not exists slug text;
alter table cessao_espacos add column if not exists descricao text;
alter table cessao_espacos add column if not exists sede_id uuid references empresa_sede(id);
alter table cessao_espacos add column if not exists capacidade_pessoas integer;
alter table cessao_espacos add column if not exists foto_url text;

-- Regras de cessão, decididas no cadastro e usadas pela esteira da fase 3.
alter table cessao_espacos add column if not exists visita_tecnica text not null default 'facultativa';
alter table cessao_espacos add column if not exists exige_termo boolean not null default true;
alter table cessao_espacos add column if not exists exige_autorizacao boolean not null default true;
alter table cessao_espacos add column if not exists publico_alvo text not null default 'qualquer';
-- A agenda aparece no link público? Há espaço cuja ocupação a entidade
-- prefere não expor.
alter table cessao_espacos add column if not exists agenda_publica boolean not null default true;

-- Sugestão de responsável pela visita técnica; a cessão pode trocar.
alter table cessao_espacos add column if not exists responsavel_visita_id uuid references usuarios(id);
alter table cessao_espacos add column if not exists ativo boolean not null default true;
alter table cessao_espacos add column if not exists criado_por_id uuid references usuarios(id);
alter table cessao_espacos add column if not exists created_at timestamptz not null default now();
alter table cessao_espacos add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_espacos_visita') then
    alter table cessao_espacos add constraint ck_cessao_espacos_visita
      check (visita_tecnica in ('obrigatoria', 'facultativa', 'dispensada')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_espacos_publico') then
    alter table cessao_espacos add constraint ck_cessao_espacos_publico
      check (publico_alvo in ('qualquer', 'interno', 'filiados')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_espacos_capacidade') then
    alter table cessao_espacos add constraint ck_cessao_espacos_capacidade
      check (capacidade_pessoas is null or capacidade_pessoas > 0) not valid;
  end if;
end $$;

create unique index if not exists ux_cessao_espacos_slug
  on cessao_espacos (emp_proprietaria_id, slug);
create index if not exists idx_cessao_espacos_sede
  on cessao_espacos (emp_proprietaria_id, sede_id);

comment on table cessao_espacos is
  'Espaço que a entidade pode ceder. Agrupa um ou mais ambientes (patrimonio_recinto) e guarda as regras da cessão: lotação, visita técnica, termo, autorização e quem pode solicitar.';

alter table cessao_espacos enable row level security;
drop policy if exists tenant_isolation on cessao_espacos;
create policy tenant_isolation on cessao_espacos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_espacos to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_espacos;
create trigger set_emp_from_jwt before insert on cessao_espacos
  for each row execute function public.set_emp_from_jwt();

-- ── 2. Ambientes que o espaço ocupa ──────────────────────────────────────────
--
-- `principal` marca o ambiente que dá nome ao conjunto — é dele que sai a
-- sugestão de responsável pela visita técnica quando os ambientes têm
-- responsáveis diferentes.

create table if not exists cessao_espaco_recintos (id uuid primary key default gen_random_uuid());
alter table cessao_espaco_recintos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_espaco_recintos add column if not exists espaco_id uuid references cessao_espacos(id) on delete cascade;
alter table cessao_espaco_recintos add column if not exists recinto_id uuid references patrimonio_recinto(id);
alter table cessao_espaco_recintos add column if not exists principal boolean not null default false;
alter table cessao_espaco_recintos add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_cessao_espaco_recinto
  on cessao_espaco_recintos (espaco_id, recinto_id);
create index if not exists idx_cessao_recinto_espaco
  on cessao_espaco_recintos (recinto_id);

comment on table cessao_espaco_recintos is
  'Ambientes (patrimonio_recinto) que compõem o espaço cedível. Muitos-para-muitos: dois espaços que compartilham um ambiente conflitam entre si.';

alter table cessao_espaco_recintos enable row level security;
drop policy if exists tenant_isolation on cessao_espaco_recintos;
create policy tenant_isolation on cessao_espaco_recintos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_espaco_recintos to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_espaco_recintos;
create trigger set_emp_from_jwt before insert on cessao_espaco_recintos
  for each row execute function public.set_emp_from_jwt();

-- ── 3. Janelas: quando o espaço pode ser cedido ──────────────────────────────
--
-- Uma linha por dia da semana e faixa de horário. Duas formas de cessão
-- convivem na mesma tabela:
--   • 'slots' — blocos fixos de `slot_minutos` (ex.: manhã em turnos de 2h);
--   • 'livre' — o solicitante escolhe início e fim dentro da faixa.
-- Terça de manhã pode ser por slot e terça à noite livre: são duas linhas.

create table if not exists cessao_espaco_janelas (id uuid primary key default gen_random_uuid());
alter table cessao_espaco_janelas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_espaco_janelas add column if not exists espaco_id uuid references cessao_espacos(id) on delete cascade;
-- 0 = domingo … 6 = sábado (mesma convenção de Date.getDay()).
alter table cessao_espaco_janelas add column if not exists dia_semana smallint;
alter table cessao_espaco_janelas add column if not exists hora_inicio time;
alter table cessao_espaco_janelas add column if not exists hora_termino time;
alter table cessao_espaco_janelas add column if not exists modo text not null default 'livre';
alter table cessao_espaco_janelas add column if not exists slot_minutos integer;
-- Rótulo opcional que aparece para o solicitante ("Manhã", "Noite").
alter table cessao_espaco_janelas add column if not exists rotulo text;
alter table cessao_espaco_janelas add column if not exists created_at timestamptz not null default now();
alter table cessao_espaco_janelas add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_janela_dia') then
    alter table cessao_espaco_janelas add constraint ck_cessao_janela_dia
      check (dia_semana between 0 and 6) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_janela_modo') then
    alter table cessao_espaco_janelas add constraint ck_cessao_janela_modo
      check (modo in ('slots', 'livre')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_janela_horas') then
    alter table cessao_espaco_janelas add constraint ck_cessao_janela_horas
      check (hora_inicio < hora_termino) not valid;
  end if;
  -- Slot sem duração não gera horário nenhum.
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_janela_slot') then
    alter table cessao_espaco_janelas add constraint ck_cessao_janela_slot
      check (modo <> 'slots' or (slot_minutos is not null and slot_minutos > 0)) not valid;
  end if;
end $$;

create index if not exists idx_cessao_janela_espaco
  on cessao_espaco_janelas (espaco_id, dia_semana, hora_inicio);

comment on table cessao_espaco_janelas is
  'Dias da semana e faixas de horário em que o espaço pode ser cedido, por slots fixos ou horário livre.';

alter table cessao_espaco_janelas enable row level security;
drop policy if exists tenant_isolation on cessao_espaco_janelas;
create policy tenant_isolation on cessao_espaco_janelas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_espaco_janelas to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_espaco_janelas;
create trigger set_emp_from_jwt before insert on cessao_espaco_janelas
  for each row execute function public.set_emp_from_jwt();

-- ── 4. Bloqueios de agenda ───────────────────────────────────────────────────
--
-- `termino` é NULLABLE de propósito: manutenção sem data para acabar e agenda
-- prioritária de prazo indefinido são o caso real que motivou o campo. Enquanto
-- o término for nulo, o bloqueio vale para sempre — quem encerra é uma pessoa.

create table if not exists cessao_espaco_bloqueios (id uuid primary key default gen_random_uuid());
alter table cessao_espaco_bloqueios add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_espaco_bloqueios add column if not exists espaco_id uuid references cessao_espacos(id) on delete cascade;
alter table cessao_espaco_bloqueios add column if not exists inicio timestamptz;
alter table cessao_espaco_bloqueios add column if not exists termino timestamptz;
alter table cessao_espaco_bloqueios add column if not exists motivo text not null default 'manutencao';
alter table cessao_espaco_bloqueios add column if not exists descricao text;
alter table cessao_espaco_bloqueios add column if not exists encerrado_em timestamptz;
alter table cessao_espaco_bloqueios add column if not exists encerrado_por_id uuid references usuarios(id);
alter table cessao_espaco_bloqueios add column if not exists criado_por_id uuid references usuarios(id);
alter table cessao_espaco_bloqueios add column if not exists created_at timestamptz not null default now();
alter table cessao_espaco_bloqueios add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_bloqueio_motivo') then
    alter table cessao_espaco_bloqueios add constraint ck_cessao_bloqueio_motivo
      check (motivo in ('manutencao', 'agenda_prioritaria', 'outro')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_bloqueio_periodo') then
    alter table cessao_espaco_bloqueios add constraint ck_cessao_bloqueio_periodo
      check (termino is null or termino > inicio) not valid;
  end if;
end $$;

create index if not exists idx_cessao_bloqueio_espaco
  on cessao_espaco_bloqueios (espaco_id, inicio desc);

comment on table cessao_espaco_bloqueios is
  'Períodos em que o espaço não pode ser cedido (manutenção, agenda prioritária). Término nulo = prazo indefinido, encerrado à mão.';

alter table cessao_espaco_bloqueios enable row level security;
drop policy if exists tenant_isolation on cessao_espaco_bloqueios;
create policy tenant_isolation on cessao_espaco_bloqueios for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_espaco_bloqueios to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_espaco_bloqueios;
create trigger set_emp_from_jwt before insert on cessao_espaco_bloqueios
  for each row execute function public.set_emp_from_jwt();

-- ── 5. Permissões ────────────────────────────────────────────────────────────
--
-- Três papéis: quem consulta, quem cadastra e quem autoriza politicamente. O
-- terceiro só entra em uso na fase 3, mas nasce aqui para a atribuição de
-- acesso ser feita uma vez só.

alter table permissoes add column if not exists espacos boolean;
alter table permissoes add column if not exists espacos_gestao boolean;
alter table permissoes add column if not exists espacos_autorizacao boolean;

notify pgrst, 'reload schema';
