-- Confluir — Contracheques: importação da folha em PDF (30/10/2026)
--
-- POR QUÊ: os contracheques eram registrados um a um, com o PDF de cada
-- funcionário e o valor líquido digitado. A folha vem do sistema de
-- contabilidade num PDF só (todos, alguns ou um funcionário). A entidade quer
-- enviar o PDF inteiro, separar por funcionário, ler o líquido com a IA,
-- conferir e aplicar à remessa — como já faz com o relatório de ponto, mas
-- sem saldo: contracheque não acumula de um mês para o outro.
--
-- COMO: pessoal_contracheque_importacoes = um PDF enviado a uma remessa.
-- pessoal_contracheque_importacao_itens = um funcionário do PDF (as páginas
-- dele), com a leitura da IA (líquido, proventos, descontos, competência) e a
-- situação até virar o contracheque da remessa. Idempotente.

create table if not exists public.pessoal_contracheque_importacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  remessa_id uuid not null references public.pessoal_contracheques_remessas(id) on delete cascade,
  arquivo text not null,
  nome_arquivo text,
  paginas integer not null default 0,
  criado_por uuid references public.usuarios(id),
  created_at timestamptz not null default now()
);

create index if not exists pessoal_contracheque_importacoes_remessa_idx
  on public.pessoal_contracheque_importacoes (emp_proprietaria_id, remessa_id, created_at desc);

create table if not exists public.pessoal_contracheque_importacao_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  importacao_id uuid not null references public.pessoal_contracheque_importacoes(id) on delete cascade,
  paginas integer[] not null,
  nome_lido text,
  cpf_lido text,
  funcionario_id uuid references public.usuarios(id),
  arquivo text not null,
  situacao text not null default 'pendente',
  leitura jsonb,
  erro text,
  lido_em timestamptz,
  contracheque_id uuid references public.pessoal_contracheques(id) on delete set null,
  aplicado_em timestamptz,
  aplicado_por uuid references public.usuarios(id),
  created_at timestamptz not null default now(),
  constraint pessoal_contracheque_importacao_itens_situacao_check
    check (situacao in ('pendente', 'lido', 'erro', 'aplicado', 'descartado'))
);

create index if not exists pessoal_contracheque_importacao_itens_imp_idx
  on public.pessoal_contracheque_importacao_itens (importacao_id, situacao);

do $$
declare t text;
begin
  foreach t in array array['pessoal_contracheque_importacoes', 'pessoal_contracheque_importacao_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$create policy tenant_isolation on public.%I to authenticated
      using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
      with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)$p$, t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

comment on table public.pessoal_contracheque_importacoes is 'Folha de contracheques em PDF (um ou vários funcionários) enviada a uma remessa para separar por funcionário e ler o valor líquido (src/lib/db/contracheque-importacao.ts). [lgpd:identificacao,financeiro|titulares:funcionários]';
comment on column public.pessoal_contracheque_importacoes.id is 'Identificador da importação.';
comment on column public.pessoal_contracheque_importacoes.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_contracheque_importacoes.remessa_id is 'Remessa de contracheques que recebe a importação.';
comment on column public.pessoal_contracheque_importacoes.arquivo is 'Caminho do PDF original no Storage (bucket pessoal). [lgpd:financeiro]';
comment on column public.pessoal_contracheque_importacoes.nome_arquivo is 'Nome do arquivo enviado.';
comment on column public.pessoal_contracheque_importacoes.paginas is 'Número de páginas do PDF.';
comment on column public.pessoal_contracheque_importacoes.criado_por is 'Quem enviou o PDF. [lgpd:identificacao]';
comment on column public.pessoal_contracheque_importacoes.created_at is 'Envio do PDF.';

comment on table public.pessoal_contracheque_importacao_itens is 'Um funcionário de uma folha de contracheques importada: as páginas dele, a leitura da IA e a situação até virar o contracheque da remessa. [lgpd:identificacao,financeiro|titulares:funcionários]';
comment on column public.pessoal_contracheque_importacao_itens.id is 'Identificador do item.';
comment on column public.pessoal_contracheque_importacao_itens.emp_proprietaria_id is 'Entidade (tenant).';
comment on column public.pessoal_contracheque_importacao_itens.importacao_id is 'Importação a que pertence.';
comment on column public.pessoal_contracheque_importacao_itens.paginas is 'Páginas do PDF deste funcionário.';
comment on column public.pessoal_contracheque_importacao_itens.nome_lido is 'Nome do funcionário achado nas páginas. [lgpd:identificacao]';
comment on column public.pessoal_contracheque_importacao_itens.cpf_lido is 'CPF lido nas páginas. [lgpd:identificacao]';
comment on column public.pessoal_contracheque_importacao_itens.funcionario_id is 'Funcionário do cadastro (achado pelo CPF ou pelo nome, ou escolhido). [lgpd:identificacao]';
comment on column public.pessoal_contracheque_importacao_itens.arquivo is 'PDF só com as páginas deste funcionário (bucket pessoal). [lgpd:financeiro]';
comment on column public.pessoal_contracheque_importacao_itens.situacao is 'pendente (a ler), lido, erro, aplicado (virou contracheque) ou descartado.';
comment on column public.pessoal_contracheque_importacao_itens.leitura is 'Leitura da IA: nome, CPF, competência, total de proventos, total de descontos e valor líquido. [lgpd:financeiro]';
comment on column public.pessoal_contracheque_importacao_itens.erro is 'Motivo da falha na leitura.';
comment on column public.pessoal_contracheque_importacao_itens.lido_em is 'Quando a IA leu.';
comment on column public.pessoal_contracheque_importacao_itens.contracheque_id is 'Contracheque criado ao aplicar.';
comment on column public.pessoal_contracheque_importacao_itens.aplicado_em is 'Quando foi aplicado à remessa.';
comment on column public.pessoal_contracheque_importacao_itens.aplicado_por is 'Quem aplicou. [lgpd:identificacao]';
comment on column public.pessoal_contracheque_importacao_itens.created_at is 'Criação do item.';
