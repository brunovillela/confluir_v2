-- ============================================================================
-- Pessoal › Contracheques geram ordem de pagamento (2026-09-14).
-- Idempotente — rodar no SQL Editor do Supabase.
--
-- Pedido do Bruno: o registro do contracheque gera uma ORDEM DE PAGAMENTO em
-- favor do funcionário, com o contracheque no lugar da nota fiscal como
-- comprovante da despesa; e uma área de configuração (centro de custo,
-- dados bancários etc.).
-- • O contracheque ganha o VALOR LÍQUIDO (a ordem precisa de valor) e o
--   vínculo com a ordem gerada.
-- • A remessa ganha a DATA DE PAGAMENTO, que vira o vencimento das ordens.
-- • pessoal_contracheques_config (1 por tenant): liga/desliga a geração,
--   centro de custo de despesa, departamento e forma de pagamento padrão.
-- • Os dados bancários do funcionário usam a tabela `dados_bancarios` que já
--   existe (usuario_id) — nenhuma coluna nova ali.
-- • O PDF do contracheque é COPIADO para o bucket `comprovantes`
--   (ordens/contracheques/<id>.pdf) e gravado em arquivo_nota_fiscal: o
--   comprovante da despesa não some se o contracheque for trocado.
-- ============================================================================

alter table pessoal_contracheques add column if not exists valor_liquido numeric(14, 2);
alter table pessoal_contracheques add column if not exists ordem_pagamento_id uuid
  references ordens_pagamento(id) on delete set null;
create index if not exists idx_pessoal_contracheques_ordem
  on pessoal_contracheques (ordem_pagamento_id);

comment on column pessoal_contracheques.valor_liquido is
  'Valor líquido a pagar ao funcionário — vira o valor da ordem de pagamento.';
comment on column pessoal_contracheques.ordem_pagamento_id is
  'Ordem de pagamento gerada no registro do contracheque (tipo Folha de pagamento).';

alter table pessoal_contracheques_remessas add column if not exists data_pagamento date;
comment on column pessoal_contracheques_remessas.data_pagamento is
  'Dia do pagamento da folha — vencimento das ordens geradas pelos contracheques.';

create table if not exists pessoal_contracheques_config (id uuid primary key default gen_random_uuid());
alter table pessoal_contracheques_config add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_contracheques_config add column if not exists gerar_ordem boolean not null default true;
alter table pessoal_contracheques_config add column if not exists centro_custo_despesa_id uuid references centros_de_custo(id);
alter table pessoal_contracheques_config add column if not exists departamento_id uuid references empresa_departamentos(id);
alter table pessoal_contracheques_config add column if not exists forma_pagamento text not null default 'Depósito bancário (TED)';
alter table pessoal_contracheques_config add column if not exists atualizada_por uuid references usuarios(id);
alter table pessoal_contracheques_config add column if not exists created_at timestamptz not null default now();
alter table pessoal_contracheques_config add column if not exists updated_at timestamptz;

create unique index if not exists ux_pessoal_contracheques_config_emp
  on pessoal_contracheques_config (emp_proprietaria_id);

alter table pessoal_contracheques_config enable row level security;
drop policy if exists tenant_isolation on pessoal_contracheques_config;
create policy tenant_isolation on pessoal_contracheques_config for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on pessoal_contracheques_config to authenticated;
drop trigger if exists set_emp_from_jwt on pessoal_contracheques_config;
create trigger set_emp_from_jwt before insert on pessoal_contracheques_config
  for each row execute function public.set_emp_from_jwt();
