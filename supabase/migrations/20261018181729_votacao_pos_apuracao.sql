-- Confluir — Votação depois da apuração: desvínculo do voto em separado (V1)
-- e expurgo dos contatos dos aptos (V4) — RIPD da votação,
-- docs/lgpd/ripd-votacao.md
--
-- POR QUÊ:
--   V1. O voto em separado fica ligado à pessoa (voto_online.em_separado_id)
--       para a comissão deferir ou indeferir, mas nada desfazia o vínculo
--       depois da apuração: o voto de quem votou em separado ficava
--       identificável para sempre. O cadastro do em separado também guardava
--       telefone, e-mail e nascimento sem prazo.
--   V4. Os contatos que o eleitor deixa para receber o link e o comprovante
--       (e-mail de contato, telefone, chat do Telegram, nascimento informado)
--       e as tabelas de verificação (votacao_email_verificado,
--       votacao_telegram_confirmacoes) ficavam guardados indefinidamente.
--       Depois da apuração e do prazo de impugnação eles não são necessários.
--
-- COMO:
--   1. voto_assembleias.apuracao_encerrada_em: carimbada pelo banco quando a
--      apuração é encerrada (e apagada se for reaberta). Assembleias já
--      encerradas recebem now(), para o prazo do expurgo contar a partir da
--      aplicação desta migração e nada sumir no primeiro dia.
--   2. Ao encerrar a apuração (trigger AFTER UPDATE em voto_assembleias,
--      voto_assembleias_apuracao_desvinculo, sem RPC exposta): cada voto em
--      separado vira um voto comum (deferido continua valendo; indeferido ou
--      pendente fica valido = false, como a apuração já o tratava) e perde
--      em_separado_id; o cadastro do em separado perde telefone, e-mail e
--      nascimento, guarda nome, CPF, status e decisão, e ganha
--      desvinculado_em. A decisão fica definitiva: um trigger recusa mudar o
--      status depois do desvínculo (não há mais voto para revalidar).
--   3. Trigger em voto_online recusa em_separado_id de assembleia com a
--      apuração encerrada. CHECK não serve: a regra depende de outra tabela.
--   4. voto_rod_assembleias.contatos_reter_dias (padrão 90, de 7 a 3.650) e
--      contatos_expurgados_em. votacao_expurgar_contatos(), chamada pelo cron
--      /api/votacao/tick, limpa as rodadas cujas assembleias estão TODAS com a
--      apuração encerrada há pelo menos contatos_reter_dias: anula os
--      contatos dos aptos (mantém nome, CPF, matrícula, hora_voto, canal e
--      comprovante), apaga as verificações de e-mail dos CPFs da rodada e as
--      confirmações do Telegram dos chats da rodada (as duas só se a pessoa
--      não estiver em outra rodada que ainda guarda contatos) e registra a
--      execução em votacao_expurgo_contatos.
-- Não muda contagem nem resultado de nenhuma votação: o encerramento grava o
-- resultado (voto_resultado_final) antes de marcar apuracao_encerrada, e a
-- contagem dinâmica continua igual porque o indeferido vira valido = false.

-- ── 1. Colunas ───────────────────────────────────────────────────────────────

alter table public.voto_assembleias
  add column if not exists apuracao_encerrada_em timestamp with time zone;
comment on column public.voto_assembleias.apuracao_encerrada_em is
  'Quando a apuração foi encerrada (carimbado pelo trigger voto_assembleias_apuracao_carimbo; nulo se reaberta). Conta o prazo do expurgo dos contatos dos aptos.';

alter table public.voto_em_separado
  add column if not exists desvinculado_em timestamp with time zone;
comment on column public.voto_em_separado.desvinculado_em is
  'Quando o voto deixou de apontar para este cadastro (encerramento da apuração). Daí em diante a decisão é definitiva e não há contato guardado.';

alter table public.voto_rod_assembleias
  add column if not exists contatos_reter_dias smallint not null default 90;
alter table public.voto_rod_assembleias
  add column if not exists contatos_expurgados_em timestamp with time zone;
do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conname = 'voto_rod_assembleias_contatos_reter_dias_check'
  ) then
    alter table public.voto_rod_assembleias
      add constraint voto_rod_assembleias_contatos_reter_dias_check
      check (contatos_reter_dias between 7 and 3650);
  end if;
