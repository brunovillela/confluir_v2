-- Confluir — Compras › Contratos › RPA (2026-08-31)
--
-- RPA (Recibo de Pagamento a Autônomo): recibo emitido a um prestador PESSOA
-- FÍSICA (fornecedor do cadastro), que baixa em PDF, assina e devolve — vale
-- como comprovante fiscal do serviço. O usuário parte do valor BRUTO (calcula
-- retenções e chega ao líquido) ou do LÍQUIDO (conta inversa acha o bruto).
-- Retenções: INSS (com teto), IRRF (tabela progressiva) e ISS — tabelas
-- configuráveis por tenant (mudam todo ano).
--
-- Idempotente, RLS inline por tenant. Executar UMA VEZ no SQL Editor.

-- 1. Configuração das tabelas de retenção (1 por tenant) ------------------------
create table if not exists compras_rpa_config (id uuid primary key default gen_random_uuid());
alter table compras_rpa_config add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table compras_rpa_config add column if not exists inss_aliquota numeric;            -- % (padrão 11)
alter table compras_rpa_config add column if not exists inss_teto numeric;                -- R$ teto salário-contribuição
alter table compras_rpa_config add column if not exists irrf_faixas jsonb;                -- [{ate, aliquota, deduzir}]
alter table compras_rpa_config add column if not exists irrf_deducao_dependente numeric;  -- R$/dependente
alter table compras_rpa_config add column if not exists iss_aliquota_padrao numeric;      -- %
alter table compras_rpa_config add column if not exists created_at timestamptz not null default now();
alter table compras_rpa_config add column if not exists updated_at timestamptz;
create unique index if not exists ux_compras_rpa_config_emp
  on compras_rpa_config (emp_proprietaria_id);

-- 2. Recibos --------------------------------------------------------------------
create table if not exists compras_rpa (id uuid primary key default gen_random_uuid());
alter table compras_rpa add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table compras_rpa add column if not exists numero integer;                 -- sequencial por tenant
alter table compras_rpa add column if not exists fornecedor_id uuid references empresa(id);
alter table compras_rpa add column if not exists descricao_servico text;
alter table compras_rpa add column if not exists data_servico date;
alter table compras_rpa add column if not exists base text;                      -- bruto | liquido (o que foi informado)
alter table compras_rpa add column if not exists valor_informado numeric;
alter table compras_rpa add column if not exists valor_bruto numeric;
alter table compras_rpa add column if not exists inss numeric;
alter table compras_rpa add column if not exists irrf numeric;
alter table compras_rpa add column if not exists iss numeric;
alter table compras_rpa add column if not exists iss_aliquota numeric;
alter table compras_rpa add column if not exists dependentes integer not null default 0;
alter table compras_rpa add column if not exists valor_liquido numeric;
alter table compras_rpa add column if not exists observacoes text;
alter table compras_rpa add column if not exists criado_por uuid references usuarios(id);
alter table compras_rpa add column if not exists created_at timestamptz not null default now();
alter table compras_rpa add column if not exists updated_at timestamptz;
create unique index if not exists ux_compras_rpa_numero
  on compras_rpa (emp_proprietaria_id, numero);
create index if not exists idx_compras_rpa_fornecedor
  on compras_rpa (fornecedor_id);

-- 3. RLS por tenant (inline — padrão da casa) -----------------------------------
alter table compras_rpa_config enable row level security;
drop policy if exists tenant_isolation on compras_rpa_config;
create policy tenant_isolation on compras_rpa_config for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on compras_rpa_config to authenticated;
drop trigger if exists set_emp_from_jwt on compras_rpa_config;
create trigger set_emp_from_jwt before insert on compras_rpa_config
  for each row execute function public.set_emp_from_jwt();

alter table compras_rpa enable row level security;
drop policy if exists tenant_isolation on compras_rpa;
create policy tenant_isolation on compras_rpa for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on compras_rpa to authenticated;
drop trigger if exists set_emp_from_jwt on compras_rpa;
create trigger set_emp_from_jwt before insert on compras_rpa
  for each row execute function public.set_emp_from_jwt();
