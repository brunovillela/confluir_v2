-- ============================================================================
-- Contas de função (2026-09-17). Idempotente — rodar no SQL Editor.
--
-- Pedido do Bruno: recepcao@sindipetronf.org.br é usado por um prestador de
-- serviço; nas férias ou na substituição, quem entra usa o mesmo e-mail.
-- • usuarios.conta_funcao: a conta é do POSTO (Recepção), não de uma pessoa.
--   Não tem CPF, não entra no quadro da entidade nem nas duplicidades.
-- • usuarios_ocupacoes: quem ocupou o posto em cada período. Uma cobertura
--   (férias, afastamento) vale sobre o titular nos dias dela — é assim que
--   uma ação feita pela conta numa data aponta para a pessoa.
-- • veiculos_disponibilidade.devolucao_registrada_por_id: quem registrou a
--   entrada (a saída já guardava registrado_por_id).
-- ============================================================================

alter table usuarios add column if not exists conta_funcao boolean not null default false;
comment on column usuarios.conta_funcao is
  'Conta do posto (ex.: Recepção), usada por quem o ocupa. Os ocupantes ficam em usuarios_ocupacoes.';

create table if not exists usuarios_ocupacoes (id uuid primary key default gen_random_uuid());
alter table usuarios_ocupacoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table usuarios_ocupacoes add column if not exists conta_id uuid references usuarios(id) on delete cascade;
alter table usuarios_ocupacoes add column if not exists pessoa_id uuid references usuarios(id);
alter table usuarios_ocupacoes add column if not exists inicio date;
alter table usuarios_ocupacoes add column if not exists fim date;
alter table usuarios_ocupacoes add column if not exists motivo text;
alter table usuarios_ocupacoes add column if not exists observacao text;
alter table usuarios_ocupacoes add column if not exists registrado_por_id uuid references usuarios(id);
alter table usuarios_ocupacoes add column if not exists created_at timestamptz not null default now();
alter table usuarios_ocupacoes add column if not exists updated_at timestamptz not null default now();

alter table usuarios_ocupacoes alter column conta_id set not null;
alter table usuarios_ocupacoes alter column pessoa_id set not null;
alter table usuarios_ocupacoes alter column inicio set not null;
alter table usuarios_ocupacoes alter column motivo set not null;

alter table usuarios_ocupacoes drop constraint if exists usuarios_ocupacoes_motivo_check;
alter table usuarios_ocupacoes add constraint usuarios_ocupacoes_motivo_check
  check (motivo in ('titular', 'ferias', 'afastamento', 'substituicao'));
alter table usuarios_ocupacoes drop constraint if exists usuarios_ocupacoes_periodo_check;
alter table usuarios_ocupacoes add constraint usuarios_ocupacoes_periodo_check
  check (fim is null or fim >= inicio);
alter table usuarios_ocupacoes drop constraint if exists usuarios_ocupacoes_pessoa_check;
alter table usuarios_ocupacoes add constraint usuarios_ocupacoes_pessoa_check
  check (pessoa_id <> conta_id);

create index if not exists idx_usuarios_ocupacoes_conta
  on usuarios_ocupacoes (emp_proprietaria_id, conta_id, inicio desc);
create index if not exists idx_usuarios_ocupacoes_pessoa
  on usuarios_ocupacoes (pessoa_id);

alter table usuarios_ocupacoes enable row level security;
drop policy if exists tenant_isolation on usuarios_ocupacoes;
create policy tenant_isolation on usuarios_ocupacoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on usuarios_ocupacoes to authenticated;
drop trigger if exists set_emp_from_jwt on usuarios_ocupacoes;
create trigger set_emp_from_jwt before insert on usuarios_ocupacoes
  for each row execute function public.set_emp_from_jwt();

alter table veiculos_disponibilidade
  add column if not exists devolucao_registrada_por_id uuid references usuarios(id);
comment on column veiculos_disponibilidade.devolucao_registrada_por_id is
  'Quem registrou a entrada do veículo (a saída fica em registrado_por_id).';
