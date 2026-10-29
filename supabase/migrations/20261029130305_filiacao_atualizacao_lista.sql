-- Confluir — atualização de cadastros por lista de trabalhadores (29/10/2026)
--
-- POR QUÊ: empregadores mandam listas (planilha, CSV, PDF, foto) com os dados
-- dos trabalhadores — cargo, lotação, matrícula, admissão, contatos. A IA lê
-- o arquivo e o sistema propõe, cadastro a cadastro, o que mudar. A gestão
-- confere e aplica; e precisa poder DESFAZER o lote inteiro se a lista estava
-- errada (pedido do usuário).
--
-- COMO:
--  1. `filiacao_atualizacoes_lote`: um envio de lista. Nasce 'rascunho' (a
--     prévia, que sobrevive a recarregar a página), vira 'aplicado' e pode
--     virar 'desfeito'. Guarda as linhas descartadas e as não encontradas
--     (para oferecer o cadastro delas).
--  2. `filiacao_atualizacoes_lote_itens`: cada campo proposto, com o valor
--     anterior lido na prévia e o novo. `acompanha` liga o espelho
--     `fonte_pg_*` do vínculo ao campo principal (vai e volta junto). Desfazer
--     só devolve o valor anterior onde o campo ainda está com o valor do lote.
-- Idempotente.

create table if not exists public.filiacao_atualizacoes_lote (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  fonte_pagadora_id uuid references public.empresa(id) on delete set null,
  arquivo_nome text not null,
  situacao text not null default 'rascunho' check (situacao in ('rascunho', 'aplicado', 'desfeito')),
  linhas_lidas integer not null default 0,
  descartadas jsonb not null default '[]',
  nao_encontrados jsonb not null default '[]',
  avisos jsonb not null default '[]',
  resumo jsonb,
  criado_por uuid,
  criado_por_nome text,
  created_at timestamptz not null default now(),
  aplicado_em timestamptz,
  aplicado_por uuid,
  desfeito_em timestamptz,
  desfeito_por uuid
);

create index if not exists filiacao_atualizacoes_lote_emp_idx
  on public.filiacao_atualizacoes_lote (emp_proprietaria_id, created_at desc);

create table if not exists public.filiacao_atualizacoes_lote_itens (
  id uuid primary key default gen_random_uuid(),
  lote_id uuid not null references public.filiacao_atualizacoes_lote(id) on delete cascade,
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  seq integer not null,
  acompanha integer,
  linha integer,
  filiado_id uuid not null references public.filiacoes(id) on delete cascade,
  vinculo_id uuid references public.filiacao_vinculos(id) on delete cascade,
  via text not null check (via in ('cpf', 'matricula', 'nome')),
  tabela text not null check (tabela in ('filiacoes', 'filiacao_vinculos')),
  campo text not null,
  valor_anterior text,
  valor_novo text,
  marcado_padrao boolean not null default false,
  aplicado boolean not null default false,
  desfeito boolean not null default false,
  unique (lote_id, seq)
);

create index if not exists filiacao_atualizacoes_lote_itens_lote_idx
  on public.filiacao_atualizacoes_lote_itens (lote_id, seq);
create index if not exists filiacao_atualizacoes_lote_itens_filiado_idx
  on public.filiacao_atualizacoes_lote_itens (filiado_id);

do $$
declare t text;
begin
  foreach t in array array['filiacao_atualizacoes_lote', 'filiacao_atualizacoes_lote_itens'] loop
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

comment on table public.filiacao_atualizacoes_lote is 'Atualização de cadastros por lista de trabalhadores enviada pelo empregador (lida por IA): um envio, da prévia ao aplicado ou desfeito. [lgpd:identificacao,trabalhista|titulares:filiados]';
comment on column public.filiacao_atualizacoes_lote.arquivo_nome is 'Nome do arquivo enviado (o arquivo em si não é guardado). [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote.situacao is 'rascunho (prévia), aplicado ou desfeito. [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote.descartadas is 'Linhas da lista que não puderam ser usadas, com o motivo (nome, CPF, matrícula). [lgpd:identificacao]';
comment on column public.filiacao_atualizacoes_lote.nao_encontrados is 'Linhas válidas sem cadastro correspondente, com os dados lidos — base do cadastro em massa oferecido ao fim. [lgpd:identificacao,trabalhista]';
comment on column public.filiacao_atualizacoes_lote.avisos is 'Avisos da leitura (ex.: trecho em que a IA leu menos linhas que o arquivo tem). [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote.resumo is 'Contagens do lote ao aplicar e ao desfazer. [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote.criado_por_nome is 'Quem enviou a lista. [lgpd:identificacao]';
comment on table public.filiacao_atualizacoes_lote_itens is 'Cada campo de cadastro ou vínculo proposto por uma lista de trabalhadores, com o valor anterior e o novo — o que permite desfazer o lote. [lgpd:identificacao,trabalhista|titulares:filiados]';
comment on column public.filiacao_atualizacoes_lote_itens.acompanha is 'seq do campo principal que este espelho (fonte_pg_* do vínculo) segue ao aplicar e desfazer. [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote_itens.via is 'Como a linha foi ligada ao cadastro: cpf, matricula (na fonte) ou nome (só sugestão). [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote_itens.valor_anterior is 'Valor do campo no cadastro quando a prévia foi montada. [lgpd:identificacao]';
comment on column public.filiacao_atualizacoes_lote_itens.valor_novo is 'Valor lido da lista e padronizado. [lgpd:identificacao]';
comment on column public.filiacao_atualizacoes_lote_itens.marcado_padrao is 'Vem marcado na prévia: completa campo vazio de cadastro ligado por CPF ou matrícula. [lgpd:nenhum]';
