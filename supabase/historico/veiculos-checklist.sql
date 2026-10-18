-- Confluir — Veículos › Checklist (2026-09-04)
--
-- Verificação periódica da frota, com recorrência configurável e alerta na
-- página do veículo quando o prazo vence.
--
-- POR QUE NÃO REUSAR `veiculos_verificacao` (legado do Bubble): lá cada item é
-- um PAR DE COLUNAS fixo (buzina/buzina_ok, farois/farois_ok…, 18 itens).
-- Acrescentar um item exige alterar o schema, e a lista varia com a frota —
-- quem tem caminhão precisa de itens que quem só tem carro não precisa. Aqui o
-- item é LINHA de um catálogo por tenant, e a resposta aponta para ele. A
-- tabela antiga está vazia e sem uso no código; fica intocada.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

-- ── 1. Catálogo de itens (por tenant, editável) ──────────────────────────────

create table if not exists veiculos_checklist_itens (id uuid primary key default gen_random_uuid());
alter table veiculos_checklist_itens add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_checklist_itens add column if not exists categoria text;        -- sistema/categoria
alter table veiculos_checklist_itens add column if not exists itens_verificar text;  -- o que olhar
alter table veiculos_checklist_itens add column if not exists proposito text;        -- o que se previne (aparece na tela p/ quem confere)
alter table veiculos_checklist_itens add column if not exists ordem integer not null default 0;
alter table veiculos_checklist_itens add column if not exists ativo boolean not null default true;
alter table veiculos_checklist_itens add column if not exists created_at timestamptz not null default now();
alter table veiculos_checklist_itens add column if not exists updated_at timestamptz;

create unique index if not exists ux_veic_check_itens_categoria
  on veiculos_checklist_itens (emp_proprietaria_id, categoria);

alter table veiculos_checklist_itens enable row level security;
drop policy if exists tenant_isolation on veiculos_checklist_itens;
create policy tenant_isolation on veiculos_checklist_itens for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on veiculos_checklist_itens to authenticated;
drop trigger if exists set_emp_from_jwt on veiculos_checklist_itens;
create trigger set_emp_from_jwt before insert on veiculos_checklist_itens
  for each row execute function public.set_emp_from_jwt();

-- ── 2. Configuração da recorrência (uma por tenant) ──────────────────────────

create table if not exists veiculos_checklist_config (id uuid primary key default gen_random_uuid());
alter table veiculos_checklist_config add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_checklist_config add column if not exists recorrencia_dias integer not null default 30;
alter table veiculos_checklist_config add column if not exists alerta_antecedencia_dias integer not null default 3;  -- avisa antes de vencer
alter table veiculos_checklist_config add column if not exists ativo boolean not null default true;
alter table veiculos_checklist_config add column if not exists atualizada_por uuid references usuarios(id);
alter table veiculos_checklist_config add column if not exists created_at timestamptz not null default now();
alter table veiculos_checklist_config add column if not exists updated_at timestamptz;

create unique index if not exists ux_veic_check_config_emp
  on veiculos_checklist_config (emp_proprietaria_id);

alter table veiculos_checklist_config enable row level security;
drop policy if exists tenant_isolation on veiculos_checklist_config;
create policy tenant_isolation on veiculos_checklist_config for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on veiculos_checklist_config to authenticated;
drop trigger if exists set_emp_from_jwt on veiculos_checklist_config;
create trigger set_emp_from_jwt before insert on veiculos_checklist_config
  for each row execute function public.set_emp_from_jwt();

-- Recorrência PRÓPRIA do veículo (opcional): a van que roda todo dia precisa de
-- verificação mais frequente que o carro que sai uma vez por mês. Nulo = usa a
-- recorrência do tenant.
alter table veiculos add column if not exists checklist_recorrencia_dias integer;

-- ── 3. Checklist realizado ───────────────────────────────────────────────────

create table if not exists veiculos_checklists (id uuid primary key default gen_random_uuid());
alter table veiculos_checklists add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_checklists add column if not exists veiculo_id uuid references veiculos(id);
alter table veiculos_checklists add column if not exists realizado_em timestamptz not null default now();
alter table veiculos_checklists add column if not exists hodometro numeric;
alter table veiculos_checklists add column if not exists inspetor_id uuid references usuarios(id);
alter table veiculos_checklists add column if not exists observacoes text;
-- Contagem de itens fora de conformidade, gravada na conclusão: evita recontar
-- as respostas toda vez que a lista da frota é montada.
alter table veiculos_checklists add column if not exists pendencias integer not null default 0;
alter table veiculos_checklists add column if not exists created_at timestamptz not null default now();
alter table veiculos_checklists add column if not exists updated_at timestamptz;

create index if not exists idx_veic_checklists_veiculo
  on veiculos_checklists (emp_proprietaria_id, veiculo_id, realizado_em desc);

alter table veiculos_checklists enable row level security;
drop policy if exists tenant_isolation on veiculos_checklists;
create policy tenant_isolation on veiculos_checklists for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on veiculos_checklists to authenticated;
drop trigger if exists set_emp_from_jwt on veiculos_checklists;
create trigger set_emp_from_jwt before insert on veiculos_checklists
  for each row execute function public.set_emp_from_jwt();

-- ── 4. Resposta por item ─────────────────────────────────────────────────────

