-- Confluir — controle de envio das relações de desconto pelos empregadores
--
-- POR QUÊ: todo mês cada fonte pagadora deve mandar ao sindicato a relação do
-- que descontou de cada trabalhador e depositar o valor. O Confluir já recebe a
-- relação (Receitas: remessa × fonte) e o depósito (comprovação), mas não sabe
-- QUANDO cada empresa deveria mandar, não guarda como a relação chegou nem as
-- cobranças feitas ao RH, e não mostra quem está atrasado. No sentido inverso,
-- o sindicato precisa avisar a empresa de quem passa a ter desconto (nova
-- filiação) e de quem deixa de ter (desfiliação), e provar que avisou.
--
-- COMO:
--  1. `filiacao_repasse_regras`: o prazo de cada tipo de contribuição
--     (Associativa, Assistencial, Sindical). Linha com empresa_id null = regra
--     geral da entidade; linha com empresa_id = exceção daquela empresa (campos
--     null herdam a geral). `meses` = competências em que há desconto (null =
--     todas; a Assistencial e a Sindical costumam ter um mês só).
--  2. `empresa.filiacao_repasse_desde`: competência a partir da qual o controle
--     cobra atraso e a partir da qual filiações e desfiliações entram na lista
--     de inclusões/exclusões a comunicar (para não listar o passado inteiro).
--  3. `empresa_contatos.contato_folha`: o contato do RH/folha da empresa, que
--     recebe as cobranças e as inclusões/exclusões.
--  4. `filiacao_repasse_eventos`: a trilha de cada empresa × competência × tipo
--     (relação recebida fora do sistema, sem desconto no mês, cobrança,
--     contato). A relação importada e o depósito já ficam em Receitas.
--  5. `filiacao_desconto_comunicacoes` + `_itens`: cada envio à empresa das
--     inclusões e exclusões de desconto — quando, por qual meio, quem e QUAIS
--     vínculos foram (snapshot). Só insere: é prova do que foi comunicado.
--  6. `filiacao_repasse_resumo()`: lançamentos e valor por competência × tipo ×
--     fonte, direto das remessas (a camada analítica é atualizada de tempos em
--     tempos; o controle precisa ver a relação que acabou de ser importada).
-- Idempotente.

-- ── 1. Regras de prazo ──────────────────────────────────────────────────────
create table if not exists public.filiacao_repasse_regras (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  empresa_id uuid references public.empresa(id) on delete cascade,
  tipo text not null check (tipo in ('Associativa', 'Assistencial', 'Sindical')),
  controla boolean,
  meses smallint[] check (meses is null or (meses <@ array[1,2,3,4,5,6,7,8,9,10,11,12]::smallint[] and cardinality(meses) > 0)),
  dia_envio smallint check (dia_envio between 1 and 31),
  dia_deposito smallint check (dia_deposito between 1 and 31),
  observacao text,
  atualizado_em timestamptz not null default now(),
  atualizado_por text
);

create unique index if not exists filiacao_repasse_regras_unica
  on public.filiacao_repasse_regras (emp_proprietaria_id, coalesce(empresa_id, '00000000-0000-0000-0000-000000000000'::uuid), tipo);

alter table public.filiacao_repasse_regras enable row level security;
drop policy if exists tenant_isolation on public.filiacao_repasse_regras;
create policy tenant_isolation on public.filiacao_repasse_regras to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.filiacao_repasse_regras;
create trigger set_emp_from_jwt before insert on public.filiacao_repasse_regras
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.filiacao_repasse_regras from public, anon;
grant select, insert, update, delete on table public.filiacao_repasse_regras to authenticated;
grant all on table public.filiacao_repasse_regras to service_role;

comment on table public.filiacao_repasse_regras is 'Prazo para as fontes pagadoras enviarem a relação de descontos e depositarem, por tipo de contribuição. empresa_id null = regra geral da entidade; preenchido = exceção da empresa (campos null herdam a geral) (08/11/2026). [lgpd:nenhum]';
comment on column public.filiacao_repasse_regras.empresa_id is 'Fonte pagadora da exceção; null = regra geral.';
comment on column public.filiacao_repasse_regras.tipo is 'Tipo de contribuição: Associativa, Assistencial ou Sindical (o tipo da remessa).';
comment on column public.filiacao_repasse_regras.controla is 'Na regra geral: se o tipo entra no controle. Na exceção: false = a empresa não desconta este tipo; null = herda.';
comment on column public.filiacao_repasse_regras.meses is 'Meses de competência com desconto (1 a 12); null = todos (ou herda, na exceção).';
comment on column public.filiacao_repasse_regras.dia_envio is 'Dia do mês seguinte à competência até o qual a relação deve chegar (dia além do fim do mês = último dia).';
comment on column public.filiacao_repasse_regras.dia_deposito is 'Dia do mês seguinte à competência até o qual o valor deve ser depositado.';
comment on column public.filiacao_repasse_regras.atualizado_por is 'Nome de quem alterou a regra por último. [lgpd:identificacao]';

