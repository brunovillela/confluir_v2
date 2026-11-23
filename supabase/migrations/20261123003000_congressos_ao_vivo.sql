-- Confluir — Congressos: plenária ao vivo (Fase 7)
--
-- POR QUÊ: a votação eletrônica ficou fora da primeira edição (decisão 3) e
-- volta agora como opção, ao lado do crachá: a mesa abre a votação, o
-- delegado vota pelo link pessoal ou numa estação da mesa, e o resultado
-- sai na hora. Também a fila de fala com cronômetro e o telão, que não
-- dependem da votação eletrônica.
--
-- Sigilo (ADR 0021): na votação secreta, quem votou (participação) fica
-- separado do voto. O voto secreto não tem pessoa, não tem hora e não passa
-- pela auditoria (que gravaria a hora e permitiria religar). Uma pessoa, um
-- voto: a participação é única por votação e a função congresso_votar grava
-- participação e voto na mesma transação.
--
-- COMO:
--   congresso_votacoes_vivo        votação eletrônica aberta pela mesa (item,
--                                  sigilo, simples ou priorização, base de
--                                  votantes, abertura, fechamento, resultado)
--   congresso_voto_participacoes   quem votou, por qual canal (link, estação)
--   congresso_votos_vivo           o voto: opção; pessoa só na votação aberta
--   congresso_falas                fila de fala com tipo, ordem e cronômetro
--   congresso_plenaria_estado      sessão atual da mesa e inscrições abertas
--   congresso_votacoes.forma       ganha 'eletronica'
--   função congresso_votar         grava participação + votos, atômico
-- Idempotente.

create table if not exists public.congresso_votacoes_vivo (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  sessao_id uuid references public.congresso_sessoes(id) on delete set null,
  titulo text not null check (length(trim(titulo)) > 0),
  tipo text not null default 'simples' check (tipo in ('simples', 'priorizacao')),
  sigilo text not null default 'secreta' check (sigilo in ('aberta', 'secreta')),
  proposta_ids uuid[] not null default '{}',
  mocao_ids uuid[] not null default '{}',
  itens jsonb not null default '[]'::jsonb,
  maximo_escolhas integer check (maximo_escolhas is null or maximo_escolhas > 0),
  base_votantes integer,
  aberta_em timestamptz not null default now(),
  aberta_por text,
  fechada_em timestamptz,
  fechada_por text,
  cancelada_em timestamptz,
  resultado jsonb,
  votacao_id uuid references public.congresso_votacoes(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists congresso_votacoes_vivo_congresso on public.congresso_votacoes_vivo (congresso_id, aberta_em desc);
create unique index if not exists congresso_votacoes_vivo_uma_aberta
  on public.congresso_votacoes_vivo (congresso_id) where fechada_em is null and cancelada_em is null;

create table if not exists public.congresso_voto_participacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  votacao_vivo_id uuid not null references public.congresso_votacoes_vivo(id) on delete cascade,
  participante_id uuid not null references public.congresso_participantes(id) on delete cascade,
  canal text not null check (canal in ('link', 'estacao')),
  nivel text,
  created_at timestamptz not null default now()
);
create unique index if not exists congresso_voto_participacoes_um
  on public.congresso_voto_participacoes (votacao_vivo_id, participante_id);

create table if not exists public.congresso_votos_vivo (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  votacao_vivo_id uuid not null references public.congresso_votacoes_vivo(id) on delete cascade,
  opcao text not null check (length(opcao) between 1 and 64),
  participante_id uuid references public.congresso_participantes(id) on delete cascade
);
create index if not exists congresso_votos_vivo_votacao on public.congresso_votos_vivo (votacao_vivo_id);

create table if not exists public.congresso_falas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  congresso_id uuid not null references public.congressos(id) on delete cascade,
  sessao_id uuid references public.congresso_sessoes(id) on delete set null,
  participante_id uuid references public.congresso_participantes(id) on delete set null,
  nome text not null check (length(trim(nome)) > 0),
  tipo text not null default 'fala'
    check (tipo in ('fala', 'a_favor', 'contra', 'questao_ordem', 'esclarecimento', 'encaminhamento', 'declaracao_voto')),
  assunto text,
  situacao text not null default 'inscrita' check (situacao in ('inscrita', 'falando', 'concluida', 'cancelada')),
  ordem integer not null default 0,
  segundos integer not null check (segundos > 0),
  inscrita_em timestamptz not null default now(),
  inscrita_por text,
  inicio_em timestamptz,
  pausada_em timestamptz,
  pausado_ms integer not null default 0,
  fim_em timestamptz
);
create index if not exists congresso_falas_congresso on public.congresso_falas (congresso_id, situacao, ordem);
create unique index if not exists congresso_falas_uma_falando
  on public.congresso_falas (congresso_id) where situacao = 'falando';

