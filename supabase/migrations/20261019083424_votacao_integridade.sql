-- Confluir — Integridade da votação no banco (C-1 a C-5 do dossiê de
-- auditoria, docs/votacao/dossie-auditoria.md, seção 6)
--
-- POR QUÊ:
--   O sigilo do voto já estava garantido no banco (CHECK
--   voto_online_sem_eleitor, trigger voto_online_hora_secreta), mas a
--   integridade dependia da aplicação:
--   C-1. voto_online podia ser alterado ou apagado pelo servidor antes do
--        encerramento (a política RLS por entidade permite ALL); a
--        conferência C5 só pegava alteração DEPOIS do encerramento. O
--        resultado congelado (voto_resultado_final) também podia ser
--        regravado com a apuração encerrada.
--   C-2. Reabrir a apuração não deixava trilha (quem, quando, por quê) e o
--        novo encerramento apagava o resultado congelado anterior.
--   C-3. Não havia prova externa do resultado: nada que qualquer pessoa
--        pudesse conferir depois.
--   C-4. "Um voto por CPF na rodada" só existia na aplicação.
--   C-5. A conferência (npm run votacao:auditar) só rodava à mão.
--
-- COMO:
--   C-1. Trigger voto_online_imutavel recusa DELETE, TRUNCATE e UPDATE em
--        voto_online. Única exceção: o desvínculo do voto em separado no
--        encerramento (trigger voto_assembleias_apuracao_desvinculo, migração
--        20261018181729), que só troca em_separado_id para nulo e valido.
--        A exceção exige pg_trigger_depth() > 1, isto é, a mudança vir de
--        dentro de outro trigger: um UPDATE direto, de qualquer papel, é
--        recusado. Trigger voto_resultado_final_congelado recusa mexer no
--        resultado de assembleia com a apuração encerrada (o encerramento
--        grava o resultado antes de marcar a apuração; reabrir libera).
--   C-2. Livro voto_apuracao_eventos (só acrescenta: UPDATE/DELETE/TRUNCATE
--        recusados), escrito pelo trigger voto_assembleias_apuracao_livro em
--        cada encerramento e reabertura, com quem, quando, o resultado
--        congelado naquele momento (jsonb) e o hash dele. A reabertura exige
--        motivo (voto_assembleias.apuracao_motivo, ao menos 5 caracteres) e
--        usuário (apuracao_por) na mesma instrução que desmarca a apuração;
--        os dois campos são parâmetros do movimento e voltam a nulo.
--   C-3. No encerramento o trigger calcula o SHA-256 do texto canônico do
--        resultado (voto_resultado_texto) e grava em
--        voto_assembleias.resultado_hash. Texto canônico: uma linha por
--        registro de voto_resultado_final, "assembleia;pergunta;opção ou
--        branco/nulo;quantidade", ordenadas por pergunta, tipo e opção
--        (ordem de bytes), separadas por \n, sem \n no fim.
--   C-4. Índice único parcial em voto_assembleias_aptos por (rodada, CPF só
--        com dígitos) quando hora_voto está preenchida e o CPF tem 11
--        dígitos. O CPF é normalizado porque a lista guarda CPFs com e sem
--        máscara. Lista legada sem rodada (Bubble) fica de fora (rodada
--        nula não colide). Antes, o único caso
--        existente (tenant demo, "Rodada de teste": a mesma pessoa fictícia
--        votou online e na urna em 29/08, antes da regra de CPF único) vira
--        outra pessoa fictícia, para a contagem continuar batendo.
--   C-5. Função votacao_conferencia(assembleia) com as verificações de
--        scripts/auditar-votacao.mjs (C1–C5 e C6 = hash) no escopo da rodada.
--        O trigger voto_assembleias_conferencia_encerramento a roda ao
--        encerrar e grava o resultado no evento de encerramento (nunca
--        impede o encerramento: FALHA fica registrada). O nome do trigger
--        ordena DEPOIS de voto_assembleias_apuracao_desvinculo (o Postgres
--        dispara triggers do mesmo momento em ordem alfabética), então a
--        conferência já vê os votos em separado desvinculados.
-- Não muda contagem nem resultado de nenhuma votação.

