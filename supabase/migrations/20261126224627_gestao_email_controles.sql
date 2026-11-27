-- POR QUÊ: Gestão (26/11/2026), fase 3 da gestão do e-mail. A fase 1 passou a
--   registrar cada e-mail e a fase 2 mostrou o uso; faltava a entidade poder
--   controlar o envio, como já faz com a IA: desligar o e-mail de um módulo,
--   pôr um teto mensal de envios (o plano do provedor cobra por quantidade),
--   uma cota por departamento — e parar de mandar para endereços que o
--   provedor já rejeitou de vez (cada nova rejeição derruba a reputação do
--   domínio e faz os e-mails de todos caírem no spam). Os envios essenciais
--   (acesso, códigos, votação, assinatura) nunca são barrados por módulo, teto
--   ou cota.
-- COMO:
--   1. email_config (uma linha por entidade): módulos desligados, teto mensal
--      (quantidade), parar ou só avisar no teto, cotas por departamento.
--   2. email_bloqueios: endereços que não recebem mais (rejeição definitiva,
--      gravada pelo webhook do Brevo, ou bloqueio à mão); a Gestão libera.
--      Carga inicial: os endereços já rejeitados em email_envios.
--   3. email_envios.situacao aceita 'barrado' (o sistema não enviou por uma
--      trava da Gestão; o motivo vai em erro).
--   Idempotente.

-- ── 1. email_config ─────────────────────────────────────────────────────────
create table if not exists public.email_config (
  emp_proprietaria_id uuid primary key references public.empresa(id) on delete cascade,
  modulos_desligados text[] not null default '{}',
  limite_mensal integer,
  bloquear_no_limite boolean not null default false,
  cotas_departamento jsonb not null default '{}'::jsonb,
  atualizado_por uuid references public.usuarios(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint email_config_limite_positivo check (limite_mensal is null or limite_mensal > 0)
);

alter table public.email_config enable row level security;
drop policy if exists tenant_isolation on public.email_config;
create policy tenant_isolation on public.email_config to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.email_config from public, anon;
grant select, insert, update, delete on table public.email_config to authenticated;
grant all on table public.email_config to service_role;

drop trigger if exists set_emp_from_jwt on public.email_config;
create trigger set_emp_from_jwt before insert on public.email_config
  for each row execute function public.set_emp_from_jwt();

comment on table public.email_config is 'Controles do e-mail da entidade (Gestão › E-mail, 26/11/2026): módulos desligados, teto mensal de envios, parar ou só avisar no teto e cotas por departamento. Envios essenciais nunca são barrados. [lgpd:nenhum]';
comment on column public.email_config.modulos_desligados is 'Módulos (slug de src/lib/email-processos.ts) cujos e-mails não saem, exceto os essenciais.';
comment on column public.email_config.limite_mensal is 'Teto de e-mails por mês (fuso de Brasília); nulo = sem teto.';
comment on column public.email_config.bloquear_no_limite is 'true = no teto (ou na cota do departamento) os e-mails não essenciais param até o dia 1º; false = só avisa.';
comment on column public.email_config.cotas_departamento is 'Cota mensal de e-mails por departamento (id → quantidade), contada pelo departamento de quem disparou.';
comment on column public.email_config.atualizado_por is 'Quem mudou a configuração por último. [lgpd:identificacao]';

-- ── 2. email_bloqueios ──────────────────────────────────────────────────────
create table if not exists public.email_bloqueios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  endereco text not null,
  motivo text,
  origem text not null default 'rejeicao',
  criado_em timestamptz not null default now(),
  criado_por uuid references public.usuarios(id) on delete set null,
  constraint email_bloqueios_origem_valida check (origem in ('rejeicao', 'manual')),
  constraint email_bloqueios_endereco_minusculo check (endereco = lower(btrim(endereco)))
);

create unique index if not exists email_bloqueios_emp_endereco_uniq on public.email_bloqueios (emp_proprietaria_id, endereco);

alter table public.email_bloqueios enable row level security;
drop policy if exists tenant_isolation on public.email_bloqueios;
create policy tenant_isolation on public.email_bloqueios to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.email_bloqueios from public, anon;
grant select, insert, update, delete on table public.email_bloqueios to authenticated;
grant all on table public.email_bloqueios to service_role;

drop trigger if exists set_emp_from_jwt on public.email_bloqueios;
create trigger set_emp_from_jwt before insert on public.email_bloqueios
  for each row execute function public.set_emp_from_jwt();

comment on table public.email_bloqueios is 'Endereços de e-mail que o sistema não usa mais (Gestão › E-mail, 26/11/2026): rejeição definitiva informada pelo provedor ou bloqueio à mão. Liberar = apagar a linha. [lgpd:identificacao|titulares:filiados,funcionarios,fornecedores]';
comment on column public.email_bloqueios.endereco is 'Endereço bloqueado, em minúsculas. [lgpd:identificacao]';
comment on column public.email_bloqueios.motivo is 'Tipo e motivo curto da rejeição do provedor, ou o motivo informado no bloqueio à mão. [lgpd:nenhum]';
comment on column public.email_bloqueios.origem is 'rejeicao (webhook do provedor) ou manual (Gestão).';
comment on column public.email_bloqueios.criado_por is 'Quem bloqueou à mão; nulo quando veio do provedor. [lgpd:identificacao]';

-- Carga inicial: os endereços já rejeitados de vez.
insert into public.email_bloqueios (emp_proprietaria_id, endereco, motivo, origem, criado_em)
select distinct on (e.emp_proprietaria_id, lower(btrim(e.destinatario)))
       e.emp_proprietaria_id, lower(btrim(e.destinatario)), e.rejeicao, 'rejeicao', e.rejeitado_em
  from public.email_envios e
 where e.rejeitado_em is not null
   and e.destinatario is not null
   and btrim(e.destinatario) <> ''
 order by e.emp_proprietaria_id, lower(btrim(e.destinatario)), e.rejeitado_em desc
on conflict (emp_proprietaria_id, endereco) do nothing;

-- ── 3. situação 'barrado' ───────────────────────────────────────────────────
alter table public.email_envios drop constraint if exists email_envios_situacao_valida;
alter table public.email_envios add constraint email_envios_situacao_valida
  check (situacao in ('enviando', 'enviado', 'falhou', 'sem_configuracao', 'teste', 'barrado'));
comment on column public.email_envios.situacao is 'enviando (antes da resposta do provedor), enviado (aceito pelo provedor), falhou, sem_configuracao (ambiente sem chave), teste (sandbox, não entregue) ou barrado (não enviado por trava da Gestão: módulo desligado, teto, cota ou endereço bloqueado; o motivo vai em erro).';
