-- Projetos: transferência de despesa entre projetos abertos.
--
-- POR QUÊ: pedido de 25/11/2026 — com o gasto real do projeto (ordens,
-- compras e reembolsos), a despesa lançada no projeto errado estoura um
-- orçamento e sobra no outro. Quem edita projetos passa a poder transferir
-- a despesa entre dois projetos em andamento, com o motivo registrado.
--
-- COMO:
--  • A transferência move a COMPRA do projeto (compras_solicitacoes.
--    solicitacao_projeto_id, e o projeto_id das ordens dela que apontavam
--    para a origem) ou a ORDEM lançada direto no projeto (ordens_pagamento.
--    projeto_id). O centro de custo não muda: reclassificar é do Financeiro.
--  • `financeiro_transferencias_projeto` é o livro das transferências: de
--    onde, para onde, o que foi (com o código e a descrição de então), o
--    valor, o motivo e quem fez. As ordens movidas também ganham o evento
--    na trilha delas (ordens_pagamento_eventos, tipo projeto_transferido).
-- O prefixo `financeiro_` põe a tabela no processo Financeiro do ROPA.
-- RLS por entidade e set_emp_from_jwt. Idempotente.

create table if not exists public.financeiro_transferencias_projeto (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  origem_id uuid not null references public.projeto(id) on delete cascade,
  destino_id uuid not null references public.projeto(id) on delete cascade,
  tipo text not null,
  compra_id uuid references public.compras_solicitacoes(id) on delete set null,
  ordem_id uuid references public.ordens_pagamento(id) on delete set null,
  descricao text,
  valor numeric(14, 2) not null default 0,
  ordens integer not null default 0,
  motivo text not null,
  usuario_id uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint financeiro_transferencias_projeto_tipo_check check (tipo in ('compra', 'ordem')),
  constraint financeiro_transferencias_projeto_projetos_check check (origem_id <> destino_id),
  constraint financeiro_transferencias_projeto_motivo_check check (char_length(motivo) between 3 and 500)
);

create index if not exists financeiro_transferencias_projeto_origem_idx
  on public.financeiro_transferencias_projeto (emp_proprietaria_id, origem_id);
create index if not exists financeiro_transferencias_projeto_destino_idx
  on public.financeiro_transferencias_projeto (emp_proprietaria_id, destino_id);

do $$
declare
  t text;
begin
  foreach t in array array['financeiro_transferencias_projeto'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I to authenticated using (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid) with check (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)',
      t
    );
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;

comment on table public.financeiro_transferencias_projeto is 'Livro das transferências de despesa (compra ou ordem de pagamento) de um projeto para outro, com o motivo e quem fez (Ferramentas → Projetos). [lgpd:identificacao|titulares:funcionarios,diretores]';
comment on column public.financeiro_transferencias_projeto.origem_id is 'Projeto de onde a despesa saiu. [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.destino_id is 'Projeto para onde a despesa foi. [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.tipo is 'compra = a solicitação de compra com as ordens dela; ordem = a ordem lançada direto no projeto. [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.compra_id is 'A compra transferida (tipo compra). [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.ordem_id is 'A ordem transferida (tipo ordem). [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.descricao is 'Código e descrição da compra ou da ordem no momento da transferência. [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.valor is 'Valor que mudou de projeto (ordens que contam no gasto, ou o valor da compra sem ordem). [lgpd:financeiro]';
comment on column public.financeiro_transferencias_projeto.ordens is 'Quantas ordens de pagamento mudaram de projeto junto. [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.motivo is 'Por que a despesa mudou de projeto, escrito por quem transferiu. [lgpd:nenhum]';
comment on column public.financeiro_transferencias_projeto.usuario_id is 'Quem fez a transferência. [lgpd:identificacao]';