-- ── C-1. voto_online imutável ────────────────────────────────────────────────

create or replace function public.voto_online_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and pg_trigger_depth() > 1
     and old.em_separado_id is not null
     and new.em_separado_id is null
     and (to_jsonb(new) - array['valido', 'em_separado_id', 'created_at', 'updated_at'])
         = (to_jsonb(old) - array['valido', 'em_separado_id', 'created_at', 'updated_at'])
  then
    return new;
  end if;
  raise exception 'Voto registrado não pode ser alterado nem apagado (%).', lower(tg_op)
    using errcode = 'check_violation';
end
$$;
comment on function public.voto_online_imutavel() is
  'Integridade do voto (dossiê de auditoria C-1): recusa UPDATE, DELETE e TRUNCATE em voto_online; só deixa passar o desvínculo do voto em separado feito pelo trigger de encerramento da apuração (em_separado_id → nulo e valido).';
revoke all on function public.voto_online_imutavel() from public, anon, authenticated, service_role;

drop trigger if exists voto_online_imutavel on public.voto_online;
create trigger voto_online_imutavel
  before update or delete on public.voto_online
  for each row execute function public.voto_online_imutavel();

drop trigger if exists voto_online_imutavel_truncate on public.voto_online;
create trigger voto_online_imutavel_truncate
  before truncate on public.voto_online
  for each statement execute function public.voto_online_imutavel();

-- Resultado congelado: só muda com a apuração aberta.
create or replace function public.voto_resultado_final_congelado()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'TRUNCATE' then
    raise exception 'O resultado congelado não pode ser apagado em massa.'
      using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from public.voto_assembleias a
     where a.apuracao_encerrada is true
       and a.id in (
         case when tg_op = 'INSERT' then null else old.assembleia_id end,
         case when tg_op = 'DELETE' then null else new.assembleia_id end)
  ) then
    raise exception 'A apuração desta assembleia está encerrada: o resultado congelado não muda. Reabra a apuração (com motivo) para apurar de novo.'
      using errcode = 'check_violation';
  end if;
  return case when tg_op = 'DELETE' then old else new end;
end
$$;
comment on function public.voto_resultado_final_congelado() is
  'Integridade do resultado (dossiê de auditoria C-1): recusa gravar, alterar ou apagar voto_resultado_final de assembleia com a apuração encerrada.';
revoke all on function public.voto_resultado_final_congelado() from public, anon, authenticated, service_role;

drop trigger if exists voto_resultado_final_congelado on public.voto_resultado_final;
create trigger voto_resultado_final_congelado
  before insert or update or delete on public.voto_resultado_final
  for each row execute function public.voto_resultado_final_congelado();

drop trigger if exists voto_resultado_final_congelado_truncate on public.voto_resultado_final;
create trigger voto_resultado_final_congelado_truncate
  before truncate on public.voto_resultado_final
  for each statement execute function public.voto_resultado_final_congelado();

-- ── C-3. Texto canônico e hash do resultado ──────────────────────────────────

create or replace function public.voto_resultado_texto(p_assembleia_id uuid)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(string_agg(
           r.assembleia_id::text || ';' || r.pergunta_id::text || ';'
             || coalesce(r.opcao_id::text, r.tipo) || ';' || r.quantidade::text,
           E'\n'
           order by r.pergunta_id::text collate "C", r.tipo collate "C",
                    coalesce(r.opcao_id::text, '') collate "C"), '')
    from public.voto_resultado_final r
   where r.assembleia_id = p_assembleia_id
$$;
comment on function public.voto_resultado_texto(uuid) is
  'Texto canônico do resultado congelado de uma assembleia (dossiê C-3): uma linha por registro de voto_resultado_final, "assembleia;pergunta;opção|branco|nulo;quantidade", ordem de bytes por pergunta, tipo e opção, separadas por \n. O SHA-256 dele é voto_assembleias.resultado_hash. Reproduzido em src/lib/votacao-integridade.ts.';
revoke all on function public.voto_resultado_texto(uuid) from public, anon;
grant execute on function public.voto_resultado_texto(uuid) to authenticated, service_role;

alter table public.voto_assembleias
  add column if not exists resultado_hash text;
alter table public.voto_assembleias
  add column if not exists apuracao_motivo text;
