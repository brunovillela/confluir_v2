-- ============================================================================
-- Veículos › Infrações: aviso por e-mail com cópia configurável (2026-09-14).
-- Idempotente — rodar no SQL Editor do Supabase.
--
-- Pedido do Bruno: cada infração cadastrada dispara e-mail para o infrator
-- (já existia, agora com os dados da autuação) e pode mandar CÓPIA para
-- endereços configuráveis — ex.: financeiro, jurídico, coordenação da frota.
-- • A lista do tenant vem preenchida no formulário de cada infração, que pode
--   ser alterada ali (tirar ou acrescentar endereços só naquele registro).
-- • Quem recebeu fica no histórico da infração (veiculos_infracoes_historico).
-- Sem esta tabela, o infrator continua recebendo; só a cópia fica indisponível.
-- ============================================================================

create table if not exists veiculos_infracoes_config (id uuid primary key default gen_random_uuid());
alter table veiculos_infracoes_config add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_infracoes_config add column if not exists emails_copia text[] not null default '{}';
alter table veiculos_infracoes_config add column if not exists atualizada_por uuid references usuarios(id);
alter table veiculos_infracoes_config add column if not exists created_at timestamptz not null default now();
alter table veiculos_infracoes_config add column if not exists updated_at timestamptz;

create unique index if not exists ux_veic_infracoes_config_emp
  on veiculos_infracoes_config (emp_proprietaria_id);

alter table veiculos_infracoes_config enable row level security;
drop policy if exists tenant_isolation on veiculos_infracoes_config;
create policy tenant_isolation on veiculos_infracoes_config for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on veiculos_infracoes_config to authenticated;
drop trigger if exists set_emp_from_jwt on veiculos_infracoes_config;
create trigger set_emp_from_jwt before insert on veiculos_infracoes_config
  for each row execute function public.set_emp_from_jwt();
