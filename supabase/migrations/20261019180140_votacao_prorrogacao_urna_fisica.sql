-- Confluir — Votação: tentativas do código de e-mail, prorrogação com limite e
-- livro, travas da urna física (R-2, R-5 e R-6 de docs/produto/regras-negocio.md)
--
-- POR QUÊ:
--   R-2. O código de 6 dígitos que confirma o e-mail de votação no portal
--        valia 15 min sem limite de tentativas: dava para chutar à vontade
--        (V3 da RIPD da votação).
--   R-5. A prorrogação de uma assembleia já iniciada não tinha limite, não
--        deixava trilha e estendia a rodada sozinha, em duas instruções
--        soltas: a regra "a janela da assembleia cabe na rodada" (VOT-03)
--        era contornada sem registro. Qualquer UPDATE direto no término
--        também passava.
--   R-6. Urna física: lacre não conferido não impedia a contagem; a
--        contagem e a sessão concluídas podiam ser regravadas; o lacre
--        podia ser apagado de vez.
--
-- COMO:
--   R-2. votacao_email_verificado.pend_tentativas conta os erros do código
--        pendente (zera a cada código novo). A aplicação recusa depois de 5
--        (lib/votacao-codigo-email.ts).
--   R-5. Trigger BEFORE voto_assembleias_apuracao_janela (o nome ordena antes
--        de voto_assembleias_apuracao_livro, que devolve os parâmetros a
--        nulo): mudar o término de uma assembleia que já começou é uma
--        prorrogação e exige, na mesma instrução, motivo (apuracao_motivo, 5+
--        caracteres) e usuário (apuracao_por) — os mesmos parâmetros da
--        reabertura. Limites: apuração aberta, novo término depois do atual
--        e no futuro, até 30 dias além do término atual, no máximo 3
--        prorrogações por assembleia. Se o novo término passar do fim da
--        rodada, o próprio trigger estende a rodada (mesma transação). Cada
--        prorrogação vira um evento "prorrogacao" no livro da apuração
--        (voto_apuracao_eventos), com de/para do término e da rodada.
--        Assembleias importadas do Bubble (bubble_id) ficam de fora.
--   R-6. voto_apuracao_urna: lacre não atestado exige justificativa (10+
--        caracteres) e a ressalva vai para o livro da apuração (evento
--        "lacre"); concluída, a sessão não muda nem se apaga.
--        voto_apuracao_contagem: não se grava, altera nem apaga a contagem de
--        sessão concluída, nem de sessão com lacre sem atestado e sem
--        justificativa. voto_urna_lacres: não se apaga; um lacre lançado
--        errado se ANULA (anulado_em/_motivo/_por, uma vez) e continua no
--        histórico. TRUNCATE recusado nas três.
-- O livro ganha os tipos "prorrogacao" e "lacre" e a coluna detalhe; esses
-- eventos não têm resultado nem hash (resultado_hash passa a aceitar nulo só
-- neles). Não muda voto, contagem nem resultado de nenhuma votação.

-- ── R-2. Tentativas do código do e-mail de votação ──────────────────────────

alter table public.votacao_email_verificado
  add column if not exists pend_tentativas integer not null default 0;
comment on column public.votacao_email_verificado.pend_tentativas is
  'Erros já cometidos com o código pendente (pend_codigo_hash). Zera a cada código novo; com 5, o código deixa de valer e é preciso pedir outro (R-2).';

-- ── Livro da apuração: tipos novos ───────────────────────────────────────────

alter table public.voto_apuracao_eventos
  add column if not exists detalhe jsonb;
alter table public.voto_apuracao_eventos
  alter column resultado_hash drop not null;
alter table public.voto_apuracao_eventos
  drop constraint if exists voto_apuracao_eventos_tipo_check;
alter table public.voto_apuracao_eventos
  add constraint voto_apuracao_eventos_tipo_check
  check (tipo in ('encerramento', 'reabertura', 'prorrogacao', 'lacre'));
