-- Confluir — Push no celular para o associado (2026-10-11, onda 2 / A52)
--
-- O aviso do sino do portal também chega como notificação no celular, para
-- quem ligou "Receber no celular" em Portal → Avisos → Preferências. O envio
-- usa as mesmas chaves VAPID do painel (NEXT_PUBLIC_VAPID_PUBLIC_KEY /
-- VAPID_PRIVATE_KEY) e respeita a mesma preferência por tipo do e-mail
-- (portal_avisos_preferencias.email_prefs).
--
-- POR QUE TABELA PRÓPRIA, e não uma coluna `cpf` em push_assinaturas:
--   · push_assinaturas.usuario_id é NOT NULL com FK para usuarios, e o painel
--     conta com isso. Abrir para nulo misturaria duas identidades na mesma
--     linha: o service worker é um só, então o mesmo navegador assina painel e
--     portal com o MESMO endpoint — e o "Desligar" de uma área apagaria a
--     outra.
--   · Aqui o endpoint é único por ENTIDADE (emp + endpoint), não no banco
--     todo: nada que chegue pelo subdomínio de uma entidade sobrescreve a
--     assinatura de outra.
--   · O associado é identificado pelo CPF, como o sino (portal_avisos).
--
-- RLS igual ao do sino do portal: policy tenant_isolation (leitura e escrita
-- pelo JWT do tenant — NUNCA deny-all, que o createAdminClient não lê),
-- grants para authenticated e o trigger que preenche o emp. Sem acesso anon.
--
-- O código tolera a tabela ausente: sem ela o card some de Preferências e o
-- aviso segue para o sino e o e-mail, sem push.
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente. Depois de rodar,
-- pode-se acrescentar "portal_push_assinaturas" em TABELAS_TENANT
-- (src/lib/supabase/tabelas-tenant.ts) para a escrita também passar pelo JWT
-- do tenant; fora da lista ela segue pelo service role, escopada pelo código.

create table if not exists public.portal_push_assinaturas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  cpf text not null,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  usado_em timestamptz
);

-- Restrições à parte do create: valem também se a tabela já existia.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'portal_push_assinaturas_emp_endpoint_key') then
    alter table public.portal_push_assinaturas
      add constraint portal_push_assinaturas_emp_endpoint_key unique (emp_proprietaria_id, endpoint);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'portal_push_assinaturas_cpf_check') then
    alter table public.portal_push_assinaturas
      add constraint portal_push_assinaturas_cpf_check check (cpf ~ '^[0-9]{11}$');
  end if;
end
$$;

create index if not exists portal_push_assinaturas_cpf_idx
  on public.portal_push_assinaturas (emp_proprietaria_id, cpf);

alter table public.portal_push_assinaturas enable row level security;
drop policy if exists tenant_isolation on public.portal_push_assinaturas;
create policy tenant_isolation on public.portal_push_assinaturas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
revoke all on public.portal_push_assinaturas from anon;
grant select, insert, update, delete on public.portal_push_assinaturas to authenticated;
drop trigger if exists set_emp_from_jwt on public.portal_push_assinaturas;
create trigger set_emp_from_jwt before insert on public.portal_push_assinaturas
  for each row execute function public.set_emp_from_jwt();

-- Conferência (deve devolver 1 linha com rls = true e a policy):
-- select c.relname, c.relrowsecurity as rls, p.polname
--   from pg_class c left join pg_policy p on p.polrelid = c.oid
--  where c.relname = 'portal_push_assinaturas';
