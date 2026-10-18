-- Confluir — Hora do voto truncada também em updated_at (achado da B3,
-- RIPD da votação, docs/lgpd/ripd-votacao.md)
--
-- POR QUÊ: o sigilo do voto depende de voto_online não guardar nada que o
-- ligue ao eleitor. O código trunca created_at para a hora cheia
-- (horaDoVotoSecreto), mas a coluna updated_at tinha DEFAULT now() e nenhum
-- insert a preenchia: cada voto nascia com a hora EXATA, a mesma (por
-- milissegundos) de voto_assembleias_aptos.hora_voto. Conferido em
-- 18/10/2026: 1.050 dos 1.121 votos do sistema novo podiam ser religados a
-- um único eleitor comparando as duas horas.
--
-- COMO:
--   1. created_at truncado para o MÊS e updated_at = created_at em todos os
--      votos (34 votos anteriores ao truncamento de 03/10 ainda tinham a hora
--      exata em created_at);
--   2. trigger BEFORE INSERT OR UPDATE que trunca created_at para o mês e
--      iguala updated_at: o banco garante o sigilo mesmo que um caminho novo
--      de gravação esqueça de truncar (inclusive o voto em separado, que
--      gravava a hora exata);
--   3. sem DEFAULT now() em updated_at.
-- POR QUE MÊS E NÃO HORA: medido em 18/10/2026, com a hora cheia 25 eleitores
-- eram os únicos a votar na sua faixa de hora da rodada (o voto deles
-- continuava dedutível); por dia, 2; por mês, só a rodada com um único
-- votante, cujo voto o próprio resultado já revela. O voto não precisa de
-- hora: a contagem só acontece após o encerramento e nada lê esse campo.
-- Não muda contagem nem resultado de nenhuma votação.

create or replace function public.voto_online_hora_secreta()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.created_at := date_trunc('month', coalesce(new.created_at, now()));
  new.updated_at := new.created_at;
  return new;
end
$$;

comment on function public.voto_online_hora_secreta() is
  'Sigilo do voto: trunca voto_online.created_at para o primeiro instante do mês e iguala updated_at, para nenhuma hora exata permitir cruzar o voto com voto_assembleias_aptos.hora_voto.';

revoke all on function public.voto_online_hora_secreta() from public, anon, authenticated;

alter table public.voto_online alter column updated_at drop default;

update public.voto_online
   set created_at = date_trunc('month', created_at),
       updated_at = date_trunc('month', created_at)
 where created_at <> date_trunc('month', created_at)
    or updated_at is distinct from date_trunc('month', created_at);

drop trigger if exists voto_online_hora_secreta on public.voto_online;
create trigger voto_online_hora_secreta
  before insert or update on public.voto_online
  for each row execute function public.voto_online_hora_secreta();

comment on column public.voto_online.updated_at is
  'Sempre igual a created_at (início do mês), garantido pelo trigger voto_online_hora_secreta. Nunca a hora exata do voto.';
comment on column public.voto_online.created_at is
  'Data do voto truncada para o início do mês (trigger voto_online_hora_secreta). A hora exata fica só na participação (voto_assembleias_aptos.hora_voto), nunca junto do voto.';
