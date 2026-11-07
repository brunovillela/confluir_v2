-- Confluir — Controle de acesso: agentes das sedes e fila de comandos (07/11/2026)
--
-- POR QUÊ: o autoatendimento de visitantes (proposta de 31/10) precisa ligar
-- o Confluir, na nuvem, ao servidor Control iD instalado em cada sede. Quem
-- faz a ponte é um pequeno agente no computador da recepção, que só abre
-- conexões de saída: ele procura o Confluir, recebe comandos e devolve os
-- resultados. Esta migração cria o cadastro desses agentes (pareamento por
-- código, token, último contato, diagnóstico) e a fila de comandos. Nesta
-- etapa o único comando é "verificar" (a lista de verificação da conexão); o
-- cadastro de visitantes entra quando houver a documentação da API do
-- iDSecure.
--
-- COMO: `acesso_agentes` guarda, por entidade e sede, o código de pareamento
-- (só o hash, vale 15 minutos) e o token do agente (só o hash, como em
-- api_chaves). `acesso_agente_comandos` é a fila: o painel insere, o agente
-- busca no contato seguinte e devolve o resultado. As rotas do agente
-- (src/app/api/acesso/agente/*) usam o cliente de serviço e filtram pela
-- entidade do token; o painel lê pelo createAdminClient (RLS
-- tenant_isolation). Sem dado pessoal. Idempotente.

create table if not exists public.acesso_agentes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  sede_id uuid references public.empresa_sede (id) on delete set null,
  nome text not null,
  conector text not null default 'simulado' check (conector in ('simulado', 'controlid_local')),
  codigo_hash text,
  codigo_expira_em timestamptz,
  token_hash text unique,
  token_prefixo text,
  pareado_em timestamptz,
  ultimo_contato_em timestamptz,
  versao text,
  maquina text,
  diagnostico jsonb,
  diagnostico_em timestamptz,
  criado_por uuid,
  revogado_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists acesso_agentes_emp_idx on public.acesso_agentes (emp_proprietaria_id, revogado_em);
create index if not exists acesso_agentes_codigo_idx on public.acesso_agentes (codigo_hash) where codigo_hash is not null;

create table if not exists public.acesso_agente_comandos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null,
  agente_id uuid not null references public.acesso_agentes (id) on delete cascade,
  tipo text not null check (tipo in ('verificar')),
  situacao text not null default 'pendente' check (situacao in ('pendente', 'entregue', 'concluido', 'falhou')),
  resultado jsonb,
  solicitado_por uuid,
  entregue_em timestamptz,
  concluido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists acesso_agente_comandos_fila_idx on public.acesso_agente_comandos (agente_id, situacao, created_at);

do $$
declare t text;
begin
  foreach t in array array['acesso_agentes', 'acesso_agente_comandos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format('create policy tenant_isolation on public.%I for all to authenticated using (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid) with check (emp_proprietaria_id = (auth.jwt() ->> ''tenant_id'')::uuid)', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
  if exists (select 1 from pg_proc where proname = 'registrar_auditoria') then
    execute 'drop trigger if exists auditoria_registrar on public.acesso_agentes';
    execute 'create trigger auditoria_registrar after insert or update or delete on public.acesso_agentes for each row execute function public.registrar_auditoria()';
  end if;
end $$;

comment on table public.acesso_agentes is 'Agente do controle de acesso instalado no computador da recepção de uma sede (lib/acesso-agente.ts): pareamento por código, token, último contato e diagnóstico da conexão com o sistema de catracas. [lgpd:credencial]';
comment on column public.acesso_agentes.sede_id is 'Sede (empresa_sede) atendida pelo agente.';
comment on column public.acesso_agentes.nome is 'Nome do agente na tela, ex.: "Recepção — Macaé".';
comment on column public.acesso_agentes.conector is 'Sistema de catracas com que o agente conversa: simulado (testes, sem catraca) ou controlid_local (servidor Control iD da sede).';
comment on column public.acesso_agentes.codigo_hash is 'Hash do código de pareamento de 6 dígitos; vale até codigo_expira_em e é apagado ao parear. [lgpd:credencial]';
comment on column public.acesso_agentes.codigo_expira_em is 'Validade do código de pareamento (15 minutos).';
comment on column public.acesso_agentes.token_hash is 'Hash do token do agente; o segredo em claro fica só no computador da sede. [lgpd:credencial]';
comment on column public.acesso_agentes.token_prefixo is 'Início visível do token, para identificá-lo. [lgpd:credencial]';
comment on column public.acesso_agentes.pareado_em is 'Quando o agente foi pareado com o código.';
comment on column public.acesso_agentes.ultimo_contato_em is 'Último contato do agente (a cada poucos segundos quando ligado).';
comment on column public.acesso_agentes.versao is 'Versão do agente informada no contato.';
comment on column public.acesso_agentes.maquina is 'Nome do computador e sistema operacional informados pelo agente.';
comment on column public.acesso_agentes.diagnostico is 'Última lista de verificação devolvida pelo agente: [{id, ok, detalhe}] (servidor, login, permissão, teste).';
comment on column public.acesso_agentes.diagnostico_em is 'Quando o diagnóstico foi feito.';
comment on column public.acesso_agentes.criado_por is 'Usuário que cadastrou o agente.';
comment on column public.acesso_agentes.revogado_em is 'Quando o agente foi desligado; o token deixa de valer.';

comment on table public.acesso_agente_comandos is 'Fila de comandos para o agente da sede: o painel pede, o agente busca no contato seguinte e devolve o resultado. Nesta etapa só "verificar". [lgpd:nenhum]';
comment on column public.acesso_agente_comandos.tipo is 'Comando: verificar (roda a lista de verificação da conexão).';
comment on column public.acesso_agente_comandos.situacao is 'pendente → entregue (o agente buscou) → concluido ou falhou.';
comment on column public.acesso_agente_comandos.resultado is 'Resposta do agente ao comando.';
comment on column public.acesso_agente_comandos.solicitado_por is 'Usuário que pediu o comando.';