end
$$;
comment on column public.voto_rod_assembleias.contatos_reter_dias is
  'Dias, contados do encerramento da apuração da última assembleia, que os contatos dos aptos ficam guardados (prazo de impugnação). Padrão 90.';
comment on column public.voto_rod_assembleias.contatos_expurgados_em is
  'Quando votacao_expurgar_contatos() limpou os contatos dos aptos desta rodada.';

-- ── 2. Desvínculo do voto em separado ────────────────────────────────────────

-- Carimbo do encerramento (BEFORE).
create or replace function public.voto_assembleias_apuracao_carimbo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(new.apuracao_encerrada, false) then
    if tg_op = 'INSERT' or not coalesce(old.apuracao_encerrada, false) then
      new.apuracao_encerrada_em := now();
    end if;
  else
    new.apuracao_encerrada_em := null;
  end if;
  return new;
end
$$;
comment on function public.voto_assembleias_apuracao_carimbo() is
  'Carimba voto_assembleias.apuracao_encerrada_em quando a apuração é encerrada e o apaga na reabertura.';
revoke all on function public.voto_assembleias_apuracao_carimbo() from public, anon, authenticated, service_role;

-- Desvínculo (AFTER). Lógica dentro do trigger, sem função chamável por RPC:
-- quem desvinculasse uma assembleia aberta descartaria votos pendentes.
create or replace function public.voto_assembleias_apuracao_desvinculo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  update public.voto_online v
     set valido = case when s.status = 'deferido' then v.valido else false end,
         em_separado_id = null
    from public.voto_em_separado s
   where v.em_separado_id = s.id
     and s.assembleia_id = new.id;

  update public.voto_em_separado
     set telefone = null,
         email = null,
         data_nascimento = null,
         desvinculado_em = now(),
         updated_at = now()
   where assembleia_id = new.id
     and desvinculado_em is null;
  return null;
end
$$;
comment on function public.voto_assembleias_apuracao_desvinculo() is
  'Sigilo do voto em separado (RIPD V1): ao encerrar a apuração, desliga os votos da assembleia do cadastro de voto_em_separado (indeferido/pendente vira valido = false) e apaga telefone, e-mail e nascimento do cadastro.';
revoke all on function public.voto_assembleias_apuracao_desvinculo() from public, anon, authenticated, service_role;

drop trigger if exists voto_assembleias_apuracao_carimbo on public.voto_assembleias;
create trigger voto_assembleias_apuracao_carimbo
  before insert or update of apuracao_encerrada on public.voto_assembleias
  for each row execute function public.voto_assembleias_apuracao_carimbo();

drop trigger if exists voto_assembleias_apuracao_desvinculo on public.voto_assembleias;
create trigger voto_assembleias_apuracao_desvinculo
  after insert or update of apuracao_encerrada on public.voto_assembleias
  for each row
  when (new.apuracao_encerrada is true)
  execute function public.voto_assembleias_apuracao_desvinculo();

-- Nenhum voto novo (ou alterado) pode apontar para um em separado de
-- assembleia com a apuração encerrada.
create or replace function public.voto_online_em_separado_aberto()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1
      from public.voto_em_separado s
      join public.voto_assembleias a on a.id = s.assembleia_id
     where s.id = new.em_separado_id
       and (a.apuracao_encerrada is true or s.desvinculado_em is not null)
  ) then
    raise exception 'Voto em separado de assembleia com a apuração encerrada não pode ficar ligado ao cadastro.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
comment on function public.voto_online_em_separado_aberto() is
  'Recusa voto_online.em_separado_id que aponte para cadastro de assembleia com a apuração encerrada (RIPD V1).';
revoke all on function public.voto_online_em_separado_aberto() from public, anon, authenticated, service_role;

drop trigger if exists voto_online_em_separado_aberto on public.voto_online;
create trigger voto_online_em_separado_aberto
  before insert or update of em_separado_id on public.voto_online
  for each row
  when (new.em_separado_id is not null)
  execute function public.voto_online_em_separado_aberto();

-- Depois do desvínculo a decisão não muda (não há voto para revalidar).
create or replace function public.voto_em_separado_decisao_definitiva()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.desvinculado_em is not null and new.status is distinct from old.status then
    raise exception 'A decisão deste voto em separado ficou definitiva no encerramento da apuração.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
