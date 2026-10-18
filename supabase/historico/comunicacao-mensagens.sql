-- Confluir — Comunicação › Mensagens aos filiados (2026-09-30)
--
-- Duas frentes, pedidas pelo Bruno em 30/09:
--  (i)  aniversariantes do dia — e-mail automático aos filiados ATIVOS no dia do
--       aniversário + a lista do dia com o botão "Enviar no WhatsApp";
--  (ii) mala direta — mensagem a um recorte de filiados (os filtros do
--       relatório de filiados), por e-mail, com a lista para WhatsApp.
--
-- Decisões: e-mail automático e WhatsApp à mão (sem API); a mala direta traz o
-- link "não quero mais receber comunicados" (o parabéns não); sem aprovação —
-- quem tem a permissão envia.
--
-- • Permissão própria `comunicacao_mensagens`: disparar e-mail para milhares de
--   filiados é mais sensível que publicar notícia (mesmo raciocínio das
--   etiquetas).
-- • nascimento_dia / nascimento_mes passam a ser mantidos pelo banco: a
--   edição do cadastro e a importação gravavam só nascimento_data, e o dia/mês
--   (usados para achar os aniversariantes) ficavam desatualizados.
-- • Descadastro da mala direta por CPF (todas as fichas da pessoa), com data e
--   origem (link do e-mail, portal ou secretaria).
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

alter table permissoes add column if not exists comunicacao_mensagens boolean;

-- ── Aniversário: dia e mês sempre coerentes com a data ────────────────────
create or replace function public.filiacoes_nascimento_dia_mes()
returns trigger language plpgsql set search_path = '' as $$
begin
  if new.nascimento_data is null then
    new.nascimento_dia := null;
    new.nascimento_mes := null;
  else
    new.nascimento_dia := extract(day from new.nascimento_data)::int;
    new.nascimento_mes := extract(month from new.nascimento_data)::int;
  end if;
  return new;
end $$;

drop trigger if exists filiacoes_nascimento_dia_mes on filiacoes;
create trigger filiacoes_nascimento_dia_mes
  before insert or update of nascimento_data on filiacoes
  for each row execute function public.filiacoes_nascimento_dia_mes();

-- Só as fichas com dia/mês divergentes (as que a edição e a importação deixaram).
update filiacoes
   set nascimento_dia = extract(day from nascimento_data)::int,
       nascimento_mes = extract(month from nascimento_data)::int
 where nascimento_data is not null
   and (nascimento_dia is distinct from extract(day from nascimento_data)::int
     or nascimento_mes is distinct from extract(month from nascimento_data)::int);

create index if not exists idx_filiacoes_aniversario
  on filiacoes (emp_proprietaria_id, nascimento_mes, nascimento_dia)
  where filiacao_condicao = 'Ativo';

-- ── Descadastro da mala direta ────────────────────────────────────────────
alter table filiacoes add column if not exists comunicados_optout_em timestamptz;
alter table filiacoes add column if not exists comunicados_optout_origem text; -- link | portal | secretaria

-- ── Configuração do parabéns (uma linha por entidade) ─────────────────────
create table if not exists comunicacao_aniversario_config (id uuid primary key default gen_random_uuid());
alter table comunicacao_aniversario_config add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_aniversario_config add column if not exists ativo boolean not null default false;
alter table comunicacao_aniversario_config add column if not exists assunto text;
alter table comunicacao_aniversario_config add column if not exists mensagem text;        -- e-mail, com {primeiro_nome}, {nome}, {entidade}
alter table comunicacao_aniversario_config add column if not exists texto_whatsapp text;  -- idem
alter table comunicacao_aniversario_config add column if not exists atualizado_por uuid references usuarios(id);
alter table comunicacao_aniversario_config add column if not exists updated_at timestamptz;
create unique index if not exists ux_comunicacao_aniversario_config_emp
  on comunicacao_aniversario_config (emp_proprietaria_id);

