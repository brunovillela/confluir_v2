-- Confluir — segundo turno na jornada de trabalho (intervalo intrajornada)
--
-- POR QUÊ: a jornada guardava um só horário por dia (início e fim), sem o
-- intervalo de almoço. A carga semanal saía maior que a real, e não dava
-- para registrar jornadas como 8h–12h e 13h–17h.
--
-- COMO: cada dia de `pessoal_jornada_dias` ganha um segundo turno opcional
-- (`hora_inicio_2`, `hora_fim_2`). Os dois vêm juntos e o segundo turno
-- começa depois do fim do primeiro; o intervalo é o espaço entre os turnos.
-- O alerta de acesso fora do horário só considera os extremos do dia (antes
-- da primeira entrada e depois da última saída), então o intervalo não
-- dispara alerta. Idempotente.

alter table public.pessoal_jornada_dias add column if not exists hora_inicio_2 time;
alter table public.pessoal_jornada_dias add column if not exists hora_fim_2 time;

alter table public.pessoal_jornada_dias drop constraint if exists pessoal_jornada_dias_segundo_turno;
alter table public.pessoal_jornada_dias add constraint pessoal_jornada_dias_segundo_turno check (
  (hora_inicio_2 is null and hora_fim_2 is null)
  or (hora_inicio_2 is not null and hora_fim_2 is not null and hora_inicio_2 > hora_fim and hora_fim_2 > hora_inicio_2)
);

comment on column public.pessoal_jornada_dias.hora_inicio is 'Entrada do primeiro turno do dia. [lgpd:nenhum]';
comment on column public.pessoal_jornada_dias.hora_fim is 'Saída do primeiro turno do dia. [lgpd:nenhum]';
comment on column public.pessoal_jornada_dias.hora_inicio_2 is 'Entrada do segundo turno (volta do intervalo intrajornada); null = dia de turno único. [lgpd:nenhum]';
comment on column public.pessoal_jornada_dias.hora_fim_2 is 'Saída do segundo turno (última saída do dia); null = dia de turno único. [lgpd:nenhum]';
