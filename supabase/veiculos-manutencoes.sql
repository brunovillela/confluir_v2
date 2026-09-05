-- Confluir — Veículos › Manutenções (2026-09-04)
--
-- Duas coisas diferentes, em duas tabelas:
--   • `veiculos_manutencoes` — o que ACONTECEU (o prontuário do veículo).
--   • `veiculos_manutencao_planos` — o que DEVE acontecer (a preventiva
--     programada, que gera os alertas).
--
-- O plano vence por DATA e/ou por QUILOMETRAGEM, o que ocorrer primeiro — é
-- como o manual do fabricante fala ("a cada 10.000 km ou 12 meses"). Por isso
-- os dois intervalos convivem e qualquer um deles pode ficar vazio.
--
-- GARANTIA: guardada em meses e/ou km a partir da execução. Serve para uma
-- pergunta que ninguém consegue responder hoje — "esse conserto já não tinha
-- sido feito?" — porque o sistema passa a apontar quando um serviço volta à
-- oficina ainda dentro da garantia do anterior.
--
-- VÍNCULO COM COMPRAS: o local é um FORNECEDOR já cadastrado (tabela empresa),
-- e a manutenção pode apontar para a compra que a pagou. Assim o valor não é
-- redigitado e a nota fiscal tem um dono só.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

-- ── 1. Manutenções realizadas (o prontuário) ─────────────────────────────────

create table if not exists veiculos_manutencoes (id uuid primary key default gen_random_uuid());
alter table veiculos_manutencoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_manutencoes add column if not exists veiculo_id uuid references veiculos(id);
alter table veiculos_manutencoes add column if not exists tipo text;                  -- preventiva | corretiva
alter table veiculos_manutencoes add column if not exists descricao text;
alter table veiculos_manutencoes add column if not exists realizada_em date;
alter table veiculos_manutencoes add column if not exists hodometro numeric;
-- Local: fornecedor cadastrado. O nome fica CONGELADO junto porque o cadastro
-- pode ser renomeado e o prontuário precisa continuar legível.
alter table veiculos_manutencoes add column if not exists local_id uuid references empresa(id);
alter table veiculos_manutencoes add column if not exists local_nome text;
alter table veiculos_manutencoes add column if not exists valor numeric;
-- Vínculo com Compras (opcional): a compra que pagou o serviço.
alter table veiculos_manutencoes add column if not exists compra_id uuid references compras_solicitacoes(id);
alter table veiculos_manutencoes add column if not exists nota_fiscal_numero text;
alter table veiculos_manutencoes add column if not exists nota_fiscal_url text;       -- caminho no bucket `veiculos`
-- Garantia do serviço
alter table veiculos_manutencoes add column if not exists garantia_meses integer;
alter table veiculos_manutencoes add column if not exists garantia_km integer;
alter table veiculos_manutencoes add column if not exists garantia_ate date;          -- derivada na gravação
alter table veiculos_manutencoes add column if not exists garantia_hodometro numeric; -- derivada na gravação
-- Quando a manutenção cumpre uma preventiva programada
alter table veiculos_manutencoes add column if not exists plano_id uuid;
alter table veiculos_manutencoes add column if not exists observacoes text;
alter table veiculos_manutencoes add column if not exists registrada_por uuid references usuarios(id);
alter table veiculos_manutencoes add column if not exists created_at timestamptz not null default now();
alter table veiculos_manutencoes add column if not exists updated_at timestamptz;

create index if not exists idx_veic_manut_veiculo
  on veiculos_manutencoes (emp_proprietaria_id, veiculo_id, realizada_em desc);
create index if not exists idx_veic_manut_plano
  on veiculos_manutencoes (plano_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_veic_manut_tipo') then
    alter table veiculos_manutencoes
      add constraint ck_veic_manut_tipo
      check (tipo in ('preventiva', 'corretiva')) not valid;
  end if;
end $$;

alter table veiculos_manutencoes enable row level security;
drop policy if exists tenant_isolation on veiculos_manutencoes;
create policy tenant_isolation on veiculos_manutencoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on veiculos_manutencoes to authenticated;
drop trigger if exists set_emp_from_jwt on veiculos_manutencoes;
create trigger set_emp_from_jwt before insert on veiculos_manutencoes
  for each row execute function public.set_emp_from_jwt();

-- ── 2. Preventivas programadas ───────────────────────────────────────────────
--
-- Por VEÍCULO, não por frota: cada carro tem sua quilometragem e seu histórico.
-- `base_data`/`base_hodometro` são o ponto de partida do primeiro ciclo (antes
-- de existir qualquer execução registrada).

create table if not exists veiculos_manutencao_planos (id uuid primary key default gen_random_uuid());
alter table veiculos_manutencao_planos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_manutencao_planos add column if not exists veiculo_id uuid references veiculos(id);
alter table veiculos_manutencao_planos add column if not exists descricao text;       -- "Troca de óleo e filtro"
alter table veiculos_manutencao_planos add column if not exists intervalo_dias integer;
alter table veiculos_manutencao_planos add column if not exists intervalo_km integer;
alter table veiculos_manutencao_planos add column if not exists base_data date;
alter table veiculos_manutencao_planos add column if not exists base_hodometro numeric;
alter table veiculos_manutencao_planos add column if not exists alerta_dias integer not null default 15;
alter table veiculos_manutencao_planos add column if not exists alerta_km integer not null default 500;
alter table veiculos_manutencao_planos add column if not exists ativo boolean not null default true;
alter table veiculos_manutencao_planos add column if not exists created_at timestamptz not null default now();
alter table veiculos_manutencao_planos add column if not exists updated_at timestamptz;

create index if not exists idx_veic_manut_planos_veiculo
  on veiculos_manutencao_planos (emp_proprietaria_id, veiculo_id);

-- Um plano precisa de PELO MENOS um intervalo, senão nunca vence e vira ruído.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_veic_planos_intervalo') then
    alter table veiculos_manutencao_planos
      add constraint ck_veic_planos_intervalo
      check (coalesce(intervalo_dias, 0) > 0 or coalesce(intervalo_km, 0) > 0) not valid;
  end if;
end $$;

alter table veiculos_manutencao_planos enable row level security;
drop policy if exists tenant_isolation on veiculos_manutencao_planos;
create policy tenant_isolation on veiculos_manutencao_planos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on veiculos_manutencao_planos to authenticated;
drop trigger if exists set_emp_from_jwt on veiculos_manutencao_planos;
create trigger set_emp_from_jwt before insert on veiculos_manutencao_planos
  for each row execute function public.set_emp_from_jwt();

-- FK do plano só depois que a tabela existe (as duas se referenciam na ordem
-- inversa da criação).
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'fk_veic_manut_plano') then
    alter table veiculos_manutencoes
      add constraint fk_veic_manut_plano
      foreign key (plano_id) references veiculos_manutencao_planos(id) on delete set null;
  end if;
end $$;

-- ── 3. Permissão dedicada ────────────────────────────────────────────────────
--
-- Mesma lógica do checklist: quem registra manutenção não é qualquer pessoa com
-- acesso a Veículos. `permissoes` tem uma COLUNA por chave.

alter table permissoes add column if not exists veiculos_manutencao boolean;