comment on function public.voto_em_separado_decisao_definitiva() is
  'Recusa mudar o status de um voto em separado já desvinculado do voto no encerramento da apuração (RIPD V1).';
revoke all on function public.voto_em_separado_decisao_definitiva() from public, anon, authenticated, service_role;

drop trigger if exists voto_em_separado_decisao_definitiva on public.voto_em_separado;
create trigger voto_em_separado_decisao_definitiva
  before update of status on public.voto_em_separado
  for each row execute function public.voto_em_separado_decisao_definitiva();

-- Assembleias já encerradas: carimbo de hoje (o prazo do expurgo começa
-- agora) e desvínculo dos em separado que houver (este update não mexe em
-- apuracao_encerrada, então os triggers não disparam: o desvínculo vai aqui).
update public.voto_assembleias
   set apuracao_encerrada_em = now()
 where apuracao_encerrada is true
   and apuracao_encerrada_em is null;
update public.voto_online v
   set valido = case when s.status = 'deferido' then v.valido else false end,
       em_separado_id = null
  from public.voto_em_separado s
  join public.voto_assembleias a on a.id = s.assembleia_id
 where v.em_separado_id = s.id
   and a.apuracao_encerrada is true;
update public.voto_em_separado s
   set telefone = null,
       email = null,
       data_nascimento = null,
       desvinculado_em = now(),
       updated_at = now()
  from public.voto_assembleias a
 where a.id = s.assembleia_id
   and a.apuracao_encerrada is true
   and s.desvinculado_em is null;

comment on column public.voto_online.em_separado_id is
  'Liga o voto ao cadastro de voto_em_separado só até o encerramento da apuração, quando o trigger voto_assembleias_apuracao_desvinculo o anula (indeferido vira valido = false). O trigger voto_online_em_separado_aberto recusa o vínculo em assembleia encerrada. [lgpd:sensivel_sindical]';

-- ── 3. Expurgo dos contatos dos aptos ────────────────────────────────────────

create table if not exists public.votacao_expurgo_contatos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  rod_assembleia_id uuid not null references public.voto_rod_assembleias(id) on delete cascade,
  executado_em timestamp with time zone not null default now(),
  reter_dias smallint not null,
  apuracao_encerrada_em timestamp with time zone,
  aptos_limpos integer not null default 0,
  emails_verificados_apagados integer not null default 0,
  telegram_confirmacoes_apagadas integer not null default 0
);
create index if not exists votacao_expurgo_contatos_rodada_idx
  on public.votacao_expurgo_contatos (rod_assembleia_id);
alter table public.votacao_expurgo_contatos enable row level security;
drop policy if exists votacao_expurgo_contatos_tenant on public.votacao_expurgo_contatos;
create policy votacao_expurgo_contatos_tenant on public.votacao_expurgo_contatos
  using ((emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid))
  with check ((emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid));
comment on table public.votacao_expurgo_contatos is
  'Registro de cada execução do expurgo dos contatos dos aptos de uma rodada (votacao_expurgar_contatos, RIPD V4): quando, com que prazo e quantas linhas. Só contagens, sem dado pessoal. [lgpd:nenhum]';

create or replace function public.votacao_expurgar_contatos(p_limite integer default 20)
returns setof public.votacao_expurgo_contatos
language plpgsql
set search_path = ''
as $$
declare
  r record;
  v_ids uuid[];
  v_cpfs text[];
  v_chats text[];
  v_aptos integer;
  v_emails integer;
  v_tg integer;
  v_log public.votacao_expurgo_contatos;
