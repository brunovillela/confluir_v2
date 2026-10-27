-- Confluir — Oposição: integridade antes do processo grande (onda 0, 27/10/2026)
--
-- POR QUÊ: o pente fino de 27/10 (docs/avaliacao-oposicao-2026-10.md) achou
-- que, com milhares de trabalhadores ao mesmo tempo, (1) dois podiam receber o
-- mesmo protocolo (max+1 sem trava); (2) o mesmo CPF podia registrar duas
-- oposições na campanha (nada no banco impedia); (3) o comprovante lia a
-- declaração ATUAL da campanha, não a que a pessoa aceitou; (4) a trilha de
-- auditoria não dizia quem avaliou, podia ser alterada e sumia junto com a
-- oposição (ON DELETE CASCADE).
--
-- COMO:
--  • cpf_digitos (gerada) + unique (campanha, cpf_digitos) só nas linhas
--    NOVAS (bubble_id nulo): o legado do Bubble tem 261 CPFs repetidos e fica
--    como está. Uma linha por pessoa e campanha — quem desistiu e volta tem a
--    própria linha atualizada (o fluxo já é assim).
--  • unique (campanha, protocolo) e o contador atômico oposicao_protocolos +
--    oposicao_proximo_protocolo(): update … returning na mesma transação.
--  • o ato fica gravado no opositor: declaração aceita (texto + hash sha256),
--    modo de formalização e fim do prazo vigentes, e quando a carta chegou.
--  • oposicao_eventos: usuario_id (quem da entidade agiu), campanha_id (eventos
--    da campanha: edição, perguntas, fontes), opositor_id opcional; imutável
--    (trigger recusa UPDATE/DELETE, salvo o expurgo legal com
--    confluir.oposicao_expurgo = 'on' na transação — RT07: vigência + 5 anos);
--    FK sem cascade (apagar a oposição não apaga a prova).
--  • auditoria genérica (registrar_auditoria) nas tabelas da oposição.
-- Idempotente.

-- ── 1. CPF normalizado e uma oposição por pessoa e campanha ─────────────────
alter table public.oposicao_opositor
  add column if not exists cpf_digitos text
    generated always as (nullif(regexp_replace(coalesce(cpf, ''), '\D', '', 'g'), '')) stored;

comment on column public.oposicao_opositor.cpf_digitos is 'CPF só com dígitos (gerada de cpf): base da unicidade por campanha e da busca. [lgpd:identificacao]';

create unique index if not exists oposicao_opositor_campanha_cpf_key
  on public.oposicao_opositor (campanha_id, cpf_digitos)
  where bubble_id is null and cpf_digitos is not null;

create unique index if not exists oposicao_opositor_campanha_protocolo_key
  on public.oposicao_opositor (campanha_id, protocolo)
  where protocolo is not null;

create index if not exists oposicao_opositor_campanha_situacao_idx
  on public.oposicao_opositor (campanha_id, situacao);

-- ── 2. Protocolo atômico por campanha ───────────────────────────────────────
create table if not exists public.oposicao_protocolos (
  campanha_id uuid primary key references public.oposicao_campanha(id) on delete restrict,
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  ultimo integer not null check (ultimo >= 0)
);

alter table public.oposicao_protocolos enable row level security;
drop policy if exists tenant_isolation on public.oposicao_protocolos;
create policy tenant_isolation on public.oposicao_protocolos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.oposicao_protocolos from public, anon;
grant select on table public.oposicao_protocolos to authenticated;
grant all on table public.oposicao_protocolos to service_role;

comment on table public.oposicao_protocolos is 'Último protocolo emitido por campanha de oposição — contador atômico (oposicao_proximo_protocolo). [lgpd:nenhum]';

create or replace function public.oposicao_proximo_protocolo(p_campanha uuid, p_emp uuid)
returns integer
language plpgsql
set search_path = public
as $$
declare
  v integer;
begin
  -- Primeira vez: parte do maior protocolo já gravado na campanha.
  insert into public.oposicao_protocolos (campanha_id, emp_proprietaria_id, ultimo)
  select c.id, c.emp_proprietaria_id,
         coalesce((select max(o.protocolo) from public.oposicao_opositor o where o.campanha_id = c.id), 0) + 1
    from public.oposicao_campanha c
   where c.id = p_campanha and c.emp_proprietaria_id = p_emp
  on conflict (campanha_id) do update set ultimo = public.oposicao_protocolos.ultimo + 1
  returning ultimo into v;
  if v is null then
    raise exception 'Campanha de oposição não encontrada.';
  end if;
  return v;
