-- Confluir — Votação na área do filiado (2026-08-29)
--
-- Habilita o filiado ativo a votar/consultar pela área do filiado, além do
-- ambiente público. O VOTO segue secreto (voto_votacao_respostas sem
-- eleitor_id, como os registros migrados); a PARTICIPAÇÃO é marcada no apto
-- (voto_assembleias_aptos.hora_voto). Nada aqui liga o filiado ao conteúdo do
-- voto — só à participação (genérica), por segurança e mitigação de assédio.
--
-- Este arquivo cria APENAS o e-mail de votação verificado (campo próprio). As
-- demais peças (voto, aptos, assembleias, prontuário) reusam tabelas que já
-- existem. Idempotente.

-- E-mail de votação verificado, por pessoa (CPF) dentro do tenant. Muitas
-- empresas não cedem CPF nas listas de aptos — o casamento pode ser pelo e-mail
-- corporativo do apto, desde que o filiado tenha verificado esse e-mail aqui.
create table if not exists votacao_email_verificado (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  cpf text not null,
  -- e-mail verificado (usado no casamento com os aptos por e-mail).
  email text,
  verificado_em timestamptz,
  -- verificação pendente (código de 6 dígitos guardado hasheado; ver
  -- lib/db/filiacao-publica.ts para o padrão).
  pend_email text,
  pend_codigo_hash text,
  pend_codigo_token text,
  pend_expira_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (emp_proprietaria_id, cpf)
);

-- Backstop RLS data-driven (mesmo padrão do tenant): leitura/escrita só via
-- service role do app; a coluna emp_proprietaria_id isola o tenant.
alter table votacao_email_verificado enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where tablename = 'votacao_email_verificado'
      and policyname = 'votacao_email_verificado_tenant'
  ) then
    create policy votacao_email_verificado_tenant
      on votacao_email_verificado
      for all
      using (
        emp_proprietaria_id = (
          nullif(current_setting('request.jwt.claims', true), '')::jsonb
            ->> 'emp_proprietaria_id'
        )::uuid
      )
      with check (
        emp_proprietaria_id = (
          nullif(current_setting('request.jwt.claims', true), '')::jsonb
            ->> 'emp_proprietaria_id'
        )::uuid
      );
  end if;
end $$;
