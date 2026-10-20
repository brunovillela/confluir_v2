-- Confluir — Movimento da folha: marco inicial (20/10/2026)
--
-- POR QUÊ: houve confusão entre o que já foi pago e o que ainda será. O
-- Pessoal passou à contabilidade, à mão, tudo o que chegou até 20/10/2026 às
-- 12h. O movimento recomeça dali: o que foi registrado até o marco conta como
-- enviado e pago, e as competências enviadas antes dele são desconsideradas.
--
-- COMO: uma linha por entidade em pessoal_folha_config com o momento do
-- marco. src/lib/db/folha-movimento.ts deixa de fora do cálculo as linhas
-- registradas até o marco (created_at do lançamento ou o momento da
-- auditoria) e ignora as competências enviadas antes dele. Idempotente.

create table if not exists public.pessoal_folha_config (
  emp_proprietaria_id uuid primary key references public.empresa(id),
  marco_inicial timestamptz,
  marco_observacao text,
  marco_definido_por uuid references public.usuarios(id),
  marco_definido_em timestamptz,
  created_at timestamptz not null default now()
);

alter table public.pessoal_folha_config enable row level security;
drop policy if exists tenant_isolation on public.pessoal_folha_config;
create policy tenant_isolation on public.pessoal_folha_config to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);

drop trigger if exists set_emp_from_jwt on public.pessoal_folha_config;
create trigger set_emp_from_jwt before insert on public.pessoal_folha_config
  for each row execute function public.set_emp_from_jwt();

revoke all on table public.pessoal_folha_config from public, anon;
grant select, insert, update, delete on table public.pessoal_folha_config to authenticated;
grant all on table public.pessoal_folha_config to service_role;

comment on table public.pessoal_folha_config is 'Configuração do movimento da folha para a contabilidade, uma linha por entidade (src/lib/db/folha-movimento.ts). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.pessoal_folha_config.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_folha_config.marco_inicial is 'Marco inicial do movimento: o que foi registrado até este momento conta como enviado à contabilidade e pago; competências enviadas antes dele são desconsideradas.';
comment on column public.pessoal_folha_config.marco_observacao is 'Por que o marco foi definido.';
comment on column public.pessoal_folha_config.marco_definido_por is 'Quem definiu o marco. [lgpd:identificacao]';
comment on column public.pessoal_folha_config.marco_definido_em is 'Quando o marco foi definido.';
comment on column public.pessoal_folha_config.created_at is 'Criação do registro.';