-- ── 2. Início do controle ───────────────────────────────────────────────────
alter table public.empresa
  add column if not exists filiacao_repasse_desde integer
  check (filiacao_repasse_desde is null or (filiacao_repasse_desde between 200001 and 210012 and filiacao_repasse_desde % 100 between 1 and 12));

comment on column public.empresa.filiacao_repasse_desde is 'Competência (AAAAMM) a partir da qual o controle de envio cobra atraso das fontes pagadoras e lista inclusões/exclusões de desconto a comunicar; null = controle ainda não ativado. [lgpd:nenhum]';

-- ── 3. Contato da folha ─────────────────────────────────────────────────────
alter table public.empresa_contatos
  add column if not exists contato_folha boolean not null default false;

comment on column public.empresa_contatos.contato_folha is 'Contato do RH/folha da empresa: recebe a cobrança da relação de descontos e as inclusões/exclusões de desconto. [lgpd:nenhum]';

-- ── 4. Trilha do controle ───────────────────────────────────────────────────
create table if not exists public.filiacao_repasse_eventos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  competencia integer not null check (competencia between 200001 and 210012 and competencia % 100 between 1 and 12),
  tipo text not null check (tipo in ('Associativa', 'Assistencial', 'Sindical')),
  evento text not null check (evento in ('relacao_recebida', 'sem_desconto', 'cobranca', 'contato')),
  meio text check (meio in ('email', 'sistema_rh', 'oficio', 'em_maos', 'whatsapp', 'telefone', 'outro')),
  data date not null default current_date,
  observacao text,
  usuario_id uuid,
  usuario_nome text,
  created_at timestamptz not null default now()
);

create index if not exists filiacao_repasse_eventos_idx
  on public.filiacao_repasse_eventos (emp_proprietaria_id, competencia, tipo, empresa_id);

alter table public.filiacao_repasse_eventos enable row level security;
drop policy if exists tenant_isolation on public.filiacao_repasse_eventos;
create policy tenant_isolation on public.filiacao_repasse_eventos to authenticated
  using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
  with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid);
drop trigger if exists set_emp_from_jwt on public.filiacao_repasse_eventos;
create trigger set_emp_from_jwt before insert on public.filiacao_repasse_eventos
  for each row execute function public.set_emp_from_jwt();
revoke all on table public.filiacao_repasse_eventos from public, anon;
grant select, insert, delete on table public.filiacao_repasse_eventos to authenticated;
grant all on table public.filiacao_repasse_eventos to service_role;

comment on table public.filiacao_repasse_eventos is 'Trilha do controle de envio de cada fonte pagadora por competência e tipo: relação recebida fora do sistema, sem desconto no mês, cobrança e contato com o RH (08/11/2026). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.filiacao_repasse_eventos.empresa_id is 'Fonte pagadora (no grupo centralizado, a empresa pagadora).';
comment on column public.filiacao_repasse_eventos.competencia is 'Competência AAAAMM (a ordem da remessa).';
comment on column public.filiacao_repasse_eventos.evento is 'relacao_recebida (chegou, ainda não lançada), sem_desconto (a empresa informou que não houve desconto), cobranca ou contato.';
comment on column public.filiacao_repasse_eventos.meio is 'Por onde chegou ou por onde foi a cobrança.';
comment on column public.filiacao_repasse_eventos.observacao is 'O que foi conversado ou combinado com a empresa. [lgpd:nenhum]';
comment on column public.filiacao_repasse_eventos.usuario_id is 'Quem registrou. [lgpd:identificacao]';
comment on column public.filiacao_repasse_eventos.usuario_nome is 'Nome de quem registrou, no momento do registro. [lgpd:identificacao]';

-- ── 5. Inclusões e exclusões comunicadas à empresa ──────────────────────────
create table if not exists public.filiacao_desconto_comunicacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  empresa_id uuid not null references public.empresa(id) on delete restrict,
  enviado_em timestamptz not null default now(),
  meio text not null check (meio in ('email', 'sistema_rh', 'oficio', 'em_maos', 'outro')),
  destinatario text,
  referencia text,
  observacao text,
  inclusoes integer not null default 0 check (inclusoes >= 0),
  exclusoes integer not null default 0 check (exclusoes >= 0),
  usuario_id uuid,
  usuario_nome text
);

create index if not exists filiacao_desconto_comunicacoes_idx
  on public.filiacao_desconto_comunicacoes (emp_proprietaria_id, empresa_id, enviado_em desc);

create table if not exists public.filiacao_desconto_comunicacao_itens (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  comunicacao_id uuid not null references public.filiacao_desconto_comunicacoes(id) on delete restrict,
  vinculo_id uuid references public.filiacao_vinculos(id) on delete set null,
  filiado_id uuid references public.filiacoes(id) on delete set null,
  acao text not null check (acao in ('inclusao', 'exclusao')),
  nome text,
  cpf text,
  matricula text,
  data date
);

create index if not exists filiacao_desconto_itens_vinculo_idx
  on public.filiacao_desconto_comunicacao_itens (emp_proprietaria_id, vinculo_id, acao);
create index if not exists filiacao_desconto_itens_comunicacao_idx
  on public.filiacao_desconto_comunicacao_itens (comunicacao_id);

