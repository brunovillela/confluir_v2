-- Confluir — Sigilo dos votos legados do Bubble (achado da Onda A4,
-- docs/plano-documentacao.md)
--
-- POR QUÊ: 6.895 registros de voto_online, vindos do Bubble (51 assembleias
-- encerradas entre 05/06/2025 e 04/06/2026, mais 106 votos sem assembleia),
-- guardavam eleitor_id → usuarios, ou seja, o conteúdo do voto ligado ao
-- eleitor. Os votos do sistema novo já nascem sem eleitor_id. Essas
-- assembleias não têm linhas em voto_assembleias_aptos: o eleitor_id era o
-- único registro de QUEM participou. A entidade confirmou (18/10/2026) que
-- as votações estão homologadas e sem impugnação.
--
-- COMO, numa transação:
--   1. voto_participacao_legado: uma linha por (rodada, assembleia, eleitor),
--      sem resposta, pergunta nem hora. Guarda a participação, não o voto.
--      Tabela própria (e não voto_assembleias_aptos) para não acionar
--      avisos, comprovantes e telas do sistema novo.
--   2. Zera voto_online.eleitor_id. A contagem dos resultados não muda (o
--      código conta por resposta, nunca lê eleitor_id).
--   3. CHECK (eleitor_id is null) em voto_online: daqui em diante nenhum voto
--      pode voltar a ser gravado ligado a uma pessoa.
-- Aborta se o número de votos ligados não for o conferido (6.895).

do $$
declare
  ligados int;
begin
  select count(*) into ligados from public.voto_online where eleitor_id is not null;
  if ligados not in (0, 6895) then
    raise exception 'voto_online tem % votos com eleitor_id; esperado 6895. Conferir antes de aplicar.', ligados;
  end if;
end $$;

-- 1. Participação legada -----------------------------------------------------
create table if not exists public.voto_participacao_legado (
  id                  uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa (id),
  rod_assembleia_id   uuid references public.voto_rod_assembleias (id),
  assembleia_id       uuid references public.voto_assembleias (id),
  eleitor_id          uuid not null references public.usuarios (id),
  origem              text not null default 'bubble',
  created_at          timestamptz not null default now(),
  constraint voto_participacao_legado_unica
    unique nulls not distinct (emp_proprietaria_id, rod_assembleia_id, assembleia_id, eleitor_id)
);

create index if not exists voto_participacao_legado_assembleia_idx
  on public.voto_participacao_legado (emp_proprietaria_id, assembleia_id);
create index if not exists voto_participacao_legado_eleitor_idx
  on public.voto_participacao_legado (eleitor_id);

alter table public.voto_participacao_legado enable row level security;

drop policy if exists tenant_isolation on public.voto_participacao_legado;
create policy tenant_isolation on public.voto_participacao_legado
  to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

drop trigger if exists set_emp_from_jwt on public.voto_participacao_legado;
create trigger set_emp_from_jwt
  before insert on public.voto_participacao_legado
  for each row execute function public.set_emp_from_jwt();

comment on table public.voto_participacao_legado is
  'Quem participou das votações migradas do Bubble (uma linha por rodada, assembleia e eleitor), separado do conteúdo do voto, que fica anônimo em voto_online. Criada em 18/10/2026 ao zerar voto_online.eleitor_id. [lgpd:identificacao,sensivel_sindical|titulares:eleitores]';
comment on column public.voto_participacao_legado.eleitor_id is
  'Usuário que votou. Revela participação, nunca o voto. [lgpd:sensivel_sindical]';

insert into public.voto_participacao_legado (emp_proprietaria_id, rod_assembleia_id, assembleia_id, eleitor_id)
select distinct emp_proprietaria_id, rod_assembleia_id, assembleia_id, eleitor_id
  from public.voto_online
 where eleitor_id is not null
on conflict on constraint voto_participacao_legado_unica do nothing;

-- 2. Voto anônimo --------------------------------------------------------------
update public.voto_online set eleitor_id = null where eleitor_id is not null;

-- 3. Trava para o futuro -------------------------------------------------------
alter table public.voto_online drop constraint if exists voto_online_sem_eleitor;
alter table public.voto_online
  add constraint voto_online_sem_eleitor check (eleitor_id is null);

drop index if exists public.idx_voto_online_rodada_eleitor;

comment on table public.voto_online is
  'Voto individual por pergunta (online, portal, urna digital ou com mesário). O voto NÃO é ligado à pessoa: eleitor_id é sempre nulo (CHECK voto_online_sem_eleitor), mesario_id nulo e hora truncada. Exceção: voto em separado aponta em_separado_id até a apuração. A participação dos votos legados do Bubble está em voto_participacao_legado. [lgpd:sensivel_sindical|titulares:eleitores]';
comment on column public.voto_online.eleitor_id is
  'Sempre nulo (CHECK voto_online_sem_eleitor). Mantida só por compatibilidade; a participação legada está em voto_participacao_legado.';
