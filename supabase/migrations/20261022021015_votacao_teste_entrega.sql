-- Confluir — Votação: teste de entrega antecipado e histórico por domínio (22/10/2026)
--
-- POR QUÊ: na Halliburton (21/10) o link pessoal foi "entregue" ao e-mail
-- corporativo, mas só o robô de segurança da empresa o abriu — e o sindicato
-- só soube no dia, com a votação aberta. A fase 3 do plano
-- (docs/plano-votacao-entrega-preparacao.md) descobre isso DIAS ANTES: um
-- aviso prévio ao e-mail corporativo com o botão "Recebi" (formulário POST,
-- que o robô não envia) mede quem é gente lendo a caixa. E o resultado fica
-- guardado por domínio: a próxima rodada da mesma empresa já nasce avisada.
--
-- COMO:
--  • voto_assembleias_aptos: aviso_previo_em / aviso_previo_erro (o envio do
--    aviso prévio) e recebido_em (a confirmação humana do "Recebi");
--  • voto_rod_assembleias.aviso_previo_dias: envio automático do aviso prévio
--    N dias antes da abertura (null = desligado), pelo tick da votação;
--  • voto_entrega_dominios: uma medição por rodada, domínio e tipo — pelo
--    aviso prévio (confirmaram/avisados) ou pela votação (votos pelo link
--    pessoal/votantes) — com a situação: chega, não chega ou incerto. Só
--    números agregados e o domínio da empresa: sem dado pessoal.
--  • carga inicial do histórico do Sindipetro-NF: SLB (14/10) e Wellbore
--    (20/10) chegam; Halliburton (21/10) não chega.
-- Idempotente.

alter table public.voto_assembleias_aptos
  add column if not exists aviso_previo_em timestamptz,
  add column if not exists aviso_previo_erro text,
  add column if not exists recebido_em timestamptz;

comment on column public.voto_assembleias_aptos.aviso_previo_em is 'Quando saiu o aviso prévio (teste de entrega) ao e-mail corporativo, dias antes da votação; null = pendente. [lgpd:identificacao]';
comment on column public.voto_assembleias_aptos.aviso_previo_erro is 'Aviso prévio não enviado: "sem_email", "duplicado", "preferencia" ou "falha". [lgpd:identificacao]';
comment on column public.voto_assembleias_aptos.recebido_em is 'Quando a pessoa confirmou, pelo botão "Recebi" do aviso prévio, que o e-mail corporativo chegou (formulário: o robô de segurança da empresa não confirma). [lgpd:identificacao]';

alter table public.voto_rod_assembleias
  add column if not exists aviso_previo_dias smallint;

comment on column public.voto_rod_assembleias.aviso_previo_dias is 'Envio automático do aviso prévio (teste de entrega) N dias antes da abertura da votação pela internet; null = desligado.';

create table if not exists public.voto_entrega_dominios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  dominio text not null,
  rodada_id uuid references public.voto_rod_assembleias(id) on delete set null,
  rodada_nome text,
  medida text not null check (medida in ('aviso_previo', 'votacao')),
  medido_em timestamptz not null default now(),
  base integer not null check (base >= 0),
  sucesso integer not null check (sucesso >= 0),
  situacao text not null check (situacao in ('chega', 'nao_chega', 'incerto')),
  observacao text,
  created_at timestamptz not null default now()
);

create unique index if not exists voto_entrega_dominios_medicao_key
  on public.voto_entrega_dominios (emp_proprietaria_id, rodada_id, medida, dominio);
create index if not exists voto_entrega_dominios_dominio_idx
  on public.voto_entrega_dominios (emp_proprietaria_id, dominio, medido_em desc);

alter table public.voto_entrega_dominios enable row level security;
drop policy if exists tenant_isolation on public.voto_entrega_dominios;
create policy tenant_isolation on public.voto_entrega_dominios to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.voto_entrega_dominios;
create trigger set_emp_from_jwt before insert on public.voto_entrega_dominios
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.voto_entrega_dominios from public, anon;
grant select, insert, update, delete on table public.voto_entrega_dominios to authenticated;
grant all on table public.voto_entrega_dominios to service_role;

comment on table public.voto_entrega_dominios is 'Histórico da entrega do e-mail corporativo por domínio de empresa (teste de entrega da fase 3, 22/10/2026): uma medição por rodada — pelo aviso prévio ("Recebi") ou pela votação (votos pelo link pessoal). A próxima rodada da mesma empresa já nasce avisada. Só números agregados e o domínio. [lgpd:nenhum]';
comment on column public.voto_entrega_dominios.dominio is 'Domínio do e-mail corporativo predominante na lista de aptos (ex.: halliburton.com).';
comment on column public.voto_entrega_dominios.medida is '"aviso_previo" = confirmaram o Recebi / avisados; "votacao" = votos pelo link pessoal / votantes com canal registrado.';
comment on column public.voto_entrega_dominios.base is 'Denominador da medição (avisados, ou votantes com canal registrado).';
comment on column public.voto_entrega_dominios.sucesso is 'Numerador (confirmaram o Recebi, ou votaram pelo link pessoal).';
comment on column public.voto_entrega_dominios.situacao is '"chega", "nao_chega" ou "incerto", pela taxa sucesso/base.';

-- Carga inicial (Sindipetro-NF): as medições das votações de outubro.
insert into public.voto_entrega_dominios
  (emp_proprietaria_id, dominio, rodada_id, rodada_nome, medida, medido_em, base, sucesso, situacao, observacao)
select r.emp_proprietaria_id, v.dominio, r.id, r.nome_assembleia, 'votacao', v.medido_em::timestamptz, v.base, v.sucesso, v.situacao, v.observacao
from (values
  ('6581abd9-4911-41b3-9c31-ce3b5cfe428c'::uuid, 'slb.com', '2026-10-15 15:00-03', 703, 557, 'chega',
   'Análise de 16/10: 557 de 703 votaram sem pedir código (link pessoal).'),
  ('a5ef9f5c-c32b-44c2-9d2a-53838c01012c'::uuid, 'wellboreintegrity.com', '2026-10-21 10:00-03', 34, 31, 'chega', null),
  ('ffa14fe7-2944-4678-8fcf-8c0b164c8ef5'::uuid, 'halliburton.com', '2026-10-22 10:00-03', 969, 33, 'nao_chega',
   'Link entregue, mas só o robô de segurança clicou; 927 votos pelo link geral + código.')
) as v(rodada_id, dominio, medido_em, base, sucesso, situacao, observacao)
join public.voto_rod_assembleias r on r.id = v.rodada_id
on conflict (emp_proprietaria_id, rodada_id, medida, dominio) do nothing;