do $$
declare t text;
begin
  foreach t in array array['filiacao_desconto_comunicacoes', 'filiacao_desconto_comunicacao_itens'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$create policy tenant_isolation on public.%I to authenticated
      using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
      with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)$p$, t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- Comunicação registrada é prova: não se altera nem se apaga.
create or replace function public.filiacao_desconto_comunicacao_imutavel()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and tg_table_name = 'filiacao_desconto_comunicacao_itens'
     and new.vinculo_id is null and old.vinculo_id is not null
     and new.comunicacao_id = old.comunicacao_id and new.acao = old.acao then
    -- o vínculo foi excluído (on delete set null): o item continua, com o snapshot
    return new;
  end if;
  if tg_op = 'UPDATE' and tg_table_name = 'filiacao_desconto_comunicacao_itens'
     and new.filiado_id is null and old.filiado_id is not null
     and new.comunicacao_id = old.comunicacao_id and new.acao = old.acao then
    return new;
  end if;
  raise exception 'Comunicação de desconto registrada não pode ser alterada nem apagada.';
end;
$$;

drop trigger if exists filiacao_desconto_comunicacao_imutavel on public.filiacao_desconto_comunicacoes;
create trigger filiacao_desconto_comunicacao_imutavel before update or delete on public.filiacao_desconto_comunicacoes
  for each row execute function public.filiacao_desconto_comunicacao_imutavel();
drop trigger if exists filiacao_desconto_comunicacao_imutavel on public.filiacao_desconto_comunicacao_itens;
create trigger filiacao_desconto_comunicacao_imutavel before update or delete on public.filiacao_desconto_comunicacao_itens
  for each row execute function public.filiacao_desconto_comunicacao_imutavel();

comment on table public.filiacao_desconto_comunicacoes is 'Cada envio a uma fonte pagadora das inclusões (novas filiações) e exclusões (desfiliações) de desconto em folha: quando, por qual meio, para quem e por quem. Só insere (08/11/2026). [lgpd:identificacao|titulares:usuários do sistema, contatos das empresas]';
comment on column public.filiacao_desconto_comunicacoes.empresa_id is 'Fonte pagadora que recebeu a comunicação.';
comment on column public.filiacao_desconto_comunicacoes.meio is 'email, sistema_rh, oficio, em_maos ou outro.';
comment on column public.filiacao_desconto_comunicacoes.destinatario is 'E-mail ou nome de quem recebeu na empresa. [lgpd:identificacao]';
comment on column public.filiacao_desconto_comunicacoes.referencia is 'Número do ofício, protocolo do RH ou assunto do e-mail.';
comment on column public.filiacao_desconto_comunicacoes.usuario_id is 'Quem registrou o envio. [lgpd:identificacao]';
comment on column public.filiacao_desconto_comunicacoes.usuario_nome is 'Nome de quem registrou, no momento do envio. [lgpd:identificacao]';

comment on table public.filiacao_desconto_comunicacao_itens is 'Os trabalhadores de cada comunicação de desconto, com o snapshot do que foi enviado (nome, CPF, matrícula na empresa, data). Só insere (08/11/2026). [lgpd:identificacao|titulares:filiados]';
comment on column public.filiacao_desconto_comunicacao_itens.vinculo_id is 'Vínculo que gerou a inclusão (filiação) ou a exclusão (desfiliação).';
comment on column public.filiacao_desconto_comunicacao_itens.acao is 'inclusao (passa a ter desconto) ou exclusao (deixa de ter).';
comment on column public.filiacao_desconto_comunicacao_itens.nome is 'Nome do trabalhador, como foi enviado. [lgpd:identificacao]';
comment on column public.filiacao_desconto_comunicacao_itens.cpf is 'CPF do trabalhador, como foi enviado. [lgpd:identificacao]';
comment on column public.filiacao_desconto_comunicacao_itens.matricula is 'Matrícula na empresa, como foi enviada. [lgpd:trabalhista]';
comment on column public.filiacao_desconto_comunicacao_itens.data is 'Data da filiação (inclusão) ou da desfiliação (exclusão). [lgpd:trabalhista]';

-- ── 6. Resumo das relações por competência ──────────────────────────────────
create or replace function public.filiacao_repasse_resumo(p_emp uuid, p_de integer, p_ate integer)
returns table (ordem integer, tipo text, remessa_id uuid, fonte_id uuid, lancamentos integer, valor numeric)
language sql
stable
security definer
set search_path = public
as $$
  select r.ordem::integer, coalesce(r.tipo, 'Associativa'), r.id, l.fonte_pg_id,
         count(*)::integer, coalesce(sum(l.valor), 0)::numeric(14,2)
  from public.filiacao_recebe_remessa r
  join public.filiacao_recebe l on l.remessa_id = r.id
  where r.emp_proprietaria_id = p_emp
    and r.ordem between p_de and p_ate
    and l.fonte_pg_id is not null
  group by r.ordem, coalesce(r.tipo, 'Associativa'), r.id, l.fonte_pg_id
$$;

revoke all on function public.filiacao_repasse_resumo(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.filiacao_repasse_resumo(uuid, integer, integer) to service_role;
