-- Confluir — Congressos: encerramento (Fase 6)
--
-- POR QUÊ: no papel, as resoluções viram um PDF que ninguém reabre, o
-- relatório final leva semanas, os certificados são feitos um a um e a
-- eleição da delegação para a etapa seguinte fica só na ata. O congresso
-- passa a guardar cada resolução (com marca de reservada para o que não se
-- divulga, como estratégia de luta), quem responde por ela, o prazo e a
-- situação; as chapas inscritas, os votos e os eleitos; e os certificados
-- com código conferível em /verificar.
--
-- COMO:
--   congressos.encerrado_em/_por       encerramento registrado
--   congresso_resolucoes               o que foi aprovado (proposta, moção ou
--                                      avulsa), com texto votado, reservada,
--                                      destino, responsável, prazo, situação e
--                                      vínculo com negociação ou ofício
--   congresso_resolucao_eventos        acompanhamento (só inserção)
--   congresso_chapas (+ _membros)      eleição da delegação para a etapa
--                                      seguinte: inscrição, votos e eleitos
--   congresso_certificados             certificado com código, condição e
--                                      frequência daquele momento
-- Idempotente.

alter table public.congressos
  add column if not exists encerrado_em timestamptz,
  add column if not exists encerrado_por text;

create table if not exists public.congresso_resolucoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  numero integer not null check (numero > 0),
  proposta_id uuid references public.congresso_propostas(id) on delete set null,
  mocao_id uuid references public.congresso_mocoes(id) on delete set null,
  eixo_id uuid references public.congresso_eixos(id) on delete set null,
  titulo text,
  texto text not null check (length(trim(texto)) > 0),
  reservada boolean not null default false,
  destino text not null default 'registro'
    check (destino in ('registro', 'pauta_act', 'plano_lutas', 'oficio', 'direcao', 'etapa_seguinte')),
  responsavel text,
  prazo date,
  situacao text not null default 'a_encaminhar'
    check (situacao in ('a_encaminhar', 'em_andamento', 'cumprida', 'parcial', 'nao_cumprida', 'prejudicada')),
  negociacao_id uuid references public.negociacoes(id) on delete set null,
  oficio_id uuid references public.oficios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists congresso_resolucoes_numero on public.congresso_resolucoes (congresso_id, numero);
create unique index if not exists congresso_resolucoes_proposta on public.congresso_resolucoes (proposta_id) where proposta_id is not null;
create unique index if not exists congresso_resolucoes_mocao on public.congresso_resolucoes (mocao_id) where mocao_id is not null;

create table if not exists public.congresso_resolucao_eventos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  resolucao_id uuid not null references public.congresso_resolucoes(id) on delete cascade,
  acao text not null,
  situacao text,
  detalhe text,
  autor text,
  created_at timestamptz not null default now()
);
create index if not exists congresso_resolucao_eventos_resolucao on public.congresso_resolucao_eventos (resolucao_id, created_at);

create table if not exists public.congresso_chapas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  numero integer not null check (numero > 0),
  nome text not null check (length(trim(nome)) > 0),
  situacao text not null default 'inscrita' check (situacao in ('inscrita', 'homologada', 'impugnada', 'retirada')),
  motivo text,
  votos integer check (votos is null or votos >= 0),
  vagas_titulares integer check (vagas_titulares is null or vagas_titulares >= 0),
  vagas_suplentes integer check (vagas_suplentes is null or vagas_suplentes >= 0),
  inscrita_em timestamptz not null default now(),
  inscrita_por text,
  created_at timestamptz not null default now(),
  updated_at timestamptz
);
create unique index if not exists congresso_chapas_numero on public.congresso_chapas (congresso_id, numero);

