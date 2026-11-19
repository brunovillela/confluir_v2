-- Confluir — Congressos: moções com assinatura digital (Fase 4)
--
-- POR QUÊ: a folha de assinaturas da moção passa de mão em mão, some ou
-- circula pela metade, e ninguém sabe quantas faltam até o prazo. O módulo
-- passa a coletar a assinatura pelo link pessoal (ou na estação da mesa, ou
-- lançada do papel), com o hash do texto assinado, o papel da pessoa naquele
-- instante e a prova de onde ela estava (local da decisão, plano 6.7). O
-- limiar (número, percentual do congresso ou da base de origem, combinados)
-- é calculado no protocolo e gravado. A moção habilitada vai à pauta da
-- plenária, cujo resultado usa as mesmas votações da Fase 3.
--
-- COMO:
--   congresso_mocoes              a moção: tipo, destinatário, texto e versão,
--                                 hash, base de origem, código público do QR,
--                                 situação e o limiar gravado no protocolo
--   congresso_mocao_assinaturas   uma por pessoa e versão; retirar marca
--                                 retirada_em (nunca apaga)
--   congresso_mocao_eventos       trilha só com inserção
--   congresso_votacao_itens       passa a aceitar moção (proposta ou moção)
-- Idempotente.

create table if not exists public.congresso_mocoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  numero integer not null check (numero > 0),
  codigo text not null,
  tipo text,
  titulo text not null check (length(trim(titulo)) > 0),
  destinatario text,
  texto text not null check (length(trim(texto)) > 0),
  versao integer not null default 1 check (versao > 0),
  texto_hash text not null,
  unidade_id uuid references public.congresso_unidades(id) on delete set null,
  proponente_id uuid references public.congresso_participantes(id) on delete set null,
  proponente_nome text,
  situacao text not null default 'coleta'
    check (situacao in ('coleta', 'protocolada', 'habilitada', 'nao_habilitada', 'aprovada', 'rejeitada', 'retirada')),
  protocolada_em timestamptz,
  limiar jsonb,
  decisao_motivo text,
  decidida_por uuid references public.usuarios(id) on delete set null,
  decidida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists congresso_mocoes_numero on public.congresso_mocoes (congresso_id, numero);
create unique index if not exists congresso_mocoes_codigo on public.congresso_mocoes (codigo);

create table if not exists public.congresso_mocao_assinaturas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  mocao_id uuid not null references public.congresso_mocoes(id) on delete cascade,
  participante_id uuid not null references public.congresso_participantes(id) on delete cascade,
  versao integer not null check (versao > 0),
  texto_hash text not null,
  papel text,
  categoria text,
  unidade_id uuid references public.congresso_unidades(id) on delete set null,
  meio text not null check (meio in ('link', 'estacao', 'papel')),
  modalidade text not null default 'presencial' check (modalidade in ('presencial', 'distancia')),
  nivel text check (nivel is null or nivel in ('A', 'B', 'C', 'D', 'E')),
  ip text,
  navegador text,
  registrado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  retirada_em timestamptz
);
create unique index if not exists congresso_mocao_assinaturas_uma
  on public.congresso_mocao_assinaturas (mocao_id, participante_id, versao) where retirada_em is null;
create index if not exists congresso_mocao_assinaturas_mocao on public.congresso_mocao_assinaturas (mocao_id, versao);

create table if not exists public.congresso_mocao_eventos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  mocao_id uuid not null references public.congresso_mocoes(id) on delete cascade,
  acao text not null,
  detalhe jsonb not null default '{}'::jsonb,
  autor text,
  created_at timestamptz not null default now()
);
create index if not exists congresso_mocao_eventos_mocao on public.congresso_mocao_eventos (mocao_id, created_at);

-- A votação da plenária passa a valer também para moções.
alter table public.congresso_votacao_itens
  add column if not exists mocao_id uuid references public.congresso_mocoes(id) on delete cascade;
alter table public.congresso_votacao_itens alter column proposta_id drop not null;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'congresso_votacao_itens_um_alvo') then
    alter table public.congresso_votacao_itens
      add constraint congresso_votacao_itens_um_alvo check ((proposta_id is null) <> (mocao_id is null));
  end if;
end $$;
create index if not exists congresso_votacao_itens_mocao on public.congresso_votacao_itens (mocao_id);
create unique index if not exists congresso_votacao_itens_um_mocao
  on public.congresso_votacao_itens (votacao_id, mocao_id) where mocao_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array['congresso_mocoes', 'congresso_mocao_assinaturas', 'congresso_mocao_eventos'] loop
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
grant select, insert, update on table public.congresso_mocoes, public.congresso_mocao_assinaturas to authenticated;
grant select, insert on table public.congresso_mocao_eventos to authenticated;

comment on table public.congresso_mocoes is 'Moções do congresso: texto com versão e hash, base de origem, proponente, código público do QR, situação e o limiar de assinaturas calculado e gravado no protocolo. [lgpd:sensivel_sindical|titulares:proponentes de moções em congressos]';
comment on column public.congresso_mocoes.codigo is 'Código público da moção (QR e verificação). Não dá acesso a assinar: a assinatura exige o link pessoal ou a estação da mesa. [lgpd:nenhum]';
comment on column public.congresso_mocoes.texto_hash is 'SHA-256 do texto da versão atual; cada assinatura grava o hash do texto que leu. [lgpd:nenhum]';
comment on column public.congresso_mocoes.proponente_id is 'Participante que apresentou a moção (nulo quando a comissão registrou). [lgpd:sensivel_sindical]';
comment on column public.congresso_mocoes.proponente_nome is 'Nome de quem apresentou (participante ou usuário do painel). [lgpd:sensivel_sindical]';
comment on column public.congresso_mocoes.limiar is 'Limiar gravado no protocolo: alternativas (número, percentual), exigido, atingido e o denominador daquele momento. [lgpd:nenhum]';
comment on column public.congresso_mocoes.decisao_motivo is 'Motivo da habilitação ou da não habilitação pela comissão. [lgpd:nenhum]';
comment on column public.congresso_mocoes.decidida_por is 'Quem decidiu a habilitação. [lgpd:identificacao]';

comment on table public.congresso_mocao_assinaturas is 'Assinaturas de moções: participante, versão e hash do texto lido, papel e base naquele instante, meio (link pessoal, estação da mesa, papel), modalidade e nível de prova de presença, IP e navegador. Retirar marca retirada_em; nada é apagado. [lgpd:sensivel_sindical|titulares:delegados que assinam moções]';
comment on column public.congresso_mocao_assinaturas.ip is 'IP de onde a assinatura foi feita (prova da assinatura eletrônica). [lgpd:identificacao]';
comment on column public.congresso_mocao_assinaturas.navegador is 'Navegador usado na assinatura (prova da assinatura eletrônica). [lgpd:identificacao]';
comment on column public.congresso_mocao_assinaturas.registrado_por is 'Usuário que lançou a assinatura na estação da mesa ou a partir do papel. [lgpd:identificacao]';

comment on table public.congresso_mocao_eventos is 'Trilha da moção (criação, nova versão, assinatura retirada, protocolo, habilitação, resultado). Só inserção. [lgpd:identificacao|titulares:proponentes e comissão de congressos]';
comment on column public.congresso_mocao_eventos.autor is 'Nome de quem fez o ato. [lgpd:identificacao]';

comment on column public.congresso_votacao_itens.mocao_id is 'Moção votada (quando o item não é uma proposta). [lgpd:nenhum]';
