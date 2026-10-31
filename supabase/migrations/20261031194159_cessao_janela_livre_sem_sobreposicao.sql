-- POR QUÊ: Bruno, 31/10/2026 — em "Quando pode ser cedido", faixa de horário
-- livre não pode cruzar outra faixa livre do mesmo espaço no mesmo dia (o
-- Teatro tinha o "Dia inteiro" e os três turnos por cima; limpo em 31/10).
-- O servidor já recusa (janelaConflitante, que também cobre livre × slots);
-- o banco garante livre × livre contra gravação por fora da tela.
-- COMO: exclusion constraint com btree_gist. Encostar não é cruzar: o
-- intervalo é [início, término). Idempotente.

create extension if not exists btree_gist with schema extensions;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ex_cessao_janela_livre_sobreposta'
  ) then
    alter table public.cessao_espaco_janelas
      add constraint ex_cessao_janela_livre_sobreposta
      exclude using gist (
        espaco_id with =,
        dia_semana with =,
        tsrange('2000-01-01'::date + hora_inicio, '2000-01-01'::date + hora_termino, '[)') with &&
      )
      where (modo = 'livre');
  end if;
end
$$;

comment on constraint ex_cessao_janela_livre_sobreposta on public.cessao_espaco_janelas is
  'Faixa de horário livre não cruza outra faixa livre do mesmo espaço no mesmo dia (31/10/2026).';