create table if not exists public.congresso_plenaria_estado (
  congresso_id uuid primary key references public.congressos(id) on delete cascade,
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  sessao_id uuid references public.congresso_sessoes(id) on delete set null,
  inscricoes_abertas boolean not null default true,
  assunto text,
  rodada_desde timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

alter table public.congresso_votacoes drop constraint if exists congresso_votacoes_forma_check;
alter table public.congresso_votacoes add constraint congresso_votacoes_forma_check
  check (forma in ('sem_oposicao', 'visual', 'contagem', 'urna', 'eletronica'));

-- Uma pessoa, um voto: participação e voto na mesma transação. A participação
-- única barra o segundo voto, de qualquer canal. Na secreta, o voto vai sem
-- pessoa. As regras de quem pode votar ficam na aplicação (antes da chamada).
create or replace function public.congresso_votar(
  p_emp uuid,
  p_votacao uuid,
  p_participante uuid,
  p_canal text,
  p_nivel text,
  p_opcoes text[]
) returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v record;
  o text;
begin
  select id, congresso_id, sigilo, tipo, maximo_escolhas, fechada_em, cancelada_em
    into v
    from public.congresso_votacoes_vivo
   where id = p_votacao and emp_proprietaria_id = p_emp
   for share;
  if not found then return 'nao_encontrada'; end if;
  if v.fechada_em is not null or v.cancelada_em is not null then return 'encerrada'; end if;
  if coalesce(array_length(p_opcoes, 1), 0) = 0 then return 'sem_opcao'; end if;
  if v.tipo = 'simples' and array_length(p_opcoes, 1) <> 1 then return 'opcao_invalida'; end if;
  if v.tipo = 'priorizacao' and array_length(p_opcoes, 1) > coalesce(v.maximo_escolhas, 1) then return 'escolhas_demais'; end if;
  begin
    insert into public.congresso_voto_participacoes (emp_proprietaria_id, congresso_id, votacao_vivo_id, participante_id, canal, nivel)
    values (p_emp, v.congresso_id, v.id, p_participante, p_canal, p_nivel);
  exception when unique_violation then
    return 'ja_votou';
  end;
  foreach o in array (select array_agg(distinct x) from unnest(p_opcoes) x) loop
    insert into public.congresso_votos_vivo (emp_proprietaria_id, congresso_id, votacao_vivo_id, opcao, participante_id)
    values (p_emp, v.congresso_id, v.id, o, case when v.sigilo = 'aberta' then p_participante else null end);
  end loop;
  return 'ok';
end;
$$;
revoke all on function public.congresso_votar(uuid, uuid, uuid, text, text, text[]) from public, anon, authenticated;
grant execute on function public.congresso_votar(uuid, uuid, uuid, text, text, text[]) to service_role;

do $$
declare
  t text;
begin
  foreach t in array array['congresso_votacoes_vivo', 'congresso_voto_participacoes', 'congresso_votos_vivo', 'congresso_falas', 'congresso_plenaria_estado'] loop
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
  -- Auditoria em tudo, menos no voto: gravaria a hora e religaria voto e pessoa.
  foreach t in array array['congresso_votacoes_vivo', 'congresso_voto_participacoes', 'congresso_falas', 'congresso_plenaria_estado'] loop
    execute format('drop trigger if exists auditoria_registrar on public.%I', t);
    execute format('create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
  end loop;
  drop trigger if exists auditoria_registrar on public.congresso_votos_vivo;
end $$;
grant select, insert, update on table public.congresso_votacoes_vivo, public.congresso_falas, public.congresso_plenaria_estado to authenticated;
grant select on table public.congresso_voto_participacoes, public.congresso_votos_vivo to authenticated;

comment on table public.congresso_votacoes_vivo is 'Votação eletrônica aberta pela mesa da plenária: item votado, sigilo (aberta ou secreta), simples ou priorização, base de votantes, abertura, fechamento e resultado. [lgpd:identificacao|titulares:mesa da plenária]';
comment on column public.congresso_votacoes_vivo.aberta_por is 'Quem abriu a votação. [lgpd:identificacao]';
comment on column public.congresso_votacoes_vivo.fechada_por is 'Quem fechou a votação. [lgpd:identificacao]';
comment on column public.congresso_votacoes_vivo.resultado is 'Contagem por opção ou classificação da priorização, gravada no fechamento. [lgpd:nenhum]';
comment on table public.congresso_voto_participacoes is 'Quem votou em cada votação eletrônica e por qual canal (link pessoal ou estação da mesa), separado do voto. [lgpd:sensivel_sindical|titulares:delegados de congressos]';
comment on table public.congresso_votos_vivo is 'Votos da votação eletrônica. Na secreta não há pessoa nem hora, e a tabela não passa pela auditoria (ADR 0021); na aberta (nominal), o voto leva o participante. [lgpd:sensivel_sindical|titulares:delegados de congressos (votação aberta)]';
comment on column public.congresso_votos_vivo.participante_id is 'Só na votação aberta (nominal); nulo na secreta. [lgpd:sensivel_sindical]';
comment on table public.congresso_falas is 'Fila de fala da plenária: quem se inscreveu, tipo (fala, a favor, contra, questão de ordem, esclarecimento, encaminhamento, declaração de voto), ordem e cronômetro. [lgpd:identificacao|titulares:participantes de congressos]';
comment on column public.congresso_falas.nome is 'Nome de quem fala, como aparece no telão. [lgpd:identificacao]';
comment on column public.congresso_falas.inscrita_por is 'Quem fez a inscrição (a própria pessoa pelo link ou a mesa). [lgpd:identificacao]';
comment on table public.congresso_plenaria_estado is 'Estado da mesa da plenária: sessão em curso, inscrições abertas, assunto em debate e início da rodada de inscrições. [lgpd:nenhum]';
comment on function public.congresso_votar(uuid, uuid, uuid, text, text, text[]) is 'Grava a participação e o voto na mesma transação; um voto por pessoa e votação; na secreta, o voto vai sem pessoa.';
