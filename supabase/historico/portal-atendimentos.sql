-- Confluir — Atendimento ao filiado pelo portal (2026-10-04, onda 4 / F2)
--
-- O filiado abre uma solicitação (jurídico, saúde, cadastro, reembolso,
-- reclamação, outro) com anexo, acompanha a situação e conversa com a
-- entidade na própria solicitação. No painel ela vira uma Demanda
-- (Ferramentas → Demandas) com prazo pelo SLA do assunto; a resposta ao
-- filiado sai pela tela da demanda ou por Filiados → Atendimentos.
-- Assuntos e prazos em src/lib/atendimento-constantes.ts. O código tolera as
-- tabelas ausentes.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

create table if not exists public.portal_atendimentos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  cpf text not null,
  filiacao_id uuid references public.filiacoes (id) on delete set null,
  nome text,
  email text,
  assunto text not null,
  titulo text not null,
  situacao text not null default 'aberta'
    check (situacao in ('aberta', 'em_andamento', 'respondida', 'concluida')),
  prazo date,
  demanda_id uuid references public.demandas (id) on delete set null,
  primeira_resposta_em timestamptz,
  concluida_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists portal_atendimentos_cpf_idx on public.portal_atendimentos (emp_proprietaria_id, cpf, created_at desc);
create index if not exists portal_atendimentos_situacao_idx on public.portal_atendimentos (emp_proprietaria_id, situacao, prazo);
create index if not exists portal_atendimentos_demanda_idx on public.portal_atendimentos (demanda_id);

alter table public.portal_atendimentos enable row level security;
drop policy if exists tenant_isolation on public.portal_atendimentos;
create policy tenant_isolation on public.portal_atendimentos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.portal_atendimentos to authenticated;
drop trigger if exists set_emp_from_jwt on public.portal_atendimentos;
create trigger set_emp_from_jwt before insert on public.portal_atendimentos
  for each row execute function public.set_emp_from_jwt();

create table if not exists public.portal_atendimentos_mensagens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  atendimento_id uuid not null references public.portal_atendimentos (id) on delete cascade,
  autor text not null check (autor in ('filiado', 'entidade')),
  autor_nome text,
  autor_usuario_id uuid,
  texto text not null,
  anexo_caminho text,
  anexo_nome text,
  created_at timestamptz not null default now()
);
create index if not exists portal_atendimentos_mensagens_idx on public.portal_atendimentos_mensagens (atendimento_id, created_at);

alter table public.portal_atendimentos_mensagens enable row level security;
drop policy if exists tenant_isolation on public.portal_atendimentos_mensagens;
create policy tenant_isolation on public.portal_atendimentos_mensagens for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on public.portal_atendimentos_mensagens to authenticated;
drop trigger if exists set_emp_from_jwt on public.portal_atendimentos_mensagens;
create trigger set_emp_from_jwt before insert on public.portal_atendimentos_mensagens
  for each row execute function public.set_emp_from_jwt();

-- Trilha de auditoria (supabase/auditoria.sql), se a função existir.
do $$
begin
  if exists (select 1 from pg_proc where proname = 'registrar_auditoria') then
    execute 'drop trigger if exists auditoria_registrar on public.portal_atendimentos';
    execute 'create trigger auditoria_registrar after insert or update or delete on public.portal_atendimentos for each row execute function public.registrar_auditoria()';
  end if;
end $$;
