-- Confluir — Veículos: apontamentos do checklist (29/10/2026)
--
-- POR QUÊ: um "não conforme" vivia só dentro do checklist em que foi marcado.
-- O checklist seguinte não sabia dele, a portaria deixava o veículo sair sem
-- aviso e nada ligava o problema à manutenção corretiva que o resolveu. O
-- apontamento passa a ter vida própria: nasce no checklist, é confirmado (ou
-- dado como sanado) em cada checklist seguinte, conta o tempo em aberto e pode
-- ser vinculado a uma manutenção. SÓ um checklist que o declare sanado o
-- encerra — nem excluir o checklist de origem o apaga.
--
-- COMO:
--  1. `veiculos_checklist_apontamentos`: um por (veículo, item) em aberto
--     (índice único parcial), com abertura, confirmações, resolução e a
--     manutenção vinculada.
--  2. RLS por tenant + set_emp_from_jwt, como as demais tabelas do checklist.
--  3. Retroativo: o "não conforme" do ÚLTIMO checklist de cada veículo vira
--     apontamento aberto (é o estado atual conhecido); os anteriores, não —
--     o checklist seguinte já disse como o item estava.
-- Idempotente.

create table if not exists public.veiculos_checklist_apontamentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa(id),
  veiculo_id uuid not null references public.veiculos(id) on delete cascade,
  item_id uuid references public.veiculos_checklist_itens(id) on delete set null,
  categoria text not null,
  descricao text,
  situacao text not null default 'aberto' check (situacao in ('aberto', 'resolvido')),
  aberto_em timestamptz not null,
  checklist_abertura_id uuid references public.veiculos_checklists(id) on delete set null,
  confirmacoes integer not null default 0,
  ultima_confirmacao_em timestamptz,
  ultima_observacao text,
  resolvido_em timestamptz,
  checklist_resolucao_id uuid references public.veiculos_checklists(id) on delete set null,
  resolvido_por uuid references public.usuarios(id),
  manutencao_id uuid references public.veiculos_manutencoes(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists veiculos_checklist_apontamentos_aberto_unico
  on public.veiculos_checklist_apontamentos (veiculo_id, item_id)
  where situacao = 'aberto';
create index if not exists idx_veiculos_checklist_apontamentos_veiculo
  on public.veiculos_checklist_apontamentos (emp_proprietaria_id, veiculo_id, situacao);

alter table public.veiculos_checklist_apontamentos enable row level security;
drop policy if exists tenant_isolation on public.veiculos_checklist_apontamentos;
create policy tenant_isolation on public.veiculos_checklist_apontamentos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.veiculos_checklist_apontamentos;
create trigger set_emp_from_jwt before insert on public.veiculos_checklist_apontamentos
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.veiculos_checklist_apontamentos from public, anon;
grant select, insert, update on table public.veiculos_checklist_apontamentos to authenticated;
grant all on table public.veiculos_checklist_apontamentos to service_role;

comment on table public.veiculos_checklist_apontamentos is 'Apontamento (item não conforme) do checklist de um veículo, com vida própria: aberto num checklist, confirmado ou sanado nos seguintes, com tempo em aberto e a manutenção corretiva vinculada. Só um checklist que o declare sanado o encerra. [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.veiculos_checklist_apontamentos.veiculo_id is 'Veículo apontado. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.item_id is 'Item do checklist (veiculos_checklist_itens); nulo se o item foi excluído. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.categoria is 'Nome do item no momento da abertura (sobrevive à edição do catálogo). [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.descricao is 'O que foi encontrado, na abertura. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.situacao is 'aberto | resolvido. Só o checklist muda para resolvido. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.aberto_em is 'Momento do checklist que abriu o apontamento (marcador do tempo em aberto). [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.checklist_abertura_id is 'Checklist que abriu. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.confirmacoes is 'Quantos checklists seguintes confirmaram que o problema permanece. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.ultima_confirmacao_em is 'Último checklist que confirmou que permanece. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.ultima_observacao is 'Como estava na última confirmação, se o inspetor descreveu. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.resolvido_em is 'Momento do checklist que o declarou sanado. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.checklist_resolucao_id is 'Checklist que o declarou sanado. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.resolvido_por is 'Inspetor do checklist que o declarou sanado. [lgpd:identificacao]';
comment on column public.veiculos_checklist_apontamentos.manutencao_id is 'Manutenção (corretiva) vinculada ao apontamento; vincular não o encerra. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.created_at is 'Quando o registro foi criado. [lgpd:nenhum]';
comment on column public.veiculos_checklist_apontamentos.emp_proprietaria_id is 'Entidade dona (tenant). [lgpd:nenhum]';

-- ── Retroativo: o "não conforme" do último checklist de cada veículo ────────
insert into public.veiculos_checklist_apontamentos
  (emp_proprietaria_id, veiculo_id, item_id, categoria, descricao, aberto_em, checklist_abertura_id)
select c.emp_proprietaria_id, c.veiculo_id, r.item_id, coalesce(r.categoria, '(item)'), r.observacao,
       c.realizado_em, c.id
from public.veiculos_checklist_respostas r
join public.veiculos_checklists c on c.id = r.checklist_id
where r.situacao = 'nao_conforme'
  and c.veiculo_id is not null
  and c.realizado_em = (
    select max(c2.realizado_em) from public.veiculos_checklists c2 where c2.veiculo_id = c.veiculo_id
  )
  and not exists (
    select 1 from public.veiculos_checklist_apontamentos a
    where a.veiculo_id = c.veiculo_id and a.item_id is not distinct from r.item_id and a.situacao = 'aberto'
  );
