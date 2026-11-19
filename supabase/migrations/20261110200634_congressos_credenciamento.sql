-- Confluir — Congressos: credenciamento e presença (Fase 2)
--
-- POR QUÊ: no dia do evento, a mesa credencia com lista impressa, a presença
-- em cada sala vira outra lista de papel e o quórum é contado à mão. O
-- módulo passa a registrar o credenciamento (uma vez), os crachás (com segunda
-- via que invalida a anterior), a troca de titular por suplente e a presença
-- por sessão, com o meio e o nível de prova de que a pessoa estava no local
-- (plano, seção 6.7: níveis A a E).
--
-- COMO:
--   congresso_participantes.credenciado_em/_por, documento_conferido,
--     modalidade (presencial ou distancia)
--   congresso_crachas         cada via do crachá, com hash do código do QR
--   congresso_substituicoes   suplente que assume no lugar de um titular
--   congresso_sessoes.segredo semente do código da sala que muda a cada
--                             poucos segundos (nível C)
--   congresso_presencas       presença por sessão: entrada, saída, meio, nível
--   permissoes.congressos_credenciamento  quem opera a mesa e a porta
-- Idempotente.

alter table public.congresso_participantes
  add column if not exists credenciado_em timestamptz,
  add column if not exists credenciado_por uuid references public.usuarios(id) on delete set null,
  add column if not exists documento_conferido boolean not null default false,
  add column if not exists modalidade text not null default 'presencial';
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'congresso_participantes_modalidade') then
    alter table public.congresso_participantes
      add constraint congresso_participantes_modalidade check (modalidade in ('presencial', 'distancia'));
  end if;
end $$;

alter table public.congresso_sessoes
  add column if not exists segredo text;

create table if not exists public.congresso_crachas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  participante_id uuid not null references public.congresso_participantes(id) on delete cascade,
  via integer not null default 1 check (via > 0),
  codigo_hash text not null,
  ativo boolean not null default true,
  emitido_em timestamptz not null default now(),
  emitido_por uuid references public.usuarios(id) on delete set null,
  invalidado_em timestamptz,
  motivo text
);
create unique index if not exists congresso_crachas_codigo on public.congresso_crachas (codigo_hash);
create unique index if not exists congresso_crachas_ativo
  on public.congresso_crachas (participante_id) where ativo;

create table if not exists public.congresso_substituicoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  titular_id uuid not null references public.congresso_participantes(id) on delete cascade,
  suplente_id uuid not null references public.congresso_participantes(id) on delete cascade,
  motivo text,
  autorizado_por text,
  registrado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  desfeita_em timestamptz,
  desfeita_por uuid references public.usuarios(id) on delete set null,
  constraint congresso_substituicoes_pessoas check (titular_id <> suplente_id)
);
create unique index if not exists congresso_substituicoes_titular
  on public.congresso_substituicoes (titular_id) where desfeita_em is null;
create unique index if not exists congresso_substituicoes_suplente
  on public.congresso_substituicoes (suplente_id) where desfeita_em is null;

create table if not exists public.congresso_presencas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  sessao_id uuid not null references public.congresso_sessoes(id) on delete cascade,
  participante_id uuid not null references public.congresso_participantes(id) on delete cascade,
  entrada_em timestamptz not null default now(),
  saida_em timestamptz,
  metodo text not null check (metodo in ('porta', 'codigo_sala', 'chamada', 'estacao', 'virtual', 'papel')),
  nivel text not null check (nivel in ('A', 'B', 'C', 'D', 'E')),
  modalidade text not null default 'presencial' check (modalidade in ('presencial', 'distancia')),
  registrado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists congresso_presencas_um
  on public.congresso_presencas (sessao_id, participante_id);
create index if not exists congresso_presencas_congresso on public.congresso_presencas (congresso_id, sessao_id);

do $$
declare
  t text;
begin
  foreach t in array array['congresso_crachas', 'congresso_substituicoes', 'congresso_presencas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I to authenticated
         using (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)
         with check (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop trigger if exists auditoria_registrar on public.%I', t);
    execute format('create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
  end loop;
end $$;

-- Quem opera a mesa e a porta, sem precisar configurar o congresso.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'permissoes' and column_name = 'congressos_credenciamento'
  ) then
    alter table public.permissoes add column congressos_credenciamento boolean default false;
    update public.permissoes set congressos_credenciamento = true where congressos_gestao = true;
  end if;
end $$;
comment on column public.permissoes.congressos_credenciamento is 'Congressos e conferências: operar a mesa de credenciamento, a porta das sessões e o painel de quórum. [lgpd:nenhum]';

comment on column public.congresso_participantes.credenciado_em is 'Quando a pessoa foi credenciada (uma vez por congresso). Nulo = não credenciada. [lgpd:nenhum]';
comment on column public.congresso_participantes.credenciado_por is 'Quem credenciou na mesa. [lgpd:identificacao]';
comment on column public.congresso_participantes.documento_conferido is 'A mesa conferiu documento com foto no credenciamento. [lgpd:nenhum]';
comment on column public.congresso_participantes.modalidade is 'presencial ou distancia: define que atos a pessoa pode fazer e com que prova (local da decisão). [lgpd:nenhum]';
comment on column public.congresso_sessoes.segredo is 'Semente do código da sala, que muda a cada poucos segundos (prova de presença nível C). Nunca sai do servidor. [lgpd:credencial]';

comment on table public.congresso_crachas is 'Vias do crachá de cada participante. Só a via ativa vale; segunda via invalida a anterior. O QR leva um código cujo hash fica aqui. [lgpd:sensivel_sindical|titulares:participantes de congressos]';
comment on column public.congresso_crachas.codigo_hash is 'SHA-256 do código impresso no QR do crachá. [lgpd:credencial]';
comment on column public.congresso_crachas.emitido_por is 'Quem emitiu a via. [lgpd:identificacao]';
comment on column public.congresso_crachas.motivo is 'Motivo da segunda via ou da invalidação. [lgpd:nenhum]';

comment on table public.congresso_substituicoes is 'Suplente que assume no lugar de um titular, com quem autorizou. Desfazer não apaga: marca desfeita_em. [lgpd:sensivel_sindical|titulares:delegados e suplentes de congressos]';
comment on column public.congresso_substituicoes.autorizado_por is 'Nome de quem autorizou a troca (coordenação da base ou comissão), quando o regimento exige. [lgpd:identificacao]';
comment on column public.congresso_substituicoes.registrado_por is 'Quem registrou na mesa. [lgpd:identificacao]';
comment on column public.congresso_substituicoes.desfeita_por is 'Quem desfez a troca. [lgpd:identificacao]';

comment on table public.congresso_presencas is 'Presença por sessão: entrada, saída, meio (porta, código da sala, chamada, estação, virtual, papel) e nível de prova de que a pessoa estava no local. [lgpd:sensivel_sindical|titulares:participantes de congressos]';
comment on column public.congresso_presencas.registrado_por is 'Quem registrou (nulo quando a própria pessoa leu o código da sala). [lgpd:identificacao]';
