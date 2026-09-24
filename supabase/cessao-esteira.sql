-- Confluir — Cessão de espaços, FASE 3 (2026-09-24)
--
-- A esteira do pedido: quem assumiu, a visita técnica, a autorização (a
-- avaliação política) e o custeio. O termo assinado é a fase 4.
--
-- ── OS PASSOS SÃO DO ESPAÇO, NÃO DO PEDIDO ──────────────────────────────────
-- Cada espaço decide o que exige (`visita_tecnica`, `exige_autorizacao`,
-- `exige_termo`, da fase 1). O pedido só passa pelos passos que o SEU espaço
-- exige: espaço com visita dispensada não abre o passo de visita, e espaço sem
-- autorização vai direto ao custeio. Por isso a situação continua sendo uma
-- lista curta (`rascunho`, `solicitada`, `em_analise`, `recusada`,
-- `cancelada`, `confirmada`) e o andamento mora nas colunas de cada passo —
-- inventar uma situação por passo daria uma máquina de estados que muda toda
-- vez que um espaço muda de regra.
--
-- ── A TRILHA ────────────────────────────────────────────────────────────────
-- `cessao_solicitacao_eventos` guarda o que aconteceu e quem fez. É o que
-- responde "por que este pedido foi recusado" seis meses depois, e é a fonte
-- do histórico na tela.
--
-- Requer supabase/cessao-espacos.sql e supabase/cessao-solicitacoes.sql.
-- Padrão da casa: idempotente, RLS inline por tenant. Executar UMA VEZ.

-- ── 1. Bucket dos comprovantes de custeio ────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('espacos', 'espacos', false)
on conflict (id) do nothing;

-- ── 2. Colunas da esteira ────────────────────────────────────────────────────

-- Quem da equipe assumiu o pedido.
alter table cessao_solicitacoes add column if not exists analista_id uuid references usuarios(id);

-- Visita técnica
alter table cessao_solicitacoes add column if not exists visita_agendada_em timestamptz;
alter table cessao_solicitacoes add column if not exists visita_responsavel_id uuid references usuarios(id);
alter table cessao_solicitacoes add column if not exists visita_realizada_em timestamptz;
alter table cessao_solicitacoes add column if not exists visita_parecer text;
-- Visita facultativa que o solicitante dispensou, ou que a equipe dispensou.
alter table cessao_solicitacoes add column if not exists visita_dispensada boolean not null default false;

-- Autorização (avaliação política)
alter table cessao_solicitacoes add column if not exists autorizacao_situacao text not null default 'pendente';
alter table cessao_solicitacoes add column if not exists autorizacao_por_id uuid references usuarios(id);
alter table cessao_solicitacoes add column if not exists autorizacao_em timestamptz;
alter table cessao_solicitacoes add column if not exists autorizacao_parecer text;

-- Custeio: o que o solicitante paga. Fase 3 só REGISTRA — não há integração
-- com o Financeiro, que é dinheiro que a entidade paga, não recebe.
alter table cessao_solicitacoes add column if not exists custeio_valor numeric(15, 2);
alter table cessao_solicitacoes add column if not exists custeio_observacao text;
alter table cessao_solicitacoes add column if not exists custeio_pago_em timestamptz;
alter table cessao_solicitacoes add column if not exists custeio_comprovante text;

-- Fechamento
alter table cessao_solicitacoes add column if not exists confirmada_em timestamptz;
alter table cessao_solicitacoes add column if not exists confirmada_por_id uuid references usuarios(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_solic_autorizacao') then
    alter table cessao_solicitacoes add constraint ck_cessao_solic_autorizacao
      check (autorizacao_situacao in ('pendente', 'autorizada', 'negada')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_cessao_solic_custeio') then
    alter table cessao_solicitacoes add constraint ck_cessao_solic_custeio
      check (custeio_valor is null or custeio_valor >= 0) not valid;
  end if;
end $$;

-- ── 3. Itens do custeio ──────────────────────────────────────────────────────

create table if not exists cessao_custeio_itens (id uuid primary key default gen_random_uuid());
alter table cessao_custeio_itens add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_custeio_itens add column if not exists solicitacao_id uuid references cessao_solicitacoes(id) on delete cascade;
alter table cessao_custeio_itens add column if not exists descricao text;
alter table cessao_custeio_itens add column if not exists valor numeric(15, 2) not null default 0;
alter table cessao_custeio_itens add column if not exists created_at timestamptz not null default now();

create index if not exists idx_cessao_custeio_solic
  on cessao_custeio_itens (solicitacao_id);

comment on table cessao_custeio_itens is
  'Itens do custeio da cessão (limpeza, som, segurança). A soma alimenta custeio_valor e vai para o termo.';

alter table cessao_custeio_itens enable row level security;
drop policy if exists tenant_isolation on cessao_custeio_itens;
create policy tenant_isolation on cessao_custeio_itens for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_custeio_itens to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_custeio_itens;
create trigger set_emp_from_jwt before insert on cessao_custeio_itens
  for each row execute function public.set_emp_from_jwt();

-- ── 4. A trilha do pedido ────────────────────────────────────────────────────

create table if not exists cessao_solicitacao_eventos (id uuid primary key default gen_random_uuid());
alter table cessao_solicitacao_eventos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table cessao_solicitacao_eventos add column if not exists solicitacao_id uuid references cessao_solicitacoes(id) on delete cascade;
alter table cessao_solicitacao_eventos add column if not exists tipo text;
alter table cessao_solicitacao_eventos add column if not exists detalhe text;
alter table cessao_solicitacao_eventos add column if not exists usuario_id uuid references usuarios(id);
alter table cessao_solicitacao_eventos add column if not exists created_at timestamptz not null default now();

create index if not exists idx_cessao_solic_eventos
  on cessao_solicitacao_eventos (solicitacao_id, created_at);

comment on table cessao_solicitacao_eventos is
  'Trilha do pedido: o que aconteceu, quando e quem fez. Responde "por que este pedido foi recusado" meses depois.';

alter table cessao_solicitacao_eventos enable row level security;
drop policy if exists tenant_isolation on cessao_solicitacao_eventos;
create policy tenant_isolation on cessao_solicitacao_eventos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on cessao_solicitacao_eventos to authenticated;
drop trigger if exists set_emp_from_jwt on cessao_solicitacao_eventos;
create trigger set_emp_from_jwt before insert on cessao_solicitacao_eventos
  for each row execute function public.set_emp_from_jwt();

notify pgrst, 'reload schema';
