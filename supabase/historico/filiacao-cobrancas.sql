-- Confluir — Cobrança da contribuição por Pix (2026-10-05, onda 5 / A3)
--
-- Quem não é consignado (`filiacoes.forma_recebimento` = pix) recebe, por
-- competência, uma cobrança com Pix estático (BR Code com a chave da
-- entidade e um `txid` próprio). O pagamento é identificado pelo txid no
-- extrato (conciliação, onda 5 / A1) ou dado baixa à mão; a baixa gera a
-- linha em `filiacao_recebe` numa remessa "Associativa" da competência,
-- para a arrecadação e a inadimplência enxergarem. Boleto e QR dinâmico
-- entram com o provedor (campos `provedor`/`provedor_ref`). O código tolera
-- as tabelas ausentes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.filiacao_cobranca_config (
  emp_proprietaria_id uuid primary key,
  valor_mensal numeric(12,2),
  dia_vencimento int not null default 10 check (dia_vencimento between 1 and 28),
  gerar_automatico boolean not null default true,
  mensagem text,
  updated_at timestamptz not null default now()
);

-- Valor próprio da pessoa, quando difere do padrão da entidade.
alter table public.filiacoes add column if not exists contribuicao_valor numeric(12,2);

create table if not exists public.filiacao_cobrancas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  filiacao_id uuid not null references public.filiacoes (id) on delete cascade,
  cpf text,
  competencia text not null,
  ordem int not null,
  valor numeric(12,2) not null,
  forma text not null default 'pix' check (forma in ('pix', 'boleto')),
  vencimento date not null,
  txid text not null,
  brcode text,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'paga', 'cancelada')),
  pago_em date,
  valor_pago numeric(12,2),
  lancamento_id uuid,
  banco_lancamento_id uuid,
  provedor text not null default 'pix-estatico',
  provedor_ref text,
  avisada_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (emp_proprietaria_id, txid),
  unique (filiacao_id, competencia)
);
create index if not exists filiacao_cobrancas_emp_comp_idx on public.filiacao_cobrancas (emp_proprietaria_id, competencia, situacao);
create index if not exists filiacao_cobrancas_cpf_idx on public.filiacao_cobrancas (emp_proprietaria_id, cpf);

-- O lançamento do extrato pode apontar para a cobrança que ele pagou.
alter table public.banco_lancamentos add column if not exists cobranca_id uuid references public.filiacao_cobrancas (id) on delete set null;

do $$
declare t text;
begin
  foreach t in array array['filiacao_cobranca_config', 'filiacao_cobrancas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('create policy tenant_isolation on public.%I for all to authenticated using (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid) with check (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
  if exists (select 1 from pg_proc where proname = 'registrar_auditoria') then
    execute 'drop trigger if exists auditoria_registrar on public.filiacao_cobrancas';
    execute 'create trigger auditoria_registrar after update or delete on public.filiacao_cobrancas for each row execute function public.registrar_auditoria()';
  end if;
end $$;
