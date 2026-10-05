-- Confluir — API de leitura e webhooks de saída (2026-10-05, onda 5 / A9)
--
-- `api_chaves`: chaves por entidade (só o hash fica guardado; o token é
-- mostrado uma vez). `webhooks`: URLs que recebem eventos (ordem paga,
-- filiação aprovada, cupom reservado, cobrança paga…) assinados com HMAC.
-- `webhooks_entregas`: fila com tentativas e recuo; o cron reenvia o que
-- falhou. Catálogo de eventos e endpoints em src/lib/api-publica-catalogo.ts.
-- O código tolera as tabelas ausentes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.api_chaves (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  nome text not null,
  prefixo text not null,
  hash text not null unique,
  escopos text[] not null default array['leitura'],
  criada_por uuid,
  ultimo_uso_em timestamptz,
  usos bigint not null default 0,
  revogada_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_chaves_emp_idx on public.api_chaves (emp_proprietaria_id, revogada_em);

create table if not exists public.webhooks (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  url text not null,
  segredo text not null,
  eventos text[] not null default '{}',
  descricao text,
  ativo boolean not null default true,
  falhas_seguidas int not null default 0,
  ultimo_sucesso_em timestamptz,
  ultimo_erro text,
  criado_por uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists webhooks_emp_idx on public.webhooks (emp_proprietaria_id, ativo);

create table if not exists public.webhooks_entregas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  webhook_id uuid not null references public.webhooks (id) on delete cascade,
  evento text not null,
  payload jsonb not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'entregue', 'falhou')),
  tentativas int not null default 0,
  proxima_tentativa_em timestamptz not null default now(),
  ultimo_status int,
  ultimo_erro text,
  entregue_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_entregas_fila_idx on public.webhooks_entregas (situacao, proxima_tentativa_em) where situacao = 'pendente';
create index if not exists webhooks_entregas_webhook_idx on public.webhooks_entregas (webhook_id, created_at desc);

do $$
declare t text;
begin
  foreach t in array array['api_chaves', 'webhooks', 'webhooks_entregas'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('create policy tenant_isolation on public.%I for all to authenticated using (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid) with check (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
  if exists (select 1 from pg_proc where proname = 'registrar_auditoria') then
    execute 'drop trigger if exists auditoria_registrar on public.api_chaves';
    execute 'create trigger auditoria_registrar after insert or update or delete on public.api_chaves for each row execute function public.registrar_auditoria()';
    execute 'drop trigger if exists auditoria_registrar on public.webhooks';
    execute 'create trigger auditoria_registrar after insert or update or delete on public.webhooks for each row execute function public.registrar_auditoria()';
  end if;
end $$;