create table if not exists veiculos_checklist_respostas (id uuid primary key default gen_random_uuid());
alter table veiculos_checklist_respostas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table veiculos_checklist_respostas add column if not exists checklist_id uuid references veiculos_checklists(id) on delete cascade;
alter table veiculos_checklist_respostas add column if not exists item_id uuid references veiculos_checklist_itens(id);
-- Categoria CONGELADA: o catálogo pode ser renomeado ou desativado depois, e o
-- histórico precisa continuar legível.
alter table veiculos_checklist_respostas add column if not exists categoria text;
alter table veiculos_checklist_respostas add column if not exists situacao text;      -- conforme | nao_conforme | nao_aplica
alter table veiculos_checklist_respostas add column if not exists observacao text;
alter table veiculos_checklist_respostas add column if not exists created_at timestamptz not null default now();

create index if not exists idx_veic_check_resp_checklist
  on veiculos_checklist_respostas (checklist_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_veic_check_resp_situacao') then
    alter table veiculos_checklist_respostas
      add constraint ck_veic_check_resp_situacao
      check (situacao in ('conforme', 'nao_conforme', 'nao_aplica')) not valid;
  end if;
end $$;

alter table veiculos_checklist_respostas enable row level security;
drop policy if exists tenant_isolation on veiculos_checklist_respostas;
create policy tenant_isolation on veiculos_checklist_respostas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on veiculos_checklist_respostas to authenticated;
drop trigger if exists set_emp_from_jwt on veiculos_checklist_respostas;
create trigger set_emp_from_jwt before insert on veiculos_checklist_respostas
  for each row execute function public.set_emp_from_jwt();

-- ── 5. Permissão dedicada ────────────────────────────────────────────────────
--
-- Quem realiza a verificação é um FUNCIONÁRIO DEDICADO, não qualquer pessoa com
-- acesso a Veículos. A chave própria permite dar a ele exatamente isso, sem
-- abrir a gestão da frota inteira.
--
-- `permissoes` tem uma COLUNA por chave (override individual); `perfil_permissoes`
-- guarda a chave como texto e não precisa de alteração.

alter table permissoes add column if not exists veiculos_checklist boolean;

-- ── 6. Itens iniciais, para cada tenant que ainda não tem nenhum ─────────────
--
-- Data-driven: percorre os tenants existentes, não cita nenhum. São os oito
-- sistemas do checklist padrão; o tenant edita, desativa e acrescenta os seus.

insert into veiculos_checklist_itens
  (emp_proprietaria_id, categoria, itens_verificar, proposito, ordem)
select e.id, c.categoria, c.itens, c.proposito, c.ordem
from (select distinct emp_proprietaria_id as id from usuarios where emp_proprietaria_id is not null) e
cross join (values
  ('Fluidos e Motor',
   'Nível do óleo do motor, líquido de arrefecimento, fluido de freio e água do limpador de para-brisa.',
   'Prevenir fundição do motor, superaquecimento e perda de eficiência na frenagem.', 1),
  ('Vazamentos',
   'Inspeção visual do piso sob o veículo antes de movê-lo.',
   'Identificar gotejamento de óleo, combustível ou fluidos vitais precocemente.', 2),
  ('Pneus e Rodas',
   'Pressão (visual ou com calibrador) e desgaste da banda de rodagem (incluindo o estepe).',
   'Evitar aquaplanagem, desgaste irregular, aumento no consumo de combustível e risco de estouros em trânsito.', 3),
  ('Iluminação',
   'Faróis (altos e baixos), setas, luzes de freio, marcha à ré, lanternas e pisca-alerta.',
   'Evitar autuações de trânsito e garantir comunicação visual e condução noturna seguras.', 4),
  ('Painel de Instrumentos',
   'Indicadores e luzes de advertência (bateria, injeção eletrônica, pressão do óleo, ABS, temperatura) após a ignição.',
   'Detectar falhas elétricas, mecânicas ou anomalias de sensores antes de colocar o veículo em rota.', 5),
  ('Visibilidade',
   'Condição das palhetas do limpador, funcionamento do esguicho e integridade dos vidros e retrovisores.',
   'Assegurar campo de visão limpo e imediato em caso de chuva ou vias com poeira/lama.', 6),
  ('Segurança e Emergência',
   'Presença e fácil acesso do triângulo, macaco, chave de roda e teste de travamento de todos os cintos de segurança.',
   'Garantir pronta resposta e segurança dos ocupantes em caso de furos de pneu ou paradas emergenciais na via.', 7),
  ('Comandos e Cabine',
   'Teste de acionamento da buzina, folga no volante, curso do pedal de freio e verificação de odores incomuns (combustível, fio queimado).',
   'Identificar princípios de curto-circuito, vazamentos internos ou desgaste no sistema de direção e freios.', 8)
) as c(categoria, itens, proposito, ordem)
where not exists (
  select 1 from veiculos_checklist_itens x where x.emp_proprietaria_id = e.id
)
on conflict do nothing;

-- Configuração inicial (30 dias) para quem ainda não tem.
insert into veiculos_checklist_config (emp_proprietaria_id, recorrencia_dias)
select e.id, 30
from (select distinct emp_proprietaria_id as id from usuarios where emp_proprietaria_id is not null) e
where not exists (
  select 1 from veiculos_checklist_config x where x.emp_proprietaria_id = e.id
)
on conflict do nothing;