begin
  for r in
    select rod.id, rod.emp_proprietaria_id, rod.contatos_reter_dias,
           max(a.apuracao_encerrada_em) as encerrada_em
      from public.voto_rod_assembleias rod
      join public.voto_assembleias a on a.rod_assembleia_id = rod.id
     where rod.contatos_expurgados_em is null
     group by rod.id
    having bool_and(coalesce(a.apuracao_encerrada, false))
       and bool_and(a.apuracao_encerrada_em is not null)
       and max(a.apuracao_encerrada_em) <= now() - make_interval(days => rod.contatos_reter_dias)
     order by max(a.apuracao_encerrada_em)
     limit greatest(p_limite, 1)
  loop
    -- Aptos da rodada: pela rodada ou, no legado sem rodada, pela assembleia.
    select coalesce(array_agg(ap.id), '{}'),
           coalesce(array_agg(distinct regexp_replace(ap.cpf, '\D', '', 'g'))
                      filter (where regexp_replace(coalesce(ap.cpf, ''), '\D', '', 'g') <> ''), '{}'),
           coalesce(array_agg(distinct ap.telegram_chat_id)
                      filter (where ap.telegram_chat_id is not null), '{}')
      into v_ids, v_cpfs, v_chats
      from public.voto_assembleias_aptos ap
     where ap.emp_proprietaria_id = r.emp_proprietaria_id
       and (ap.rod_assembleia_id = r.id
            or (ap.rod_assembleia_id is null and ap.assembleia_id in (
                  select a.id from public.voto_assembleias a where a.rod_assembleia_id = r.id)));

    update public.voto_assembleias_aptos ap
       set email_contato = null,
           telefone = null,
           telegram_chat_id = null,
           telegram_vinculado_em = null,
           nascimento_informado = null,
           aviso_email_para = null,
           aviso_email_erro = null,
           cpf_conflito = null,
           conflito_motivo = null
     where ap.id = any (v_ids)
       and (ap.email_contato is not null or ap.telefone is not null
            or ap.telegram_chat_id is not null or ap.telegram_vinculado_em is not null
            or ap.nascimento_informado is not null or ap.aviso_email_para is not null
            or ap.aviso_email_erro is not null or ap.cpf_conflito is not null
            or ap.conflito_motivo is not null);
    get diagnostics v_aptos = row_count;

    -- Verificações de e-mail e confirmações do Telegram não têm rodada: saem
    -- as da pessoa que não está em outra rodada que ainda guarda contatos.
    delete from public.votacao_email_verificado ev
     where ev.emp_proprietaria_id = r.emp_proprietaria_id
       and regexp_replace(ev.cpf, '\D', '', 'g') = any (v_cpfs)
       and not exists (
         select 1
           from public.voto_assembleias_aptos o
           join public.voto_rod_assembleias orod on orod.id = o.rod_assembleia_id
          where o.emp_proprietaria_id = r.emp_proprietaria_id
            and orod.id <> r.id
            and orod.contatos_expurgados_em is null
            and regexp_replace(o.cpf, '\D', '', 'g') = regexp_replace(ev.cpf, '\D', '', 'g'));
    get diagnostics v_emails = row_count;

    delete from public.votacao_telegram_confirmacoes tc
     where tc.emp_proprietaria_id = r.emp_proprietaria_id
       and tc.chat_id = any (v_chats)
       and not exists (
         select 1
           from public.voto_assembleias_aptos o
           join public.voto_rod_assembleias orod on orod.id = o.rod_assembleia_id
          where o.emp_proprietaria_id = r.emp_proprietaria_id
            and orod.id <> r.id
            and orod.contatos_expurgados_em is null
            and o.telegram_chat_id = tc.chat_id);
    get diagnostics v_tg = row_count;

    update public.voto_rod_assembleias
       set contatos_expurgados_em = now()
     where id = r.id;

    insert into public.votacao_expurgo_contatos (
      emp_proprietaria_id, rod_assembleia_id, reter_dias, apuracao_encerrada_em,
      aptos_limpos, emails_verificados_apagados, telegram_confirmacoes_apagadas)
    values (r.emp_proprietaria_id, r.id, r.contatos_reter_dias, r.encerrada_em,
            v_aptos, v_emails, v_tg)
    returning * into v_log;
    return next v_log;
  end loop;
  return;
end
$$;
comment on function public.votacao_expurgar_contatos(integer) is
  'Expurgo dos contatos dos aptos (RIPD V4): para até p_limite rodadas com todas as assembleias apuradas há contatos_reter_dias, anula os contatos dos aptos, apaga verificações de e-mail e confirmações do Telegram da rodada e registra em votacao_expurgo_contatos. Chamada pelo cron /api/votacao/tick.';
revoke all on function public.votacao_expurgar_contatos(integer) from public, anon, authenticated, service_role;
grant execute on function public.votacao_expurgar_contatos(integer) to service_role;