alter table public.voto_assembleias
  add column if not exists apuracao_por uuid;
comment on column public.voto_assembleias.resultado_hash is
  'SHA-256 (hex) do texto canônico do resultado congelado (voto_resultado_texto), calculado pelo banco no encerramento da apuração e apagado na reabertura. Publicado na apuração, no relatório e no portal para conferência (dossiê C-3).';
comment on column public.voto_assembleias.apuracao_motivo is
  'Parâmetro do movimento da apuração: o motivo da reabertura, enviado junto com apuracao_encerrada = false. O trigger voto_assembleias_apuracao_livro o copia para voto_apuracao_eventos e o devolve a nulo.';
comment on column public.voto_assembleias.apuracao_por is
  'Parâmetro do movimento da apuração: o usuário que encerra ou reabre. O trigger voto_assembleias_apuracao_livro o copia para voto_apuracao_eventos e o devolve a nulo. [lgpd:identificacao]';

-- Assembleias já encerradas: hash do resultado congelado como está hoje
-- (antes do trigger abaixo, que só deixa o hash mudar no encerramento). Sem
-- evento no livro: o encerramento delas foi antes do livro existir.
update public.voto_assembleias a
   set resultado_hash = encode(sha256(convert_to(public.voto_resultado_texto(a.id), 'UTF8')), 'hex')
 where a.apuracao_encerrada is true
   and a.resultado_hash is null
   and exists (select 1 from public.voto_resultado_final r where r.assembleia_id = a.id);

-- ── C-2. Livro da apuração ───────────────────────────────────────────────────

create table if not exists public.voto_apuracao_eventos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  assembleia_id uuid not null references public.voto_assembleias(id),
  tipo text not null check (tipo in ('encerramento', 'reabertura')),
  motivo text,
  usuario_id uuid,
  resultado jsonb not null default '[]'::jsonb,
  resultado_hash text not null,
  conferencia jsonb,
  created_at timestamp with time zone not null default clock_timestamp(),
  constraint voto_apuracao_eventos_motivo_check
    check (tipo <> 'reabertura' or length(btrim(coalesce(motivo, ''))) >= 5)
);
create index if not exists voto_apuracao_eventos_assembleia_idx
  on public.voto_apuracao_eventos (assembleia_id, created_at);
