-- Confluir — Alterações de dados bancários pedidas pelo próprio funcionário/diretor
--
-- POR QUÊ: o funcionário e o diretor passam a cadastrar, alterar e excluir a
-- própria conta no Meu perfil. A conta é o destino dos pagamentos: trocá-la
-- sem conferência abre caminho para desvio (conta invadida, erro de
-- digitação). Por isso o pedido NÃO vale na hora — fica aguardando o
-- Financeiro, os pagamentos seguem na conta antiga e, confirmado, o pedido é
-- aplicado em dados_bancarios e recebe o selo "Financeiro ciente". As
-- alterações feitas pela gestão (Pessoal, Diretoria) continuam diretas.
--
-- COMO: financeiro_dados_bancarios_alteracoes — um pedido por alteração, que
-- fica como histórico. acao: incluir (dados = a conta nova), alterar
-- (dados_bancarios_id + dados novos; dados_anteriores = foto da conta antes)
-- ou excluir (dados_bancarios_id; dados_anteriores = foto). situacao:
-- aguardando → confirmada (aplicada; selo) | recusada (motivo) | cancelada
-- (pela própria pessoa). Um pedido aguardando por conta (índice parcial).
-- Prefixo financeiro_: módulo e processo LGPD do Financeiro. RLS por tenant.

create table if not exists public.financeiro_dados_bancarios_alteracoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  usuario_id uuid not null references public.usuarios(id) on delete cascade,
  acao text not null,
  dados_bancarios_id uuid references public.dados_bancarios(id) on delete set null,
  dados jsonb,
  dados_anteriores jsonb,
  principal boolean not null default false,
  situacao text not null default 'aguardando',
  motivo text,
  decidida_por_usuario_id uuid references public.usuarios(id) on delete set null,
  decidida_em timestamptz,
  created_at timestamptz not null default now(),
  constraint financeiro_dados_bancarios_alteracoes_acao_check check (acao in ('incluir', 'alterar', 'excluir')),
  constraint financeiro_dados_bancarios_alteracoes_situacao_check check (situacao in ('aguardando', 'confirmada', 'recusada', 'cancelada')),
  constraint financeiro_dados_bancarios_alteracoes_dados_check check (acao = 'excluir' or dados is not null)
);

create index if not exists financeiro_dados_bancarios_alteracoes_usuario_idx
  on public.financeiro_dados_bancarios_alteracoes (usuario_id, created_at desc);
create index if not exists financeiro_dados_bancarios_alteracoes_aguardando_idx
  on public.financeiro_dados_bancarios_alteracoes (emp_proprietaria_id, created_at) where situacao = 'aguardando';
create unique index if not exists financeiro_dados_bancarios_alteracoes_uma_por_conta
  on public.financeiro_dados_bancarios_alteracoes (dados_bancarios_id) where situacao = 'aguardando' and dados_bancarios_id is not null;
create index if not exists financeiro_dados_bancarios_alteracoes_conta_idx
  on public.financeiro_dados_bancarios_alteracoes (dados_bancarios_id) where dados_bancarios_id is not null;

alter table public.financeiro_dados_bancarios_alteracoes enable row level security;
drop policy if exists tenant_isolation on public.financeiro_dados_bancarios_alteracoes;
create policy tenant_isolation on public.financeiro_dados_bancarios_alteracoes to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.financeiro_dados_bancarios_alteracoes;
create trigger set_emp_from_jwt before insert on public.financeiro_dados_bancarios_alteracoes
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.financeiro_dados_bancarios_alteracoes from public, anon;
grant select, insert, update, delete on table public.financeiro_dados_bancarios_alteracoes to authenticated;
grant all on table public.financeiro_dados_bancarios_alteracoes to service_role;

-- ── Dicionário ─────────────────────────────────────────────────────────────

comment on table public.financeiro_dados_bancarios_alteracoes is 'Inclusões, alterações e exclusões de conta bancária pedidas pelo próprio funcionário ou diretor no Meu perfil: só valem depois que o Financeiro confirma (selo "Financeiro ciente"); ficam como histórico. [lgpd:identificacao,financeiro|titulares:funcionários e diretores]';
comment on column public.financeiro_dados_bancarios_alteracoes.usuario_id is 'Quem pediu — o dono da conta. [lgpd:identificacao]';
comment on column public.financeiro_dados_bancarios_alteracoes.acao is 'incluir, alterar ou excluir.';
comment on column public.financeiro_dados_bancarios_alteracoes.dados_bancarios_id is 'A conta alterada ou excluída; na inclusão, a conta criada quando o Financeiro confirma.';
comment on column public.financeiro_dados_bancarios_alteracoes.dados is 'A conta pedida (banco, agência, conta, Pix, titular…), aplicada na confirmação. [lgpd:financeiro]';
comment on column public.financeiro_dados_bancarios_alteracoes.dados_anteriores is 'Foto da conta antes da alteração ou exclusão, para o Financeiro comparar. [lgpd:financeiro]';
comment on column public.financeiro_dados_bancarios_alteracoes.principal is 'A pessoa pediu que a conta seja a principal (a usada nos pagamentos).';
comment on column public.financeiro_dados_bancarios_alteracoes.situacao is 'aguardando, confirmada (aplicada; selo Financeiro ciente), recusada ou cancelada (pela pessoa).';
comment on column public.financeiro_dados_bancarios_alteracoes.motivo is 'Motivo da recusa, escrito pelo Financeiro.';
comment on column public.financeiro_dados_bancarios_alteracoes.decidida_por_usuario_id is 'Quem do Financeiro confirmou ou recusou. [lgpd:identificacao]';
comment on column public.financeiro_dados_bancarios_alteracoes.decidida_em is 'Quando foi confirmada, recusada ou cancelada.';
comment on column public.financeiro_dados_bancarios_alteracoes.created_at is 'Quando foi pedida.';
