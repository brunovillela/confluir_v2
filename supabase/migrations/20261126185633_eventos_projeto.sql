-- Evento ligado a projeto; a viagem do evento herda o projeto.
--
-- POR QUÊ: pedido de 26/11/2026. As viagens entraram no gasto do projeto pelo
-- campo Projeto do pedido (20261126171742), mas quem pede a viagem escolhe o
-- EVENTO e esquece o projeto — e a passagem fica fora do gasto. Com o evento
-- ligado ao projeto, a viagem para ele já nasce no projeto certo, inclusive a
-- pedida pelo Telegram.
--
-- COMO:
--  • eventos.projeto_id (opcional, set null).
--  • viagem_herda_projeto_do_evento (BEFORE INSERT/UPDATE OF evento_id): a
--    viagem sem projeto recebe o do evento.
--  • evento_leva_projeto_as_viagens (AFTER UPDATE OF projeto_id): as viagens
--    do evento que estavam no projeto antigo (ou sem projeto) vão para o novo.
--    A viagem que alguém pôs em outro projeto de propósito fica onde está.
--  Idempotente.

alter table public.eventos
  add column if not exists projeto_id uuid references public.projeto(id) on delete set null;
create index if not exists eventos_projeto_idx
  on public.eventos (emp_proprietaria_id, projeto_id) where projeto_id is not null;
comment on column public.eventos.projeto_id is 'Projeto a que o evento pertence (opcional). As viagens pedidas para o evento herdam o projeto. [lgpd:nenhum]';

create or replace function public.viagem_herda_projeto_do_evento()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.projeto_id is null and new.evento_id is not null then
    select e.projeto_id
      into new.projeto_id
      from public.eventos e
     where e.id = new.evento_id
       and e.emp_proprietaria_id = new.emp_proprietaria_id;
  end if;
  return new;
end;
$$;

drop trigger if exists viagem_herda_projeto_do_evento on public.viagens_solicitacoes;
create trigger viagem_herda_projeto_do_evento
  before insert or update of evento_id on public.viagens_solicitacoes
  for each row execute function public.viagem_herda_projeto_do_evento();

create or replace function public.evento_leva_projeto_as_viagens()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.projeto_id is distinct from old.projeto_id then
    update public.viagens_solicitacoes v
       set projeto_id = new.projeto_id
     where v.evento_id = new.id
       and v.emp_proprietaria_id = new.emp_proprietaria_id
       and (v.projeto_id is null or v.projeto_id is not distinct from old.projeto_id);
  end if;
  return null;
end;
$$;

drop trigger if exists evento_leva_projeto_as_viagens on public.eventos;
create trigger evento_leva_projeto_as_viagens
  after update of projeto_id on public.eventos
  for each row execute function public.evento_leva_projeto_as_viagens();

comment on function public.viagem_herda_projeto_do_evento() is 'A viagem sem projeto recebe o projeto do evento dela.';
comment on function public.evento_leva_projeto_as_viagens() is 'Quando o evento muda de projeto, as viagens dele que estavam no projeto antigo (ou sem projeto) vão junto.';