-- ── Mensagens (o parabéns de um dia ou uma mala direta) ───────────────────
create table if not exists comunicacao_mensagens (id uuid primary key default gen_random_uuid());
alter table comunicacao_mensagens add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_mensagens add column if not exists tipo text not null default 'mala_direta';
alter table comunicacao_mensagens add column if not exists referencia date;               -- o dia, no parabéns
alter table comunicacao_mensagens add column if not exists titulo text;                   -- nome interno
alter table comunicacao_mensagens add column if not exists assunto text;
alter table comunicacao_mensagens add column if not exists corpo text;                    -- formatação do editor (BBCode)
alter table comunicacao_mensagens add column if not exists texto_whatsapp text;
alter table comunicacao_mensagens add column if not exists filtros jsonb;
alter table comunicacao_mensagens add column if not exists recorte text;                  -- filtros, legíveis
alter table comunicacao_mensagens add column if not exists situacao text not null default 'rascunho';
alter table comunicacao_mensagens add column if not exists agendada_para date;            -- sai no envio automático desse dia
alter table comunicacao_mensagens add column if not exists enviada_em timestamptz;
alter table comunicacao_mensagens add column if not exists criado_por uuid references usuarios(id);
alter table comunicacao_mensagens add column if not exists atualizado_por uuid references usuarios(id);
alter table comunicacao_mensagens add column if not exists created_at timestamptz not null default now();
alter table comunicacao_mensagens add column if not exists updated_at timestamptz;

do $$ begin
  alter table comunicacao_mensagens add constraint comunicacao_mensagens_tipo_check
    check (tipo in ('aniversario', 'mala_direta'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table comunicacao_mensagens add constraint comunicacao_mensagens_situacao_check
    check (situacao in ('rascunho', 'agendada', 'enviando', 'enviada', 'cancelada'));
exception when duplicate_object then null; end $$;

create unique index if not exists ux_comunicacao_mensagens_aniversario
  on comunicacao_mensagens (emp_proprietaria_id, referencia) where tipo = 'aniversario';
create index if not exists idx_comunicacao_mensagens_emp
  on comunicacao_mensagens (emp_proprietaria_id, tipo, created_at desc);

-- ── Destinatários de cada mensagem (um por CPF) ───────────────────────────
create table if not exists comunicacao_envios (id uuid primary key default gen_random_uuid());
alter table comunicacao_envios add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_envios add column if not exists mensagem_id uuid references comunicacao_mensagens(id) on delete cascade;
alter table comunicacao_envios add column if not exists filiacao_id uuid references filiacoes(id) on delete set null;
alter table comunicacao_envios add column if not exists cpf text;
alter table comunicacao_envios add column if not exists nome text;
alter table comunicacao_envios add column if not exists email text;
alter table comunicacao_envios add column if not exists telefone text;                   -- o WhatsApp, quando houver
alter table comunicacao_envios add column if not exists email_situacao text not null default 'pendente';
alter table comunicacao_envios add column if not exists email_em timestamptz;
alter table comunicacao_envios add column if not exists email_erro text;
alter table comunicacao_envios add column if not exists whatsapp_em timestamptz;         -- quando alguém abriu o WhatsApp
alter table comunicacao_envios add column if not exists whatsapp_por uuid references usuarios(id);
alter table comunicacao_envios add column if not exists created_at timestamptz not null default now();

do $$ begin
  alter table comunicacao_envios add constraint comunicacao_envios_email_situacao_check
    check (email_situacao in ('pendente', 'enviado', 'sem_email', 'descadastrado', 'duplicado', 'falha'));
exception when duplicate_object then null; end $$;

create unique index if not exists ux_comunicacao_envios_mensagem_cpf
  on comunicacao_envios (mensagem_id, cpf);
create index if not exists idx_comunicacao_envios_pendentes
  on comunicacao_envios (mensagem_id) where email_situacao = 'pendente';

-- ── RLS por tenant ────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['comunicacao_aniversario_config', 'comunicacao_mensagens', 'comunicacao_envios'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format($p$create policy tenant_isolation on %I for all to authenticated
      using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
      with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)$p$, t);
    execute format('grant select, insert, update, delete on %I to authenticated', t);
    execute format('drop trigger if exists set_emp_from_jwt on %I', t);
    execute format('create trigger set_emp_from_jwt before insert on %I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;

notify pgrst, 'reload schema';