alter table public.voto_apuracao_eventos
  drop constraint if exists voto_apuracao_eventos_motivo_check;
alter table public.voto_apuracao_eventos
  add constraint voto_apuracao_eventos_motivo_check
  check (tipo = 'encerramento' or length(btrim(coalesce(motivo, ''))) >= 5);
alter table public.voto_apuracao_eventos
  drop constraint if exists voto_apuracao_eventos_hash_check;
alter table public.voto_apuracao_eventos
  add constraint voto_apuracao_eventos_hash_check
  check (tipo in ('prorrogacao', 'lacre') or resultado_hash is not null);

comment on table public.voto_apuracao_eventos is
  'Livro da apuração (dossiê de auditoria C-2, R-5, R-6): cada encerramento e reabertura (com o resultado congelado e o SHA-256 dele; no encerramento, também a conferência C-5), cada prorrogação da assembleia (de/para do término e da rodada) e cada ressalva de lacre da urna física, com quem, quando e motivo. Só acrescenta: o banco recusa alterar ou apagar. Escrito só pelos triggers de voto_assembleias e voto_apuracao_urna. Não guarda voto de ninguém. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.voto_apuracao_eventos.tipo is 'encerramento, reabertura, prorrogacao ou lacre.';
comment on column public.voto_apuracao_eventos.motivo is 'Por que a apuração foi reaberta, por que a assembleia foi prorrogada, ou a justificativa do apurador para o lacre não atestado (obrigatório, ao menos 5 caracteres). Nulo no encerramento.';
comment on column public.voto_apuracao_eventos.usuario_id is 'Usuário do painel que encerrou, reabriu ou prorrogou (nulo em encerramento feito fora do painel e no evento de lacre, que é do apurador: ver detalhe). [lgpd:identificacao]';
comment on column public.voto_apuracao_eventos.resultado_hash is 'SHA-256 do texto canônico desse resultado (voto_resultado_texto). Nulo nos eventos de prorrogação e de lacre, que não mexem no resultado.';
comment on column public.voto_apuracao_eventos.detalhe is 'Dados do evento que não são resultado. Prorrogação: {numero, termino_de, termino_para, rodada_de, rodada_para} (rodada_* só quando a rodada foi estendida). Lacre: {urna_id, urna, apurador_id, lacres_ok}.';

-- ── R-5. Prorrogação: limite, rodada e livro ─────────────────────────────────

create or replace function public.voto_assembleias_apuracao_janela()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  c_max_prorrogacoes constant integer := 3;
  c_max_dias constant integer := 30;
  v_inicio timestamptz;
  v_rod_termino date;
  v_rod_emp uuid;
  v_fim_atual timestamptz;
  v_fim_novo timestamptz;
  v_feitas integer;
  v_rodada jsonb := '{}'::jsonb;
