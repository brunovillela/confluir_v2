-- Ordens de pagamento herdam o projeto da compra.
--
-- POR QUÊ: pedido de 26/11/2026. A ordem que nasce de uma compra não levava
-- o projeto (só 14 de 98 desde a virada): o filtro "Projeto" das ordens no
-- Financeiro (ordens_pagamento.projeto_id) não as achava, embora a página do
-- projeto já as contasse pelo vínculo da compra. As ordens nascem em vários
-- lugares (compra, edição da compra, RPA, fornecimentos), por isso a regra
-- mora no banco.
--
-- COMO:
--  • Gatilho BEFORE INSERT/UPDATE OF processo_compra_id em ordens_pagamento:
--    a ordem de compra SEM projeto recebe o da compra. A que já tem projeto
--    (escolhido de propósito) fica como está.
--  • Gatilho AFTER UPDATE OF solicitacao_projeto_id em compras_solicitacoes:
--    quando a compra muda de projeto (edição da compra em Aquisição ou a
--    transferência de despesa em Projetos), as ordens dela que estavam no
--    projeto antigo, ou sem projeto, vão junto.
--  • Preenchimento único das ordens de compra sem projeto cuja compra tem
--    projeto (86 na produção em 26/11/2026; nenhuma com projeto diferente
--    do da compra). Idempotente.

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
  return new;
end;
$$;

drop trigger if exists ordem_herda_projeto_da_compra on public.ordens_pagamento;
create trigger ordem_herda_projeto_da_compra
  before insert or update of processo_compra_id on public.ordens_pagamento
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
       and (o.projeto_id is null or o.projeto_id = old.solicitacao_projeto_id);
  end if;
  return null;
end;
$$;

drop trigger if exists compra_leva_projeto_as_ordens on public.compras_solicitacoes;
create trigger compra_leva_projeto_as_ordens
  after update of solicitacao_projeto_id on public.compras_solicitacoes
  for each row execute function public.compra_leva_projeto_as_ordens();

update public.ordens_pagamento o
   set projeto_id = c.solicitacao_projeto_id
  from public.compras_solicitacoes c
 where o.processo_compra_id = c.id
   and o.emp_proprietaria_id = c.emp_proprietaria_id
   and o.projeto_id is null
   and c.solicitacao_projeto_id is not null;

comment on function public.ordem_herda_projeto_da_compra() is 'A ordem de pagamento de uma compra, sem projeto, recebe o projeto da compra (filtro Projeto do Financeiro).';
comment on function public.compra_leva_projeto_as_ordens() is 'Quando a compra muda de projeto, as ordens dela no projeto antigo (ou sem projeto) vão junto.';
