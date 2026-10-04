-- Confluir — Conta bancária da entidade e remessa de pagamento CNAB 240 (2026-10-04, onda 5 / A2)
--
-- A entidade cadastra a(s) conta(s) de onde paga (agência, conta, convênio,
-- versões do layout). As ordens "A pagar" marcadas viram um arquivo CNAB 240
-- (padrão Febraban; segmentos A/B para crédito em conta, TED e Pix, J/J-52
-- para boleto) guardado em `financeiro_remessas.conteudo`; cada ordem entra
-- como item. O retorno do banco (também CNAB 240) marca o item pago ou
-- rejeitado — pago vira ordem "Paga" com a data e o valor do banco.
-- A ordem NÃO ganha situação nova: enquanto está num item ativo de remessa,
-- as telas mostram "em remessa". O código tolera as tabelas ausentes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.financeiro_contas_bancarias (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  apelido text not null,
  banco_codigo text not null,
  banco_nome text,
  agencia text not null,
  agencia_dv text,
  conta text not null,
  conta_dv text,
  tipo_conta text not null default 'corrente',
  convenio text,
  layout_versao_arquivo text,
  layout_versao_lote text,
  titular_nome text,
  titular_documento text,
  pix_chave text,
  centro_custo_id uuid references public.centros_de_custo (id) on delete set null,
  sequencia_remessa int not null default 0,
  ativa boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists financeiro_contas_bancarias_emp_idx on public.financeiro_contas_bancarias (emp_proprietaria_id, ativa);

create table if not exists public.financeiro_remessas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  conta_bancaria_id uuid not null references public.financeiro_contas_bancarias (id) on delete restrict,
  numero int not null,
  arquivo_nome text not null,
  conteudo text not null,
  total_itens int not null default 0,
  total_valor numeric(14,2) not null default 0,
  situacao text not null default 'gerada' check (situacao in ('gerada', 'enviada', 'retornada', 'cancelada')),
  gerada_por uuid,
  enviada_em timestamptz,
  retorno_nome text,
  retorno_conteudo text,
  retorno_em timestamptz,
  retorno_por uuid,
  retorno_resumo jsonb,
  created_at timestamptz not null default now(),
  unique (conta_bancaria_id, numero)
);
create index if not exists financeiro_remessas_emp_idx on public.financeiro_remessas (emp_proprietaria_id, created_at desc);

create table if not exists public.financeiro_remessa_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  remessa_id uuid not null references public.financeiro_remessas (id) on delete cascade,
  ordem_id uuid not null references public.ordens_pagamento (id) on delete cascade,
  seq int not null,
  segmento text not null check (segmento in ('A', 'J')),
  forma_lancamento text not null,
  favorecido_nome text,
  favorecido_documento text,
  banco_codigo text,
  agencia text,
  conta text,
  pix_chave text,
  codigo_barras text,
  valor numeric(14,2) not null,
  data_pagamento date not null,
  situacao text not null default 'enviado' check (situacao in ('enviado', 'pago', 'rejeitado', 'cancelado')),
  ocorrencia text,
  ocorrencia_descricao text,
  retorno_valor numeric(14,2),
  retorno_data date,
  created_at timestamptz not null default now(),
  unique (remessa_id, ordem_id)
);
create index if not exists financeiro_remessa_itens_ordem_idx on public.financeiro_remessa_itens (ordem_id, situacao);

-- Linha digitável do boleto, para a remessa (o PDF do boleto já existe em arquivo_boleto).
alter table public.ordens_pagamento add column if not exists boleto_linha_digitavel text;

do $$
declare t text;
begin
  foreach t in array array['financeiro_contas_bancarias', 'financeiro_remessas', 'financeiro_remessa_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('create policy tenant_isolation on public.%I for all to authenticated using (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid) with check (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    if exists (select 1 from pg_proc where proname = 'registrar_auditoria') then
      execute format('drop trigger if exists auditoria_registrar on public.%I', t);
      execute format('create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
    end if;
  end loop;
end $$;