alter table public.voto_apuracao_eventos enable row level security;
drop policy if exists tenant_isolation on public.voto_apuracao_eventos;
create policy tenant_isolation on public.voto_apuracao_eventos
  using ((emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid))
  with check ((emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'::text))::uuid));
revoke all on table public.voto_apuracao_eventos from public, anon, authenticated, service_role;
grant select on table public.voto_apuracao_eventos to authenticated, service_role;

comment on table public.voto_apuracao_eventos is
  'Livro da apuração (dossiê de auditoria C-2): cada encerramento e reabertura, com quem, quando, motivo (obrigatório na reabertura), o resultado congelado naquele momento e o SHA-256 dele; no encerramento, também a conferência automática (C-5). Só acrescenta: o banco recusa alterar ou apagar. Escrito só pelos triggers de voto_assembleias. Não guarda voto de ninguém. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.voto_apuracao_eventos.tipo is 'encerramento ou reabertura.';
comment on column public.voto_apuracao_eventos.motivo is 'Por que a apuração foi reaberta (obrigatório, ao menos 5 caracteres). Nulo no encerramento.';
comment on column public.voto_apuracao_eventos.usuario_id is 'Usuário do painel que encerrou ou reabriu (nulo em encerramento feito fora do painel). [lgpd:identificacao]';
comment on column public.voto_apuracao_eventos.resultado is 'Resultado congelado (voto_resultado_final) no momento do evento: [{pergunta_id, opcao_id, tipo, quantidade}]. Na reabertura, é o resultado que deixou de valer.';
comment on column public.voto_apuracao_eventos.resultado_hash is 'SHA-256 do texto canônico desse resultado (voto_resultado_texto).';
comment on column public.voto_apuracao_eventos.conferencia is 'Conferência automática no encerramento (votacao_conferencia, C1–C6): {ok, verificacoes: [{id, nome, ok, detalhe}]}. Preenchida uma única vez, no mesmo encerramento.';
comment on column public.voto_apuracao_eventos.created_at is 'Quando a apuração foi encerrada ou reaberta.';

create or replace function public.voto_apuracao_eventos_imutavel()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE'
     and pg_trigger_depth() > 1
     and old.conferencia is null
     and (to_jsonb(new) - 'conferencia') = (to_jsonb(old) - 'conferencia')
  then
    return new;
  end if;
  raise exception 'O livro da apuração não pode ser alterado nem apagado (%).', lower(tg_op)
    using errcode = 'check_violation';
end
$$;
comment on function public.voto_apuracao_eventos_imutavel() is
  'Livro da apuração só acrescenta (dossiê C-2): recusa UPDATE, DELETE e TRUNCATE; só o trigger de encerramento preenche a conferência, uma vez.';
revoke all on function public.voto_apuracao_eventos_imutavel() from public, anon, authenticated, service_role;

drop trigger if exists voto_apuracao_eventos_imutavel on public.voto_apuracao_eventos;
create trigger voto_apuracao_eventos_imutavel
  before update or delete on public.voto_apuracao_eventos
  for each row execute function public.voto_apuracao_eventos_imutavel();
drop trigger if exists voto_apuracao_eventos_imutavel_truncate on public.voto_apuracao_eventos;
create trigger voto_apuracao_eventos_imutavel_truncate
  before truncate on public.voto_apuracao_eventos
  for each statement execute function public.voto_apuracao_eventos_imutavel();

-- Encerramento e reabertura (BEFORE): hash, evento, motivo obrigatório.
-- SECURITY DEFINER: o painel (papel authenticated) não escreve no livro.
create or replace function public.voto_assembleias_apuracao_livro()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_resultado jsonb;
  v_encerrada_antes boolean;
begin
  v_encerrada_antes := tg_op = 'UPDATE' and coalesce(old.apuracao_encerrada, false);

  if tg_op = 'INSERT' then
    new.resultado_hash := null;
  elsif coalesce(new.apuracao_encerrada, false) = v_encerrada_antes then
    -- Sem movimento: o hash só muda pelo encerramento/reabertura.
    new.resultado_hash := old.resultado_hash;
  else
    v_hash := encode(sha256(convert_to(public.voto_resultado_texto(new.id), 'UTF8')), 'hex');
    select coalesce(jsonb_agg(jsonb_build_object(
             'pergunta_id', r.pergunta_id, 'opcao_id', r.opcao_id,
             'tipo', r.tipo, 'quantidade', r.quantidade)
             order by r.pergunta_id::text collate "C", r.tipo collate "C",
                      coalesce(r.opcao_id::text, '') collate "C"), '[]'::jsonb)
      into v_resultado
      from public.voto_resultado_final r
     where r.assembleia_id = new.id;

    if coalesce(new.apuracao_encerrada, false) then
      new.resultado_hash := v_hash;
      insert into public.voto_apuracao_eventos
        (emp_proprietaria_id, assembleia_id, tipo, usuario_id, resultado, resultado_hash)
      values (new.emp_proprietaria_id, new.id, 'encerramento', new.apuracao_por, v_resultado, v_hash);
    else
      if length(btrim(coalesce(new.apuracao_motivo, ''))) < 5 then
        raise exception 'Informe o motivo da reabertura da apuração (ao menos 5 caracteres).'
          using errcode = 'check_violation';
      end if;
      if new.apuracao_por is null then
        raise exception 'A reabertura da apuração precisa identificar quem reabre.'
          using errcode = 'check_violation';
      end if;
      insert into public.voto_apuracao_eventos
        (emp_proprietaria_id, assembleia_id, tipo, motivo, usuario_id, resultado, resultado_hash)
      values (new.emp_proprietaria_id, new.id, 'reabertura', btrim(new.apuracao_motivo),
              new.apuracao_por, v_resultado, v_hash);
      new.resultado_hash := null;
    end if;
  end if;

  new.apuracao_motivo := null;
  new.apuracao_por := null;
  return new;
end
$$;
comment on function public.voto_assembleias_apuracao_livro() is
  'Livro da apuração (dossiê C-2/C-3): no encerramento calcula o hash do resultado congelado e registra o evento; na reabertura exige motivo e usuário e registra o resultado que deixa de valer. Devolve apuracao_motivo e apuracao_por a nulo.';
revoke all on function public.voto_assembleias_apuracao_livro() from public, anon, authenticated, service_role;

drop trigger if exists voto_assembleias_apuracao_livro on public.voto_assembleias;
create trigger voto_assembleias_apuracao_livro
  before insert or update on public.voto_assembleias
  for each row execute function public.voto_assembleias_apuracao_livro();

-- ── C-5. Conferência automática ──────────────────────────────────────────────

create or replace function public.votacao_conferencia(p_assembleia_id uuid)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_emp uuid;
  v_rodada uuid;
  v_ass uuid[];
  v_votantes integer;
  v_part integer;
  v_c2 integer;
  v_com_eleitor integer;
  v_com_hora integer;
  v_sep_ligado integer;
  v_cpf_duplo integer;
  v_compr_rep integer;
  v_encerradas integer;
  v_c5 integer;
  v_hash_total integer;
  v_hash_dif integer;
  v_lista jsonb := '[]'::jsonb;
begin
  select a.emp_proprietaria_id, a.rod_assembleia_id into v_emp, v_rodada
    from public.voto_assembleias a where a.id = p_assembleia_id;
  if v_emp is null then
    return null;
  end if;
  -- Escopo: as assembleias da rodada (ou só esta, no legado sem rodada).
  select array_agg(a.id) into v_ass
    from public.voto_assembleias a
   where a.emp_proprietaria_id = v_emp
     and (a.id = p_assembleia_id or (v_rodada is not null and a.rod_assembleia_id = v_rodada));

  -- C1. Participação × votos: votantes pelos votos = soma, por assembleia, da
  -- pergunta mais votada menos os votos em separado (que não estão na lista).
  if v_rodada is not null then
    select coalesce(sum(greatest(pa.mx - coalesce(s.n, 0), 0)), 0)::int into v_votantes
      from (select assembleia_id, max(n) mx
              from (select v.assembleia_id, v.pergunta_id, count(*) n
                      from public.voto_online v
                     where v.assembleia_id = any (v_ass) and v.bubble_id is null
                     group by 1, 2) pp
             group by 1) pa
      left join (select s.assembleia_id, count(*) n
                   from public.voto_em_separado s
                  where s.assembleia_id = any (v_ass) and s.votou_em is not null
                  group by 1) s on s.assembleia_id = pa.assembleia_id;
    select count(*)::int into v_part
      from public.voto_assembleias_aptos ap
     where ap.rod_assembleia_id = v_rodada
       and ap.hora_voto is not null and ap.presenca_em is null;
    v_lista := v_lista || jsonb_build_object('id', 'C1', 'nome', 'Participação × votos',
      'ok', v_votantes = v_part,
      'detalhe', format('votantes pelos votos %s; participações registradas %s', v_votantes, v_part));
  else
    v_lista := v_lista || jsonb_build_object('id', 'C1', 'nome', 'Participação × votos',
      'ok', true, 'detalhe', 'assembleia sem rodada: não se aplica');
  end if;

  -- C2. Toda pergunta da mesma assembleia com o mesmo total.
  select count(*)::int into v_c2
    from (select assembleia_id
            from (select v.assembleia_id, v.pergunta_id, count(*) n
                    from public.voto_online v
                   where v.assembleia_id = any (v_ass) and v.bubble_id is null
                   group by 1, 2) pp
           group by 1 having min(n) <> max(n)) d;
  v_lista := v_lista || jsonb_build_object('id', 'C2', 'nome', 'Perguntas com o mesmo total',
    'ok', v_c2 = 0, 'detalhe', format('%s assembleia(s) com perguntas desiguais', v_c2));

  -- C3. Sigilo.
  select count(*) filter (where v.eleitor_id is not null)::int,
         count(*) filter (where v.created_at <> date_trunc('month', v.created_at)
                             or v.updated_at is distinct from v.created_at)::int,
         count(*) filter (where v.em_separado_id is not null and a.apuracao_encerrada is true)::int
    into v_com_eleitor, v_com_hora, v_sep_ligado
    from public.voto_online v
    join public.voto_assembleias a on a.id = v.assembleia_id
   where v.assembleia_id = any (v_ass);
  v_lista := v_lista || jsonb_build_object('id', 'C3', 'nome', 'Sigilo: voto sem pessoa e sem hora',
    'ok', v_com_eleitor + v_com_hora + v_sep_ligado = 0,
    'detalhe', format('com eleitor %s; com hora %s; em separado ligado após encerrar %s',
                      v_com_eleitor, v_com_hora, v_sep_ligado));

  -- C4. Unicidade.
  select count(*)::int into v_cpf_duplo
    from (select regexp_replace(ap.cpf, '\D', '', 'g')
            from public.voto_assembleias_aptos ap
           where ap.hora_voto is not null and ap.cpf is not null
             and regexp_replace(ap.cpf, '\D', '', 'g') <> ''
             and (ap.rod_assembleia_id = v_rodada
                  or (v_rodada is null and ap.assembleia_id = p_assembleia_id))
           group by 1 having count(*) > 1) d;
  select count(*)::int into v_compr_rep
    from (select ap.comprovante_codigo
            from public.voto_assembleias_aptos ap
           where ap.comprovante_codigo is not null
             and (ap.rod_assembleia_id = v_rodada
                  or (v_rodada is null and ap.assembleia_id = p_assembleia_id))
           group by 1 having count(*) > 1) d;
  v_lista := v_lista || jsonb_build_object('id', 'C4', 'nome', 'Unicidade: um voto por CPF',
    'ok', v_cpf_duplo + v_compr_rep = 0,
    'detalhe', format('CPF com duas participações %s; comprovante repetido %s', v_cpf_duplo, v_compr_rep));

  -- C5. Resultado congelado = contagem atual (digital válido + urnas físicas).
  select count(*)::int into v_encerradas
    from public.voto_assembleias a
   where a.id = any (v_ass) and a.apuracao_encerrada is true
     and exists (select 1 from public.voto_resultado_final r where r.assembleia_id = a.id);
  with encerradas as (
    select a.id from public.voto_assembleias a
     where a.id = any (v_ass) and a.apuracao_encerrada is true
       and exists (select 1 from public.voto_resultado_final r where r.assembleia_id = a.id)),
  congelado as (
    select r.assembleia_id, r.pergunta_id, r.opcao_id, sum(r.quantidade)::int q
      from public.voto_resultado_final r join encerradas e on e.id = r.assembleia_id
     where r.tipo = 'opcao' group by 1, 2, 3),
  digital as (
    select v.assembleia_id, v.pergunta_id, v.resposta_id opcao_id, count(*)::int q
      from public.voto_online v join encerradas e on e.id = v.assembleia_id
     where coalesce(v.valido, true) group by 1, 2, 3),
  fisico as (
    select u.assembleia_id, c.pergunta_id, c.opcao_id, sum(c.quantidade)::int q
      from public.voto_apuracao_contagem c
      join public.voto_apuracao_urna au on au.id = c.apuracao_urna_id
      join public.voto_urnas u on u.id = au.urna_id
      join encerradas e on e.id = u.assembleia_id
     where c.tipo = 'opcao' group by 1, 2, 3),
  atual as (
    select assembleia_id, pergunta_id, opcao_id, sum(q)::int q
      from (select * from digital union all select * from fisico) t group by 1, 2, 3)
  select count(*)::int into v_c5
    from congelado c
    full join atual a on a.assembleia_id = c.assembleia_id and a.pergunta_id = c.pergunta_id
                     and a.opcao_id is not distinct from c.opcao_id
   where coalesce(c.q, 0) <> coalesce(a.q, 0);
  v_lista := v_lista || jsonb_build_object('id', 'C5', 'nome', 'Resultado congelado = votos atuais',
    'ok', v_c5 = 0,
    'detalhe', format('%s assembleia(s) encerrada(s) com resultado; %s opção(ões) divergente(s)', v_encerradas, v_c5));

  -- C6. Hash publicado = hash do resultado congelado.
  select count(*)::int,
         count(*) filter (where a.resultado_hash is distinct from
           encode(sha256(convert_to(public.voto_resultado_texto(a.id), 'UTF8')), 'hex'))::int
    into v_hash_total, v_hash_dif
    from public.voto_assembleias a
   where a.id = any (v_ass) and a.apuracao_encerrada is true and a.resultado_hash is not null;
  v_lista := v_lista || jsonb_build_object('id', 'C6', 'nome', 'Hash publicado confere',
    'ok', v_hash_dif = 0,
    'detalhe', format('%s assembleia(s) com hash; %s divergente(s)', v_hash_total, v_hash_dif));

  return jsonb_build_object(
    'gerado_em', now(),
    'rodada_id', v_rodada,
    'ok', not exists (select 1 from jsonb_array_elements(v_lista) e where (e ->> 'ok')::boolean is false),
    'verificacoes', v_lista);
end
$$;
comment on function public.votacao_conferencia(uuid) is
  'Conferência da votação no escopo da rodada da assembleia (dossiê C-5): C1 participação × votos, C2 perguntas com o mesmo total, C3 sigilo, C4 unicidade, C5 resultado congelado = votos atuais, C6 hash publicado confere. Só números. Mesmas regras de scripts/auditar-votacao.mjs, que continua sendo a conferência independente.';
revoke all on function public.votacao_conferencia(uuid) from public, anon;
grant execute on function public.votacao_conferencia(uuid) to authenticated, service_role;

create or replace function public.voto_assembleias_conferencia_encerramento()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conf jsonb;
begin
  begin
    v_conf := public.votacao_conferencia(new.id);
  exception when others then
    v_conf := jsonb_build_object('ok', false, 'erro', sqlerrm, 'gerado_em', now());
  end;
  update public.voto_apuracao_eventos e
     set conferencia = v_conf
   where e.id = (select e2.id from public.voto_apuracao_eventos e2
                  where e2.assembleia_id = new.id and e2.tipo = 'encerramento'
                  order by e2.created_at desc limit 1)
     and e.conferencia is null;
  return null;
end
$$;
comment on function public.voto_assembleias_conferencia_encerramento() is
  'Conferência automática no encerramento da apuração (dossiê C-5): roda votacao_conferencia e grava no evento de encerramento. Nunca impede o encerramento.';
revoke all on function public.voto_assembleias_conferencia_encerramento() from public, anon, authenticated, service_role;

drop trigger if exists voto_assembleias_conferencia_encerramento on public.voto_assembleias;
create trigger voto_assembleias_conferencia_encerramento
  after update of apuracao_encerrada on public.voto_assembleias
  for each row
  when (new.apuracao_encerrada is true and old.apuracao_encerrada is distinct from true)
  execute function public.voto_assembleias_conferencia_encerramento();

-- ── C-4. Um voto por CPF na rodada ───────────────────────────────────────────

-- Demo: a mesma pessoa fictícia votou online e na urna da "Rodada de teste"
-- (29/08, antes da regra). A participação da urna passa a outra pessoa
-- fictícia; votos e contagem não mudam.
update public.voto_assembleias_aptos ap
   set cpf = '31840627913',
       nome_completo = 'Renato Alves Pereira'
 where ap.id = 'ea000000-0000-4000-8000-000000000015'
   and ap.emp_proprietaria_id = '11111111-1111-4111-8111-111111111111'
   and exists (
     select 1 from public.voto_assembleias_aptos o
      where o.id = 'ea000000-0000-4000-8000-000000000008'
        and o.rod_assembleia_id = ap.rod_assembleia_id
        and o.hora_voto is not null
        and regexp_replace(o.cpf, '\D', '', 'g') = regexp_replace(ap.cpf, '\D', '', 'g'));

create unique index if not exists voto_aptos_rodada_cpf_votou_idx
  on public.voto_assembleias_aptos (rod_assembleia_id, (regexp_replace(cpf, '\D', '', 'g')))
  where hora_voto is not null and cpf is not null
    and length(regexp_replace(cpf, '\D', '', 'g')) = 11;
comment on index public.voto_aptos_rodada_cpf_votou_idx is
  'Um voto por CPF na rodada (dossiê C-4): duas participações do mesmo CPF (só dígitos) na mesma rodada são recusadas pelo banco. CPF incompleto (placeholder como "0") fica de fora para não barrar eleitores diferentes.';
