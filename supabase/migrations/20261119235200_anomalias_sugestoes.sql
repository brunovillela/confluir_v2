-- Anomalias: sugestões do sistema.
--
-- POR QUÊ: pedido de 19/11/2026 — a ferramenta de Anomalias dependia de alguém
-- lembrar de registrar. O sistema passa a SUGERIR anomalias a partir do que já
-- registra (km fora do normal, ordem devolvida 3 vezes ou mais, ponto
-- incompleto recorrente, compras canceladas pelo mesmo fornecedor, infrações
-- recorrentes do mesmo condutor); quem tem Anomalias abre (já preenchida) ou
-- descarta. Sugerir, e não abrir direto, evita encher a lista de alarme falso.
--
-- COMO: `ferramentas_anomalias_sugestoes`, uma por ocorrência: a origem, uma
-- chave que impede sugerir de novo a mesma coisa (única por entidade e
-- origem), o fato e a descrição prontos, a data, o link para a origem e a
-- situação (pendente, aberta, descartada) com quem decidiu e quando. Abrir
-- guarda a anomalia criada. Geradas pelo tick diário das pendências
-- (lib/db/anomalias-sugestoes.ts). RLS por entidade e set_emp_from_jwt.
-- Idempotente.

create table if not exists public.ferramentas_anomalias_sugestoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  origem text not null,
  chave text not null,
  fato text not null,
  descricao text,
  data_ocorrencia date,
  link text,
  situacao text not null default 'pendente',
  anomalia_id uuid references public.ferramentas_anomalias(id) on delete set null,
  decidido_por uuid references public.usuarios(id) on delete set null,
  decidido_em timestamptz,
  created_at timestamptz not null default now(),
  constraint ferramentas_anomalias_sugestoes_origem_check
    check (origem in ('km_anormal', 'ordem_devolvida', 'ponto_incompleto', 'compras_canceladas', 'infracoes_condutor')),
  constraint ferramentas_anomalias_sugestoes_situacao_check
    check (situacao in ('pendente', 'aberta', 'descartada'))
);

create unique index if not exists ferramentas_anomalias_sugestoes_chave_idx
  on public.ferramentas_anomalias_sugestoes (emp_proprietaria_id, origem, chave);
create index if not exists ferramentas_anomalias_sugestoes_pendentes_idx
  on public.ferramentas_anomalias_sugestoes (emp_proprietaria_id, situacao, created_at);

alter table public.ferramentas_anomalias_sugestoes enable row level security;
drop policy if exists tenant_isolation on public.ferramentas_anomalias_sugestoes;
create policy tenant_isolation on public.ferramentas_anomalias_sugestoes to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
revoke all on table public.ferramentas_anomalias_sugestoes from public, anon;
grant select, insert, update, delete on table public.ferramentas_anomalias_sugestoes to authenticated;
grant all on table public.ferramentas_anomalias_sugestoes to service_role;

drop trigger if exists set_emp_from_jwt on public.ferramentas_anomalias_sugestoes;
create trigger set_emp_from_jwt before insert on public.ferramentas_anomalias_sugestoes
  for each row execute function public.set_emp_from_jwt();

comment on table public.ferramentas_anomalias_sugestoes is 'Anomalias sugeridas pelo sistema (km fora do normal, ordem devolvida 3+ vezes, ponto incompleto recorrente, compras canceladas, infrações recorrentes), que quem tem Anomalias abre ou descarta (Ferramentas > Anomalias). [lgpd:identificacao|titulares:funcionarios,diretores,envolvidos]';
comment on column public.ferramentas_anomalias_sugestoes.origem is 'De onde veio a sugestão: km_anormal, ordem_devolvida, ponto_incompleto, compras_canceladas ou infracoes_condutor. [lgpd:nenhum]';
comment on column public.ferramentas_anomalias_sugestoes.chave is 'Identifica a ocorrência na origem (ex.: o id da movimentação), para não sugerir a mesma coisa duas vezes. [lgpd:nenhum]';
comment on column public.ferramentas_anomalias_sugestoes.fato is 'Resumo pronto do fato; pode citar o condutor ou o funcionário. [lgpd:identificacao]';
comment on column public.ferramentas_anomalias_sugestoes.descricao is 'Detalhe pronto para a descrição da anomalia; pode citar pessoas. [lgpd:identificacao]';
comment on column public.ferramentas_anomalias_sugestoes.link is 'Caminho no painel para conferir a origem. [lgpd:nenhum]';
comment on column public.ferramentas_anomalias_sugestoes.situacao is 'pendente (a avaliar), aberta (virou anomalia) ou descartada. [lgpd:nenhum]';
comment on column public.ferramentas_anomalias_sugestoes.decidido_por is 'Quem abriu ou descartou a sugestão. [lgpd:identificacao]';