end;
$$;

revoke execute on function public.oposicao_proximo_protocolo(uuid, uuid) from public, anon, authenticated;
grant execute on function public.oposicao_proximo_protocolo(uuid, uuid) to service_role;

comment on function public.oposicao_proximo_protocolo(uuid, uuid) is 'Próximo protocolo da campanha, sem corrida (linha do contador travada pelo próprio upsert).';

-- ── 3. O ato fica gravado no opositor ───────────────────────────────────────
alter table public.oposicao_opositor
  add column if not exists declaracao_aceita text,
  add column if not exists declaracao_hash text,
  add column if not exists modo_formalizacao_ato text,
  add column if not exists prazo_fim_ato date,
  add column if not exists documento_enviado_em timestamptz;

comment on column public.oposicao_opositor.declaracao_aceita is 'Texto da declaração exatamente como a pessoa aceitou ao confirmar (o comprovante e a carta usam este, não o atual da campanha). [lgpd:sensivel_sindical]';
comment on column public.oposicao_opositor.declaracao_hash is 'sha256 do texto aceito, para conferir que não mudou.';
comment on column public.oposicao_opositor.modo_formalizacao_ato is 'Modo de formalização da campanha no momento da confirmação (tela, assinatura, híbrido).';
comment on column public.oposicao_opositor.prazo_fim_ato is 'Fim do prazo da campanha no momento da confirmação.';
comment on column public.oposicao_opositor.documento_enviado_em is 'Quando chegou a primeira carta assinada (compara com o prazo na avaliação). [lgpd:sensivel_sindical]';

-- ── 4. Trilha: autor, eventos da campanha, imutável, sem cascade ────────────
alter table public.oposicao_eventos
  add column if not exists usuario_id uuid references public.usuarios(id),
  add column if not exists campanha_id uuid references public.oposicao_campanha(id) on delete restrict;

comment on column public.oposicao_eventos.usuario_id is 'Quem da entidade fez a ação (avaliação, edição da campanha); nulo = o próprio trabalhador ou o sistema. [lgpd:identificacao]';
comment on column public.oposicao_eventos.campanha_id is 'Campanha do evento — preenchida nos eventos da campanha (edição, fontes, perguntas), em que opositor_id é nulo.';

create index if not exists oposicao_eventos_campanha_idx on public.oposicao_eventos (campanha_id, created_at);

alter table public.oposicao_eventos drop constraint if exists oposicao_eventos_opositor_id_fkey;
alter table public.oposicao_eventos
  add constraint oposicao_eventos_opositor_id_fkey
  foreign key (opositor_id) references public.oposicao_opositor(id) on delete restrict;

create or replace function public.oposicao_eventos_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Expurgo legal (RT07): a transação que elimina declara a intenção.
  if coalesce(current_setting('confluir.oposicao_expurgo', true), '') = 'on' then
    return coalesce(old, new);
  end if;
  raise exception 'A trilha da oposição não pode ser alterada nem apagada.';
end;
$$;

drop trigger if exists oposicao_eventos_imutavel on public.oposicao_eventos;
create trigger oposicao_eventos_imutavel
  before update or delete on public.oposicao_eventos
  for each row execute function public.oposicao_eventos_imutavel();

-- ── 5. Auditoria genérica nas tabelas da oposição ───────────────────────────
drop trigger if exists auditoria_registrar on public.oposicao_opositor;
create trigger auditoria_registrar after update or delete on public.oposicao_opositor
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria_registrar on public.oposicao_campanha;
create trigger auditoria_registrar after insert or update or delete on public.oposicao_campanha
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria_registrar on public.oposicao_campanha_fontes;
create trigger auditoria_registrar after insert or update or delete on public.oposicao_campanha_fontes
  for each row execute function public.registrar_auditoria();
drop trigger if exists auditoria_registrar on public.oposicao_perguntas;
create trigger auditoria_registrar after insert or update or delete on public.oposicao_perguntas
  for each row execute function public.registrar_auditoria();
