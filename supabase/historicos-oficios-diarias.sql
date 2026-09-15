-- ============================================================================
-- Históricos do Bubble: OFÍCIOS e DIÁRIAS (2026-09-15). Idempotente — rodar no
-- SQL Editor do Supabase ANTES de scripts/migrar-historicos-bubble.mjs.
--
-- Pedido do Bruno: trazer os históricos de filiação, ofícios, tipos de diárias
-- e diárias (remessas e lançamentos). A filiação usa os scripts da virada; este
-- SQL cria o que faltava de MODELO para os outros três.
--
-- OFÍCIOS — a tabela daqui foi desenhada para o ofício gerado no Confluir (o
-- PDF sai do corpo). No Bubble o documento real é o ARQUIVO: 458 ofícios têm o
-- PDF assinado e 8 guardam as respostas recebidas. Também
-- vêm o departamento emissor e o redator. Os arquivos vão para o bucket
-- `documentos` (oficios/<id>/…).
--
-- DIÁRIAS — no Bubble a diária é LANÇADA dia a dia (tipo, atividade, local,
-- valor), os lançamentos se agrupam numa REMESSA do beneficiário (período,
-- departamento, forma de pagamento), que é enviada, avaliada e gera a ordem de
-- pagamento; um lançamento pode ter DESPESAS com comprovante. Aqui o módulo
-- novo é por solicitação (pessoal_diarias_solicitacoes); o histórico ganha as
-- três tabelas abaixo, só de leitura na tela. Os tipos do Bubble vão para
-- `financeiro_diarias` (a mesma tabela dos tipos do módulo novo).
-- ============================================================================

-- ── Ofícios ─────────────────────────────────────────────────────────────────

alter table oficios add column if not exists arquivo_assinado text;      -- caminho no bucket documentos (ou URL do CDN até migrar)
alter table oficios add column if not exists arquivos_resposta text;     -- lista JSON de caminhos
alter table oficios add column if not exists departamento_id uuid references empresa_departamentos(id);
alter table oficios add column if not exists redator_id uuid references usuarios(id);

comment on column oficios.arquivo_assinado is 'PDF assinado do ofício (histórico do Bubble) — bucket documentos, oficios/<id>/.';
comment on column oficios.arquivos_resposta is 'Respostas recebidas ao ofício (lista JSON de caminhos no bucket documentos).';

-- ── Diárias: tipos ──────────────────────────────────────────────────────────

alter table financeiro_diarias add column if not exists descricao text;
alter table financeiro_diarias add column if not exists permanente boolean;
alter table financeiro_diarias add column if not exists usuarios_autorizados uuid[] not null default '{}';

comment on column financeiro_diarias.usuarios_autorizados is
  'Quem pode lançar este tipo (Bubble: USUARIOS AUTORIZADOS). Vazio = todos.';

-- ── Diárias: remessas (histórico) ───────────────────────────────────────────

create table if not exists pessoal_diarias_remessas (id uuid primary key default gen_random_uuid());
alter table pessoal_diarias_remessas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_diarias_remessas add column if not exists bubble_id text;
alter table pessoal_diarias_remessas add column if not exists codigo text;
alter table pessoal_diarias_remessas add column if not exists beneficiario_id uuid references usuarios(id);
alter table pessoal_diarias_remessas add column if not exists departamento_id uuid references empresa_departamentos(id);
alter table pessoal_diarias_remessas add column if not exists inicio date;
alter table pessoal_diarias_remessas add column if not exists termino date;
alter table pessoal_diarias_remessas add column if not exists ano integer;
alter table pessoal_diarias_remessas add column if not exists mes text;
alter table pessoal_diarias_remessas add column if not exists valor_total numeric(14, 2);
alter table pessoal_diarias_remessas add column if not exists enviado boolean;
alter table pessoal_diarias_remessas add column if not exists avaliacao_aprovado boolean;
alter table pessoal_diarias_remessas add column if not exists avaliacao_data timestamptz;
alter table pessoal_diarias_remessas add column if not exists avaliacao_observacao text;
alter table pessoal_diarias_remessas add column if not exists avaliador_id uuid references usuarios(id);
alter table pessoal_diarias_remessas add column if not exists forma_pagamento text;
alter table pessoal_diarias_remessas add column if not exists ordem_pagamento_id uuid references ordens_pagamento(id) on delete set null;
alter table pessoal_diarias_remessas add column if not exists pagamento_pago boolean;
alter table pessoal_diarias_remessas add column if not exists created_at timestamptz not null default now();
alter table pessoal_diarias_remessas add column if not exists updated_at timestamptz;