begin
  if new.data_termino is not distinct from old.data_termino
     and new.hora_termino is not distinct from old.hora_termino then
    return new;
  end if;
  if old.bubble_id is not null then
    return new;
  end if;
  -- Ainda não começou: é edição comum (a aplicação valida a janela).
  v_inicio := case when old.data_inicio is null then null
                   else (old.data_inicio + coalesce(old.hora_inicio, time '00:00'))
                        at time zone 'America/Sao_Paulo' end;
  if v_inicio is not null and now() < v_inicio then
    return new;
  end if;

  -- Já começou: só por prorrogação.
  if coalesce(old.apuracao_encerrada, false) then
    raise exception 'A apuração desta assembleia já foi encerrada. Reabra a apuração antes de prorrogar.'
      using errcode = 'check_violation';
  end if;
  if length(btrim(coalesce(new.apuracao_motivo, ''))) < 5 or new.apuracao_por is null then
    raise exception 'A assembleia já começou: o término só muda por prorrogação, com motivo (ao menos 5 caracteres) e quem prorroga.'
      using errcode = 'check_violation';
  end if;
  if new.data_termino is null then
    raise exception 'Informe a nova data de término.' using errcode = 'check_violation';
  end if;

  if old.rod_assembleia_id is not null then
    select r.termino, r.emp_proprietaria_id into v_rod_termino, v_rod_emp
      from public.voto_rod_assembleias r
     where r.id = old.rod_assembleia_id
       for update;
  end if;
  v_fim_atual := case
    when old.data_termino is not null then
      (old.data_termino + coalesce(old.hora_termino, time '23:59:59')) at time zone 'America/Sao_Paulo'
    when v_rod_termino is not null then
      (v_rod_termino + time '23:59:59') at time zone 'America/Sao_Paulo'
  end;
  v_fim_novo := (new.data_termino + coalesce(new.hora_termino, time '23:59:59')) at time zone 'America/Sao_Paulo';
  if v_fim_atual is not null and v_fim_novo <= v_fim_atual then
    raise exception 'O novo término precisa ser depois do término atual.' using errcode = 'check_violation';
  end if;
  if v_fim_novo <= now() then
    raise exception 'O novo término precisa ser no futuro.' using errcode = 'check_violation';
  end if;
  if v_fim_atual is not null and v_fim_novo > greatest(v_fim_atual, now()) + make_interval(days => c_max_dias) then
    raise exception 'Cada prorrogação estende no máximo % dias além do término atual.', c_max_dias
      using errcode = 'check_violation';
  end if;
  select count(*)::int into v_feitas
    from public.voto_apuracao_eventos e
   where e.assembleia_id = old.id and e.tipo = 'prorrogacao';
  if v_feitas >= c_max_prorrogacoes then
    raise exception 'Esta assembleia já foi prorrogada % vezes, o limite.', c_max_prorrogacoes
      using errcode = 'check_violation';
  end if;

  -- A janela da assembleia cabe na rodada (VOT-03): estende a rodada aqui,
  -- na mesma transação, e registra.
  if v_rod_termino is not null and new.data_termino > v_rod_termino then
    if v_rod_emp is distinct from old.emp_proprietaria_id then
      raise exception 'Rodada de outra entidade.' using errcode = 'check_violation';
    end if;
    update public.voto_rod_assembleias
       set termino = new.data_termino
     where id = old.rod_assembleia_id;
    v_rodada := jsonb_build_object('rodada_de', v_rod_termino, 'rodada_para', new.data_termino);
  end if;

  insert into public.voto_apuracao_eventos
    (emp_proprietaria_id, assembleia_id, tipo, motivo, usuario_id, resultado, resultado_hash, detalhe)
  values (old.emp_proprietaria_id, old.id, 'prorrogacao', btrim(new.apuracao_motivo), new.apuracao_por,
          '[]'::jsonb, null,
          jsonb_build_object(
            'numero', v_feitas + 1,
            'termino_de', to_char(v_fim_atual at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'),
            'termino_para', to_char(v_fim_novo at time zone 'America/Sao_Paulo', 'YYYY-MM-DD HH24:MI'))
          || v_rodada);
  return new;
end
$$;
comment on function public.voto_assembleias_apuracao_janela() is
  'Prorrogação da assembleia (R-5): depois do início, o término só muda com motivo e usuário, apuração aberta, para depois do atual e do agora, até 30 dias além e no máximo 3 vezes; estende a rodada quando preciso e registra cada prorrogação no livro da apuração. Assembleias do Bubble ficam de fora.';
revoke all on function public.voto_assembleias_apuracao_janela() from public, anon, authenticated, service_role;

drop trigger if exists voto_assembleias_apuracao_janela on public.voto_assembleias;
create trigger voto_assembleias_apuracao_janela
  before update of data_termino, hora_termino on public.voto_assembleias
  for each row execute function public.voto_assembleias_apuracao_janela();

-- ── R-6. Urna física ─────────────────────────────────────────────────────────

alter table public.voto_urna_lacres
  add column if not exists anulado_em timestamp with time zone;
alter table public.voto_urna_lacres
  add column if not exists anulado_motivo text;
alter table public.voto_urna_lacres
  add column if not exists anulado_por uuid;
comment on column public.voto_urna_lacres.anulado_em is
  'Quando o registro do lacre foi anulado (lançado errado). O lacre não se apaga: anulado, continua no histórico e sai das conferências (R-6).';
comment on column public.voto_urna_lacres.anulado_motivo is
  'Por que o registro do lacre foi anulado (ao menos 5 caracteres).';
comment on column public.voto_urna_lacres.anulado_por is
  'Usuário do painel que anulou o registro do lacre. [lgpd:identificacao]';

create or replace function public.voto_urna_lacres_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and old.anulado_em is null
     and new.anulado_em is not null
     and new.anulado_por is not null
     and length(btrim(coalesce(new.anulado_motivo, ''))) >= 5
     and (to_jsonb(new) - array['anulado_em', 'anulado_motivo', 'anulado_por'])
         = (to_jsonb(old) - array['anulado_em', 'anulado_motivo', 'anulado_por'])
  then
    return new;
  end if;
  raise exception 'O registro de lacre não pode ser alterado nem apagado (%). Para corrigir um lançamento errado, anule-o com motivo.', lower(tg_op)
    using errcode = 'check_violation';
end
$$;
comment on function public.voto_urna_lacres_imutavel() is
  'Lacres da urna (R-6): recusa DELETE, TRUNCATE e UPDATE; só deixa anular, uma vez, com motivo e usuário.';
revoke all on function public.voto_urna_lacres_imutavel() from public, anon, authenticated, service_role;

drop trigger if exists voto_urna_lacres_imutavel on public.voto_urna_lacres;
create trigger voto_urna_lacres_imutavel
  before update or delete on public.voto_urna_lacres
  for each row execute function public.voto_urna_lacres_imutavel();
drop trigger if exists voto_urna_lacres_imutavel_truncate on public.voto_urna_lacres;
create trigger voto_urna_lacres_imutavel_truncate
  before truncate on public.voto_urna_lacres
  for each statement execute function public.voto_urna_lacres_imutavel();

-- Sessão de apuração da urna: lacre atestado ou justificado; concluída, trava.
create or replace function public.voto_apuracao_urna_travas()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'A apuração das urnas não pode ser apagada em massa.' using errcode = 'check_violation';
  end if;
  if tg_op in ('UPDATE', 'DELETE') and old.status = 'concluida' then
    raise exception 'A apuração desta urna foi concluída: a sessão e a contagem não mudam mais (%).', lower(tg_op)
      using errcode = 'check_violation';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if new.lacres_ok is not true and length(btrim(coalesce(new.lacres_observacao, ''))) < 10 then
    raise exception 'Sem atestar os lacres, descreva a ressalva (ao menos 10 caracteres): ela vai para o livro da apuração.'
      using errcode = 'check_violation';
  end if;
  return new;
end
$$;
comment on function public.voto_apuracao_urna_travas() is
  'Apuração da urna física (R-6): lacre não atestado exige justificativa; sessão concluída não muda nem se apaga; TRUNCATE recusado.';
revoke all on function public.voto_apuracao_urna_travas() from public, anon, authenticated, service_role;

drop trigger if exists voto_apuracao_urna_travas on public.voto_apuracao_urna;
create trigger voto_apuracao_urna_travas
  before insert or update or delete on public.voto_apuracao_urna
  for each row execute function public.voto_apuracao_urna_travas();
drop trigger if exists voto_apuracao_urna_travas_truncate on public.voto_apuracao_urna;
create trigger voto_apuracao_urna_travas_truncate
  before truncate on public.voto_apuracao_urna
  for each statement execute function public.voto_apuracao_urna_travas();

-- A ressalva do lacre vai para o livro da apuração da assembleia da urna.
-- SECURITY DEFINER: o apurador (papel authenticated) não escreve no livro.
create or replace function public.voto_apuracao_urna_livro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assembleia uuid;
  v_nome text;
begin
  if new.lacres_ok is true then
    return null;
  end if;
  if tg_op = 'UPDATE'
     and old.lacres_ok is not distinct from new.lacres_ok
     and old.lacres_observacao is not distinct from new.lacres_observacao then
    return null;
  end if;
  select u.assembleia_id, u.nome into v_assembleia, v_nome
    from public.voto_urnas u where u.id = new.urna_id;
  if v_assembleia is null then
    return null;
  end if;
  insert into public.voto_apuracao_eventos
    (emp_proprietaria_id, assembleia_id, tipo, motivo, resultado, resultado_hash, detalhe)
  values (new.emp_proprietaria_id, v_assembleia, 'lacre', btrim(new.lacres_observacao), '[]'::jsonb, null,
          jsonb_build_object('urna_id', new.urna_id, 'urna', v_nome,
                             'apurador_id', new.apurador_id, 'lacres_ok', new.lacres_ok));
  return null;
end
$$;
comment on function public.voto_apuracao_urna_livro() is
  'Apuração da urna física (R-6): grava no livro da apuração cada ressalva de lacre (lacre não atestado e a justificativa do apurador).';
revoke all on function public.voto_apuracao_urna_livro() from public, anon, authenticated, service_role;

drop trigger if exists voto_apuracao_urna_livro on public.voto_apuracao_urna;
create trigger voto_apuracao_urna_livro
  after insert or update of lacres_ok, lacres_observacao on public.voto_apuracao_urna
  for each row execute function public.voto_apuracao_urna_livro();

-- Contagem: só em sessão aberta e com lacre atestado ou justificado.
create or replace function public.voto_apuracao_contagem_travas()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
  v_ok boolean;
  v_obs text;
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'A contagem das urnas não pode ser apagada em massa.' using errcode = 'check_violation';
  end if;
  select s.status, s.lacres_ok, s.lacres_observacao into v_status, v_ok, v_obs
    from public.voto_apuracao_urna s
   where s.id = case when tg_op = 'DELETE' then old.apuracao_urna_id else new.apuracao_urna_id end;
  if v_status = 'concluida' then
    raise exception 'A apuração desta urna foi concluída: a contagem não muda mais (%).', lower(tg_op)
      using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.apuracao_urna_id is distinct from new.apuracao_urna_id
     and exists (select 1 from public.voto_apuracao_urna s
                  where s.id = old.apuracao_urna_id and s.status = 'concluida') then
    raise exception 'A apuração desta urna foi concluída: a contagem não muda mais (update).'
      using errcode = 'check_violation';
  end if;
  if tg_op <> 'DELETE' and v_status is not null
     and v_ok is not true and length(btrim(coalesce(v_obs, ''))) < 10 then
    raise exception 'Lacre não atestado e sem justificativa: a contagem desta urna está bloqueada.'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
comment on function public.voto_apuracao_contagem_travas() is
  'Contagem da urna física (R-6): recusa gravar, alterar ou apagar a contagem de sessão concluída ou de sessão com lacre não atestado e sem justificativa; TRUNCATE recusado.';
revoke all on function public.voto_apuracao_contagem_travas() from public, anon, authenticated, service_role;

drop trigger if exists voto_apuracao_contagem_travas on public.voto_apuracao_contagem;
create trigger voto_apuracao_contagem_travas
  before insert or update or delete on public.voto_apuracao_contagem
  for each row execute function public.voto_apuracao_contagem_travas();
drop trigger if exists voto_apuracao_contagem_travas_truncate on public.voto_apuracao_contagem;
create trigger voto_apuracao_contagem_travas_truncate
  before truncate on public.voto_apuracao_contagem
  for each statement execute function public.voto_apuracao_contagem_travas();
