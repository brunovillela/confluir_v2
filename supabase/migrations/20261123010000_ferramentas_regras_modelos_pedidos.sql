-- Ferramentas: regras automáticas, modelos e formulários de pedido (Onda 3).
--
-- POR QUÊ: pedido de 22/11/2026 — Onda 3 do plano inspirado no Monday/Trello:
-- tirar o trabalho repetido das demandas e tarefas.
--
-- COMO:
--  • `demandas_regras`: regras "quando… então…" de uma lista fechada
--    (gatilho × ação, com escopo opcional numa demanda e um parâmetro: a
--    pessoa ou a etiqueta). `demandas_regras_execucoes` registra cada vez
--    que uma regra agiu (e impede repetir o mesmo atraso). Uma regra não
--    dispara outra. Ver lib/ferramentas-regras.ts.
--  • `demandas_modelos` e `demandas_modelo_itens`: modelos de demanda ou de
--    projeto, com as tarefas (e, no projeto, os marcos) e o prazo de cada
--    uma em dias relativos a uma data de referência (o dia do evento, por
--    exemplo: "-10" = dez dias antes).
--  • `demandas_formularios`: formulários de pedido por setor; quem pede
--    preenche e o pedido vira uma demanda do responsável do formulário, com
--    as tarefas do modelo, se houver. `demandas.formulario_id` liga a
--    demanda ao formulário (Meus pedidos).
-- O prefixo `demandas` põe as tabelas no processo de demandas internas do
-- ROPA. RLS por entidade e set_emp_from_jwt. Idempotente.

create table if not exists public.demandas_regras (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  gatilho text not null,
  acao text not null,
  demanda_id uuid references public.demandas(id) on delete cascade,
  pessoa_id uuid references public.usuarios(id) on delete cascade,
  etiqueta_id uuid references public.demandas_etiquetas(id) on delete cascade,
  ativa boolean not null default true,
  criada_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint demandas_regras_gatilho_check check (gatilho in ('tarefa_criada', 'tarefa_concluida', 'tarefa_atrasou')),
  constraint demandas_regras_acao_check check (acao in ('demanda_feito', 'prioridade_alta', 'atribuir', 'etiquetar', 'avisar'))
);
create index if not exists demandas_regras_emp_idx on public.demandas_regras (emp_proprietaria_id, gatilho) where ativa;

create table if not exists public.demandas_regras_execucoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  regra_id uuid not null references public.demandas_regras(id) on delete cascade,
  tarefa_id uuid references public.demandas_check_tarefas(id) on delete set null,
  chave text not null,
  detalhe text,
  created_at timestamptz not null default now(),
  constraint demandas_regras_execucoes_chave unique (regra_id, chave)
);
create index if not exists demandas_regras_execucoes_emp_idx on public.demandas_regras_execucoes (emp_proprietaria_id, created_at desc);

create table if not exists public.demandas_modelos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  tipo text not null default 'demanda',
  descricao text,
  created_at timestamptz not null default now(),
  constraint demandas_modelos_tipo_check check (tipo in ('demanda', 'projeto'))
);
create index if not exists demandas_modelos_emp_idx on public.demandas_modelos (emp_proprietaria_id);

create table if not exists public.demandas_modelo_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  modelo_id uuid not null references public.demandas_modelos(id) on delete cascade,
  tipo text not null default 'tarefa',
  titulo text not null,
  dias integer not null default 0,
  prioridade text not null default 'media',
  procedimento_id uuid references public.fa_documentos(id) on delete set null,
  checklist text[] not null default '{}',
  ordem integer not null default 0,
  constraint demandas_modelo_itens_tipo_check check (tipo in ('tarefa', 'marco')),
  constraint demandas_modelo_itens_prioridade_check check (prioridade in ('alta', 'media', 'baixa'))
);
create index if not exists demandas_modelo_itens_modelo_idx on public.demandas_modelo_itens (modelo_id, ordem);

create table if not exists public.demandas_formularios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  nome text not null,
  descricao text,
  responsavel_id uuid references public.usuarios(id) on delete set null,
  modelo_id uuid references public.demandas_modelos(id) on delete set null,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists demandas_formularios_emp_idx on public.demandas_formularios (emp_proprietaria_id);

alter table public.demandas
  add column if not exists formulario_id uuid references public.demandas_formularios(id) on delete set null;
create index if not exists demandas_formulario_idx on public.demandas (formulario_id) where formulario_id is not null;

do $$
declare
  t text;
begin
  foreach t in array array['demandas_regras', 'demandas_regras_execucoes', 'demandas_modelos', 'demandas_modelo_itens', 'demandas_formularios'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I to authenticated using (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid) with check (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)',
      t
    );
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;

comment on table public.demandas_regras is 'Regras "quando… então…" das tarefas e demandas (Ferramentas > Automações), de uma lista fechada de gatilhos e ações. [lgpd:identificacao|titulares:funcionarios,diretores]';
comment on column public.demandas_regras.pessoa_id is 'A pessoa da ação (a quem atribuir ou avisar). [lgpd:identificacao]';
comment on column public.demandas_regras.criada_por is 'Quem criou a regra. [lgpd:identificacao]';
comment on table public.demandas_regras_execucoes is 'Cada vez que uma regra agiu (o histórico da Automação); a chave impede agir duas vezes no mesmo atraso. [lgpd:nenhum]';
comment on column public.demandas_regras_execucoes.detalhe is 'O que a regra fez, em texto curto (sem dado pessoal). [lgpd:nenhum]';
comment on table public.demandas_modelos is 'Modelos de demanda ou de projeto, com as tarefas e marcos pré-montados (Ferramentas > Modelos). [lgpd:nenhum]';
comment on table public.demandas_modelo_itens is 'Tarefas e marcos de um modelo, com o prazo em dias relativos à data de referência. [lgpd:nenhum]';
comment on column public.demandas_modelo_itens.dias is 'Dias em relação à data de referência informada ao usar o modelo (negativo = antes). [lgpd:nenhum]';
comment on table public.demandas_formularios is 'Formulários de pedido por setor: o pedido vira uma demanda do responsável, com as tarefas do modelo (Pedidos). [lgpd:identificacao|titulares:funcionarios,diretores]';
comment on column public.demandas_formularios.responsavel_id is 'Quem recebe os pedidos do formulário (responsável pela demanda criada). [lgpd:identificacao]';
comment on column public.demandas.formulario_id is 'Formulário de pedido que originou a demanda (Meus pedidos); nulo nas demais. [lgpd:nenhum]';