create table if not exists public.congresso_chapa_membros (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  chapa_id uuid not null references public.congresso_chapas(id) on delete cascade,
  participante_id uuid not null references public.congresso_participantes(id) on delete cascade,
  unidade_id uuid references public.congresso_unidades(id) on delete set null,
  condicao text not null default 'titular' check (condicao in ('titular', 'suplente')),
  ordem integer not null default 0,
  eleito boolean,
  created_at timestamptz not null default now()
);
create unique index if not exists congresso_chapa_membros_um on public.congresso_chapa_membros (chapa_id, participante_id);
create index if not exists congresso_chapa_membros_participante on public.congresso_chapa_membros (congresso_id, participante_id);

create table if not exists public.congresso_certificados (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  participante_id uuid not null references public.congresso_participantes(id) on delete cascade,
  codigo text not null unique,
  nome text not null,
  condicao text not null,
  frequencia numeric(5, 2),
  emitido_em timestamptz not null default now(),
  emitido_por text,
  revogado_em timestamptz,
  revogado_motivo text
);
create unique index if not exists congresso_certificados_um_valido
  on public.congresso_certificados (congresso_id, participante_id) where revogado_em is null;

do $$
declare
  t text;
begin
  foreach t in array array['congresso_resolucoes', 'congresso_resolucao_eventos', 'congresso_chapas', 'congresso_chapa_membros', 'congresso_certificados'] loop
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
grant select, insert, update, delete on table public.congresso_resolucoes, public.congresso_chapas, public.congresso_chapa_membros to authenticated;
grant select, insert, update on table public.congresso_certificados to authenticated;
grant select, insert on table public.congresso_resolucao_eventos to authenticated;

comment on column public.congressos.encerrado_em is 'Quando a comissão encerrou o congresso (resoluções geradas, relatório e certificados liberados). [lgpd:nenhum]';
comment on column public.congressos.encerrado_por is 'Quem encerrou o congresso. [lgpd:identificacao]';

comment on table public.congresso_resolucoes is 'Resoluções do congresso: o texto aprovado (de uma proposta, de uma moção ou avulsa), marca de reservada (fora do caderno público, como estratégia de luta), destino, responsável, prazo, situação do cumprimento e vínculo com negociação ou ofício. [lgpd:identificacao|titulares:responsáveis pelas resoluções]';
comment on column public.congresso_resolucoes.texto is 'Texto aprovado, congelado no momento da geração. [lgpd:nenhum]';
comment on column public.congresso_resolucoes.reservada is 'Resolução reservada: não sai no caderno público, na página do congresso nem na busca entre edições fora do painel. [lgpd:nenhum]';
comment on column public.congresso_resolucoes.responsavel is 'Quem responde pelo encaminhamento (pessoa, diretoria ou departamento). [lgpd:identificacao]';

comment on table public.congresso_resolucao_eventos is 'Acompanhamento de cada resolução: mudança de situação, vínculo, nota. Só inserção. [lgpd:identificacao|titulares:comissão e responsáveis]';
comment on column public.congresso_resolucao_eventos.autor is 'Quem registrou. [lgpd:identificacao]';

comment on table public.congresso_chapas is 'Chapas inscritas na eleição da delegação para a etapa seguinte, com horário de inscrição, situação (homologada, impugnada, retirada), votos e vagas obtidas. [lgpd:sensivel_sindical|titulares:candidatos a delegado da etapa seguinte]';
comment on column public.congresso_chapas.inscrita_por is 'Quem registrou a inscrição. [lgpd:identificacao]';
comment on table public.congresso_chapa_membros is 'Quem compõe cada chapa: participante, base, titular ou suplente, ordem e se foi eleito. [lgpd:sensivel_sindical|titulares:candidatos a delegado da etapa seguinte]';

comment on table public.congresso_certificados is 'Certificados de participação: código conferível em /verificar, nome, condição (papel) e frequência no momento da emissão. Revogar não apaga. [lgpd:sensivel_sindical|titulares:participantes de congressos]';
comment on column public.congresso_certificados.codigo is 'Código público do certificado (QR e /verificar). [lgpd:nenhum]';
comment on column public.congresso_certificados.nome is 'Nome como saiu no certificado. [lgpd:identificacao]';
comment on column public.congresso_certificados.emitido_por is 'Quem emitiu. [lgpd:identificacao]';
