-- Viagens: permissões para solicitar, para si e para terceiros.
--
-- POR QUÊ: quem pedia viagem era decidido só pelo quadro (funcionário com
-- vínculo em vigor ou diretor em exercício), e pedir por outra pessoa era
-- exclusivo da equipe de Viagens. A entidade quer decidir quem pede e quem
-- pede por terceiros, como uma secretária que organiza as viagens da
-- diretoria sem atender as reservas (03/11/2026).
--
-- COMO: duas chaves em `permissoes`.
--   viagens_solicitar           → pede para si; continua exigindo o quadro,
--                                 que define a conta contábil da viagem
--   viagens_solicitar_terceiros → pede para outro diretor, funcionário ou
--                                 convidado
-- `viagens_gestao` segue independente: atende e lança pela tela da equipe.
-- Ninguém perde o que já fazia: quem está no quadro hoje recebe
-- `viagens_solicitar` (com linha nova em `permissoes` quando não tem), assim
-- como o perfil "Diretoria / Coordenação". Por terceiros começa sem ninguém.
-- Idempotente.

alter table public.permissoes
  add column if not exists viagens_solicitar boolean default false,
  add column if not exists viagens_solicitar_terceiros boolean default false;

comment on column public.permissoes.viagens_solicitar is 'Viagens: solicita passagem e hospedagem para si (exige ser funcionário com vínculo em vigor ou diretor em exercício). [lgpd:nenhum]';
comment on column public.permissoes.viagens_solicitar_terceiros is 'Viagens: solicita passagem e hospedagem para outro diretor, funcionário ou convidado. [lgpd:nenhum]';

with mandato_vigente as (
  select distinct on (m.emp_proprietaria_id) m.id, m.emp_proprietaria_id as emp
  from public.diretoria_mandatos m
  order by
    m.emp_proprietaria_id,
    ((m.data_inicio is null or m.data_inicio <= current_date)
      and (m.data_termino is null or m.data_termino >= current_date)) desc,
    m.data_inicio desc nulls last
),
quadro as (
  select v.trabalhador_id as usuario_id, v.empregador_id as emp
  from public.vinculos_trabalhistas v
  where v.contrato_demissao is null
    and v.trabalhador_id is not null
    and v.empregador_id = v.emp_proprietaria_id
  union
  select i.usuario_id, mv.emp
  from public.diretoria_integrantes i
  join mandato_vigente mv on mv.id = i.mandato_id
  where i.usuario_id is not null
    and i.situacao is distinct from 'excluido'
),
atualizados as (
  update public.permissoes p
  set viagens_solicitar = true
  from quadro q
  where p.usuario_id = q.usuario_id
    and coalesce(p.viagens_solicitar, false) = false
  returning p.usuario_id
)
insert into public.permissoes (usuario_id, emp_proprietaria_id, viagens_solicitar)
select distinct on (q.usuario_id) q.usuario_id, q.emp, true
from quadro q
join public.usuarios u on u.id = q.usuario_id
where not exists (select 1 from public.permissoes p where p.usuario_id = q.usuario_id)
order by q.usuario_id;

insert into public.perfil_permissoes (perfil_id, emp_proprietaria_id, chave)
select pf.id, pf.emp_proprietaria_id, 'viagens_solicitar'
from public.perfis pf
where pf.nome = 'Diretoria / Coordenação'
  and not exists (
    select 1 from public.perfil_permissoes x
    where x.perfil_id = pf.id and x.chave = 'viagens_solicitar'
  );
