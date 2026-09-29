-- ═══════════════════════════════════════════════════════════════════════════
-- VIAGENS — EVENTO EXTERNO E CONFIGURAÇÕES (2026-09-25). Idempotente.
-- Roda depois de supabase/viagens.sql.
--
-- Pedido do Bruno (25/09):
--  1. Passagem e hospedagem também servem a eventos EXTERNOS (congresso da
--     federação, audiência em Brasília) — que não estão cadastrados em
--     Eventos. O evento continua facultativo; quando é de fora, vai o nome.
--  2. Viagens ganha uma área de Configurações: além das contas (que moram no
--     de-para das diárias), quem avisar quando chega pedido novo, a
--     antecedência recomendada e as orientações mostradas no formulário.
-- ═══════════════════════════════════════════════════════════════════════════

alter table public.viagens_solicitacoes
  add column if not exists evento_externo text;

comment on column public.viagens_solicitacoes.evento_externo is
  'Nome do evento de fora (não cadastrado em Eventos). Excludente com evento_id.';

create table if not exists public.viagens_config (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid references public.empresa (id),
  -- E-mails (separados por vírgula) avisados a cada pedido novo.
  emails_aviso text,
  -- Dias de antecedência recomendados; pedido mais em cima ganha alerta.
  antecedencia_dias integer check (antecedencia_dias is null or antecedencia_dias between 0 and 365),
  -- Texto mostrado no topo do formulário de pedido (política de viagens).
  orientacoes text,
  updated_by uuid references public.usuarios (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz
);

create unique index if not exists ux_viagens_config_emp
  on public.viagens_config (emp_proprietaria_id);

comment on table public.viagens_config is
  'Configuração de Viagens por entidade (uma linha): aviso de pedidos novos, antecedência e orientações.';

do $$
declare t text;
begin
  foreach t in array array['viagens_config'] loop
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