create unique index if not exists ux_pessoal_diarias_remessas_bubble on pessoal_diarias_remessas (bubble_id);
create index if not exists idx_pessoal_diarias_remessas_emp on pessoal_diarias_remessas (emp_proprietaria_id, inicio desc);
create index if not exists idx_pessoal_diarias_remessas_benef on pessoal_diarias_remessas (beneficiario_id);

-- ── Diárias: lançamentos diários (histórico) ────────────────────────────────

create table if not exists pessoal_diarias_lancamentos (id uuid primary key default gen_random_uuid());
alter table pessoal_diarias_lancamentos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_diarias_lancamentos add column if not exists bubble_id text;
alter table pessoal_diarias_lancamentos add column if not exists codigo text;
alter table pessoal_diarias_lancamentos add column if not exists remessa_id uuid references pessoal_diarias_remessas(id) on delete cascade;
alter table pessoal_diarias_lancamentos add column if not exists beneficiario_id uuid references usuarios(id);
alter table pessoal_diarias_lancamentos add column if not exists tipo_id uuid references financeiro_diarias(id);
alter table pessoal_diarias_lancamentos add column if not exists data date;
alter table pessoal_diarias_lancamentos add column if not exists atividade text;
alter table pessoal_diarias_lancamentos add column if not exists local text;
alter table pessoal_diarias_lancamentos add column if not exists valor_diaria numeric(14, 2);
alter table pessoal_diarias_lancamentos add column if not exists valor_despesas numeric(14, 2);
alter table pessoal_diarias_lancamentos add column if not exists valor_total numeric(14, 2);
alter table pessoal_diarias_lancamentos add column if not exists created_at timestamptz not null default now();
alter table pessoal_diarias_lancamentos add column if not exists updated_at timestamptz;

create unique index if not exists ux_pessoal_diarias_lancamentos_bubble on pessoal_diarias_lancamentos (bubble_id);
create index if not exists idx_pessoal_diarias_lancamentos_remessa on pessoal_diarias_lancamentos (remessa_id);
create index if not exists idx_pessoal_diarias_lancamentos_emp on pessoal_diarias_lancamentos (emp_proprietaria_id, data desc);

-- ── Diárias: despesas dos lançamentos (histórico) ───────────────────────────

create table if not exists pessoal_diarias_despesas (id uuid primary key default gen_random_uuid());
alter table pessoal_diarias_despesas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table pessoal_diarias_despesas add column if not exists bubble_id text;
alter table pessoal_diarias_despesas add column if not exists codigo text;
alter table pessoal_diarias_despesas add column if not exists lancamento_id uuid references pessoal_diarias_lancamentos(id) on delete cascade;
alter table pessoal_diarias_despesas add column if not exists beneficiario_id uuid references usuarios(id);
alter table pessoal_diarias_despesas add column if not exists tipo_despesa text;
alter table pessoal_diarias_despesas add column if not exists custo numeric(14, 2);
alter table pessoal_diarias_despesas add column if not exists comprovante text;   -- bucket pessoal, diarias/<id>/…
alter table pessoal_diarias_despesas add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_pessoal_diarias_despesas_bubble on pessoal_diarias_despesas (bubble_id);
create index if not exists idx_pessoal_diarias_despesas_lancamento on pessoal_diarias_despesas (lancamento_id);

-- ── RLS por tenant (padrão da casa) ─────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array['pessoal_diarias_remessas', 'pessoal_diarias_lancamentos', 'pessoal_diarias_despesas'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format(
      'create policy tenant_isolation on %I for all to authenticated
         using (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)
         with check (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)', t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on %I', t);
    execute format('create trigger set_emp_from_jwt before insert on %I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
