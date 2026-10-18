-- ============================================================================
-- Comunicação › Aniversariantes: mensagens específicas e envio configurável
-- (30/09/2026). Rodar depois de supabase/comunicacao-mensagens.sql.
--
--  • comunicacao_aniversario_modelos — mensagens de parabéns para quem atende
--    critérios (idade que completa, tempo de filiação, fonte, condição na
--    fonte, lugar). A primeira da lista que a pessoa atender vale; senão, a
--    mensagem padrão (comunicacao_aniversario_config).
--  • config: hora de início do envio automático e o aviso à equipe (e-mails
--    que recebem a lista do dia com os links do WhatsApp).
--  • envios: o texto de cada pessoa (a mensagem específica que ela recebeu)
--    e a situação "processando" — o e-mail reservado por quem vai enviá-lo,
--    para a tela e o agendador nunca mandarem o mesmo e-mail duas vezes.
--  • mensagens: a hora do agendamento da mala direta e o aviso à equipe.
-- Idempotente.
-- ============================================================================

-- ── Configuração do parabéns ──────────────────────────────────────────────
alter table comunicacao_aniversario_config add column if not exists hora_envio smallint not null default 9; -- hora de Brasília (0–23)
alter table comunicacao_aniversario_config add column if not exists aviso_equipe_emails text;             -- separados por vírgula
do $$ begin
  alter table comunicacao_aniversario_config add constraint comunicacao_aniversario_config_hora_check
    check (hora_envio between 0 and 23);
exception when duplicate_object then null; end $$;

-- ── Mensagens específicas ─────────────────────────────────────────────────
create table if not exists comunicacao_aniversario_modelos (id uuid primary key default gen_random_uuid());
alter table comunicacao_aniversario_modelos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_aniversario_modelos add column if not exists nome text;
alter table comunicacao_aniversario_modelos add column if not exists ativo boolean not null default true;
alter table comunicacao_aniversario_modelos add column if not exists ordem integer not null default 0;
alter table comunicacao_aniversario_modelos add column if not exists criterios jsonb not null default '{}'::jsonb;
alter table comunicacao_aniversario_modelos add column if not exists assunto text;
alter table comunicacao_aniversario_modelos add column if not exists mensagem text;
alter table comunicacao_aniversario_modelos add column if not exists texto_whatsapp text;
alter table comunicacao_aniversario_modelos add column if not exists atualizado_por uuid references usuarios(id);
alter table comunicacao_aniversario_modelos add column if not exists created_at timestamptz not null default now();
alter table comunicacao_aniversario_modelos add column if not exists updated_at timestamptz;
create index if not exists idx_comunicacao_aniversario_modelos_emp
  on comunicacao_aniversario_modelos (emp_proprietaria_id, ordem);

-- ── Envios: texto por pessoa + reserva do envio ───────────────────────────
alter table comunicacao_envios add column if not exists assunto text;
alter table comunicacao_envios add column if not exists corpo text;
alter table comunicacao_envios add column if not exists texto_whatsapp text;
alter table comunicacao_envios add column if not exists modelo_nome text;   -- a mensagem específica usada (null = padrão)

alter table comunicacao_envios drop constraint if exists comunicacao_envios_email_situacao_check;
alter table comunicacao_envios add constraint comunicacao_envios_email_situacao_check
  check (email_situacao in ('pendente', 'processando', 'enviado', 'sem_email', 'descadastrado', 'duplicado', 'falha'));

-- ── Mensagens: hora do agendamento e aviso à equipe ───────────────────────
alter table comunicacao_mensagens add column if not exists agendada_hora smallint not null default 9;
alter table comunicacao_mensagens add column if not exists aviso_equipe_em timestamptz;

-- ── RLS por tenant ────────────────────────────────────────────────────────
alter table comunicacao_aniversario_modelos enable row level security;
drop policy if exists tenant_isolation on comunicacao_aniversario_modelos;
create policy tenant_isolation on comunicacao_aniversario_modelos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_aniversario_modelos to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_aniversario_modelos;
create trigger set_emp_from_jwt before insert on comunicacao_aniversario_modelos
  for each row execute function public.set_emp_from_jwt();

notify pgrst, 'reload schema';
