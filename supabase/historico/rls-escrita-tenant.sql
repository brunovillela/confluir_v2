-- Confluir — endurecimento da ESCRITA por tenant (backstop, parte 2) (2026-07-24)
--
-- A parte 1 (rls-tenant-isolation.sql) fechou a LEITURA: o cliente do tenant
-- assina um JWT `authenticated` com a claim tenant_id e o RLS isola. Mas a
-- ESCRITA ainda ia pelo service_role (que IGNORA o RLS), porque o papel
-- `authenticated` não tinha GRANT de escrita nas tabelas migradas do Bubble.
--
-- Esta parte fecha a ESCRITA nas 109 tabelas tenant-owned:
--   1. GRANT insert/update/delete ao `authenticated` (o RLS já gateia: WITH
--      CHECK barra inserir/atualizar com emp de outro tenant; USING barra
--      tocar linha de outro tenant no update/delete).
--   2. Trigger BEFORE INSERT que PREENCHE emp_proprietaria_id a partir do
--      JWT quando vier nulo — assim o código que esquece de setar emp continua
--      funcionando e o WITH CHECK passa.
--
-- Alvo = exatamente as tabelas que receberam a policy `tenant_isolation` na
-- parte 1 (lidas de pg_policies, sem duplicar a lista — não pode divergir).
-- As tabelas GLOBAIS (sem emp_proprietaria_id, escopadas por FK ao pai:
-- notificacoes, dados_bancarios, aso, pes_atestados_medicos, hospedagem_cupom,
-- saude_atendimentos_relatorio, junções…) ficam de fora e seguem gravando
-- pelo service_role.
--
-- SEGURO RODAR ANTES de trocar o Proxy: o app ainda grava via service_role
-- (que ignora o RLS e já seta emp), então os GRANTs ficam ociosos e o trigger
-- é no-op para o service (auth.jwt() não traz tenant_id → não preenche nada).
-- Idempotente. Executar UMA VEZ no SQL Editor do Supabase.

-- Preenche emp_proprietaria_id com o tenant do JWT quando o insert não informa.
-- SECURITY INVOKER (padrão): só lê a claim e ajusta NEW, sem privilégio extra.
-- Para o service_role, auth.jwt() não tem 'tenant_id' → o coalesce mantém o
-- valor recebido (inclusive NULL, como na org própria criada pelo controlador).
create or replace function public.set_emp_from_jwt()
returns trigger
language plpgsql
as $fn$
begin
  new.emp_proprietaria_id := coalesce(
    new.emp_proprietaria_id,
    nullif(auth.jwt() ->> 'tenant_id', '')::uuid
  );
  return new;
end;
$fn$;

do $$
declare
  t text;
begin
  for t in
    select tablename
    from pg_policies
    where schemaname = 'public' and policyname = 'tenant_isolation'
  loop
    execute format('grant insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format(
      'create trigger set_emp_from_jwt before insert on public.%I '
      || 'for each row execute function public.set_emp_from_jwt()',
      t
    );
  end loop;
end $$;
