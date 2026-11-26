-- Custeios no projeto; compra e custeio levam todas as suas ordens.
--
-- POR QUÊ: pedido de 26/11/2026. Nenhum custeio institucional estava ligado a
-- projeto (não havia o campo, e nenhuma das 49 ordens de custeio tinha
-- projeto), então o que se pagou por custeio para um evento não aparecia no
-- gasto do projeto. E a regra passou a ser: a compra (ou o custeio) leva
-- TODAS as suas ordens de pagamento quando muda de projeto.
--
-- COMO:
--  • institucional_custeios.projeto_id (opcional). As ordens do custeio
--    herdam o projeto dele.
--  • ordem_herda_projeto_da_compra passa a olhar também o custeio: a ordem
--    sem projeto recebe o da compra ou, sem compra, o do custeio. O gatilho
--    dispara também quando muda custeio_id.
--  • compra_leva_projeto_as_ordens leva todas as ordens da compra (antes, só
--    as do projeto antigo ou sem projeto — na produção não havia diferença).
--  • custeio_leva_projeto_as_ordens: o mesmo para o custeio.
--  • O livro financeiro_transferencias_projeto aceita tipo 'custeio', com
--    custeio_id. Idempotente.

alter table public.institucional_custeios
  add column if not exists projeto_id uuid references public.projeto(id) on delete set null;
create index if not exists institucional_custeios_projeto_idx
  on public.institucional_custeios (emp_proprietaria_id, projeto_id) where projeto_id is not null;
comment on column public.institucional_custeios.projeto_id is 'Projeto a que o custeio pertence (opcional). As ordens do custeio herdam o projeto e entram no gasto dele. [lgpd:nenhum]';

create or replace function public.ordem_herda_projeto_da_compra()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.projeto_id is null and new.processo_compra_id is not null then
    select c.solicitacao_projeto_id
      into new.projeto_id
      from public.compras_solicitacoes c
     where c.id = new.processo_compra_id
       and c.emp_proprietaria_id = new.emp_proprietaria_id;
  end if;
  if new.projeto_id is null and new.custeio_id is not null then
    select c.projeto_id
      into new.projeto_id
      from public.institucional_custeios c
     where c.id = new.custeio_id
       and c.emp_proprietaria_id = new.emp_proprietaria_id;
  end if;
  return new;
end;
$$;

drop trigger if exists ordem_herda_projeto_da_compra on public.ordens_pagamento;
create trigger ordem_herda_projeto_da_compra
  before insert or update of processo_compra_id, custeio_id on public.ordens_pagamento
  for each row execute function public.ordem_herda_projeto_da_compra();

create or replace function public.compra_leva_projeto_as_ordens()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.solicitacao_projeto_id is distinct from old.solicitacao_projeto_id then
    update public.ordens_pagamento o
       set projeto_id = new.solicitacao_projeto_id
     where o.processo_compra_id = new.id
       and o.emp_proprietaria_id = new.emp_proprietaria_id
       and o.projeto_id is distinct from new.solicitacao_projeto_id;
  end if;
  return null;
end;
$$;

create or replace function public.custeio_leva_projeto_as_ordens()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.projeto_id is distinct from old.projeto_id then
    update public.ordens_pagamento o
       set projeto_id = new.projeto_id
     where o.custeio_id = new.id
       and o.emp_proprietaria_id = new.emp_proprietaria_id
       and o.projeto_id is distinct from new.projeto_id;
  end if;
  return null;
end;
$$;

drop trigger if exists custeio_leva_projeto_as_ordens on public.institucional_custeios;
create trigger custeio_leva_projeto_as_ordens
  after update of projeto_id on public.institucional_custeios
  for each row execute function public.custeio_leva_projeto_as_ordens();

comment on function public.ordem_herda_projeto_da_compra() is 'A ordem de pagamento sem projeto recebe o projeto da compra ou, sem compra, o do custeio (filtro Projeto do Financeiro).';
comment on function public.compra_leva_projeto_as_ordens() is 'Quando a compra muda de projeto, todas as ordens dela vão junto.';
comment on function public.custeio_leva_projeto_as_ordens() is 'Quando o custeio muda de projeto, todas as ordens dele vão junto.';

-- Livro de transferências: custeio também se transfere.
alter table public.financeiro_transferencias_projeto
  add column if not exists custeio_id uuid references public.institucional_custeios(id) on delete set null;
alter table public.financeiro_transferencias_projeto
  drop constraint if exists financeiro_transferencias_projeto_tipo_check;
alter table public.financeiro_transferencias_projeto
  add constraint financeiro_transferencias_projeto_tipo_check check (tipo in ('compra', 'ordem', 'custeio'));
comment on column public.financeiro_transferencias_projeto.custeio_id is 'O custeio transferido (tipo custeio). [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.tipo is 'compra = a solicitação de compra com as ordens dela; custeio = o custeio institucional com as ordens dele; ordem = a ordem lançada direto no projeto. [lgpd:nenhum]';
