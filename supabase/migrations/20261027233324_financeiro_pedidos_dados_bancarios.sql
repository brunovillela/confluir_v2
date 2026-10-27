-- Confluir — Pedido de dados bancários ao favorecido (link de uso único)
--
-- POR QUÊ: a ordem Pix/TED só nasce com a conta do favorecido registrada, e
-- quem cadastra a conta hoje é o Financeiro, que precisa ir atrás dela por
-- telefone ou e-mail e digitá-la (com erro e repetição). O próprio
-- favorecido — fornecedor, filiado ou funcionário — pode informar a chave Pix
-- ou a conta por um link, sem login, e as ordens dele que esperavam a conta
-- seguem sozinhas (ligarOrdensSemForma).
--
-- COMO: financeiro_pedidos_dados_bancarios — um pedido por link. O token
-- (uuid aleatório) abre /dados-bancarios/<token>, só no domínio da entidade,
-- até expirar (7 dias) ou ser respondido (uso único). O dono é exatamente um:
-- fornecedor, usuário ou filiação. documento_esperado guarda o CPF/CNPJ do
-- dono no momento do pedido: o titular da conta informada tem de ser ele
-- (mesma raiz de CNPJ vale), para que um link vazado não desvie pagamentos.
-- A resposta só INSERE um dado bancário (nunca altera um existente) e fica
-- ligada ao pedido. Prefixo financeiro_: módulo e processo LGPD do
-- Financeiro. RLS por tenant, como as demais.

create table if not exists public.financeiro_pedidos_dados_bancarios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  token uuid not null unique default gen_random_uuid(),
  fornecedor_id uuid references public.empresa(id) on delete cascade,
  usuario_id uuid references public.usuarios(id) on delete cascade,
  filiado_id uuid references public.filiacoes(id) on delete cascade,
  documento_esperado text,
  enviado_para text,
  canal text not null default 'link',
  criado_por_usuario_id uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  expira_em timestamptz not null default (now() + interval '7 days'),
  aberto_em timestamptz,
  respondido_em timestamptz,
  dados_bancarios_id uuid references public.dados_bancarios(id) on delete set null,
  cancelado_em timestamptz,
  constraint financeiro_pedidos_dados_bancarios_um_dono check (
    (fornecedor_id is not null)::int + (usuario_id is not null)::int + (filiado_id is not null)::int = 1
  ),
  constraint financeiro_pedidos_dados_bancarios_canal_check check (canal in ('link', 'email', 'whatsapp')),
  constraint financeiro_pedidos_dados_bancarios_documento_check check (
    documento_esperado is null or documento_esperado ~ '^([0-9]{11}|[0-9]{14})$'
  )
);

create index if not exists financeiro_pedidos_dados_bancarios_fornecedor_idx
  on public.financeiro_pedidos_dados_bancarios (fornecedor_id) where fornecedor_id is not null;
create index if not exists financeiro_pedidos_dados_bancarios_usuario_idx
  on public.financeiro_pedidos_dados_bancarios (usuario_id) where usuario_id is not null;
create index if not exists financeiro_pedidos_dados_bancarios_filiado_idx
  on public.financeiro_pedidos_dados_bancarios (filiado_id) where filiado_id is not null;

alter table public.financeiro_pedidos_dados_bancarios enable row level security;
drop policy if exists tenant_isolation on public.financeiro_pedidos_dados_bancarios;
create policy tenant_isolation on public.financeiro_pedidos_dados_bancarios to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.financeiro_pedidos_dados_bancarios;
create trigger set_emp_from_jwt before insert on public.financeiro_pedidos_dados_bancarios
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.financeiro_pedidos_dados_bancarios from public, anon;
grant select, insert, update, delete on table public.financeiro_pedidos_dados_bancarios to authenticated;
grant all on table public.financeiro_pedidos_dados_bancarios to service_role;

-- ── Dicionário ─────────────────────────────────────────────────────────────

comment on table public.financeiro_pedidos_dados_bancarios is 'Pedidos de dados bancários ao favorecido (fornecedor, usuário ou filiado) por link de uso único, sem login: ele informa a chave Pix ou a conta, que entra como dado bancário novo e completa as ordens que a esperavam. [lgpd:identificacao,financeiro|titulares:fornecedores, filiados e funcionários]';
comment on column public.financeiro_pedidos_dados_bancarios.token is 'Segredo do link /dados-bancarios/<token>; vale só no domínio da entidade, até expirar ou ser respondido.';
comment on column public.financeiro_pedidos_dados_bancarios.fornecedor_id is 'Dono do pedido quando é fornecedor/entidade (empresa).';
comment on column public.financeiro_pedidos_dados_bancarios.usuario_id is 'Dono do pedido quando é usuário (funcionário, diretor). [lgpd:identificacao]';
comment on column public.financeiro_pedidos_dados_bancarios.filiado_id is 'Dono do pedido quando é filiado. [lgpd:identificacao]';
comment on column public.financeiro_pedidos_dados_bancarios.documento_esperado is 'CPF/CNPJ do dono (só dígitos) quando o pedido foi feito; o titular da conta informada tem de ser ele (mesma raiz de CNPJ vale). [lgpd:identificacao]';
comment on column public.financeiro_pedidos_dados_bancarios.enviado_para is 'E-mail ou telefone para onde o link foi mandado (nulo = link copiado). [lgpd:identificacao]';
comment on column public.financeiro_pedidos_dados_bancarios.canal is 'Como o link foi mandado: link (copiado), email ou whatsapp.';
comment on column public.financeiro_pedidos_dados_bancarios.criado_por_usuario_id is 'Quem pediu. [lgpd:identificacao]';
comment on column public.financeiro_pedidos_dados_bancarios.created_at is 'Quando o pedido foi feito.';
comment on column public.financeiro_pedidos_dados_bancarios.expira_em is 'Até quando o link vale (7 dias).';
comment on column public.financeiro_pedidos_dados_bancarios.aberto_em is 'Primeira vez que o link foi aberto.';
comment on column public.financeiro_pedidos_dados_bancarios.respondido_em is 'Quando o favorecido enviou os dados (o link deixa de valer).';
comment on column public.financeiro_pedidos_dados_bancarios.dados_bancarios_id is 'O dado bancário criado pela resposta.';
comment on column public.financeiro_pedidos_dados_bancarios.cancelado_em is 'Pedido cancelado por quem pediu (o link deixa de valer).';
