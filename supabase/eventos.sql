-- Confluir — Módulo Eventos (2026-09-05)
--
-- Inscrição e confirmação de presença em eventos da entidade, com quatro
-- interfaces: gestão (/painel/eventos), página pública (/evento/<slug>),
-- recepção (/recepcao, no molde do /mesario) e o canal do titular dos dados.
--
-- ── A FOTO E A LGPD ─────────────────────────────────────────────────────────
-- A MESMA foto tem regime legal diferente conforme o uso, e é isso que o campo
-- `modo_foto` comanda:
--   • 'nenhuma'    — não se pede foto.
--   • 'visual'     — a recepção confere com o olho humano. Dado pessoal comum.
--   • 'biometrica' — alimenta reconhecimento facial de catraca. É DADO SENSÍVEL
--                    (LGPD art. 5º II e art. 11): exige consentimento
--                    específico e destacado, finalidade determinada e prazo.
-- Muitas entidades não têm catraca informatizada; por isso o modo é CONFIGURAÇÃO
-- POR TENANT e não regra do sistema. O evento pode pedir MENOS que o tenant
-- permite (um ato de rua não precisa de foto), nunca mais.
--
-- Consequência prática: `filiacoes.foto` NÃO é reaproveitada. Quem enviou foto
-- para a carteirinha não consentiu com reconhecimento facial — usá-la seria
-- desvio de finalidade.
--
-- ── O CONTROLE DE ACESSO EXTERNO ────────────────────────────────────────────
-- O envio da foto ao sistema de catraca é modelado como ETAPA COM ESTADO
-- (`acesso_situacao`), independente do mecanismo: hoje exportação manual,
-- amanhã API. O que não muda é a trilha — quando foi enviada e quando a
-- remoção foi pedida —, que é o que sustenta a resposta ao titular.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

-- ── 0. Bucket privado das fotos e cards ──────────────────────────────────────

insert into storage.buckets (id, name, public)
values ('eventos', 'eventos', false)
on conflict (id) do nothing;

-- ── 1. Configuração por tenant ───────────────────────────────────────────────

create table if not exists eventos_config (id uuid primary key default gen_random_uuid());
alter table eventos_config add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos_config add column if not exists modo_foto text not null default 'nenhuma';
alter table eventos_config add column if not exists retencao_foto_dias integer not null default 30;
-- Nome do sistema de catraca (aparece na pendência de remoção e no termo).
alter table eventos_config add column if not exists controle_acesso_nome text;
-- Enquanto não houver API, a remoção lá é MANUAL e o sistema gera pendência.
alter table eventos_config add column if not exists controle_acesso_exclusao_manual boolean not null default true;
alter table eventos_config add column if not exists atualizada_por uuid references usuarios(id);
alter table eventos_config add column if not exists created_at timestamptz not null default now();
alter table eventos_config add column if not exists updated_at timestamptz;

create unique index if not exists ux_eventos_config_emp
  on eventos_config (emp_proprietaria_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_config_modo_foto') then
    alter table eventos_config add constraint ck_eventos_config_modo_foto
      check (modo_foto in ('nenhuma', 'visual', 'biometrica')) not valid;
  end if;
end $$;

alter table eventos_config enable row level security;
drop policy if exists tenant_isolation on eventos_config;
create policy tenant_isolation on eventos_config for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos_config to authenticated;
drop trigger if exists set_emp_from_jwt on eventos_config;
create trigger set_emp_from_jwt before insert on eventos_config
  for each row execute function public.set_emp_from_jwt();

-- ── 2. Termos de consentimento, versionados ──────────────────────────────────
--
-- Espelha `filiacao_tl_lgpd`: o texto é VERSIONADO e a inscrição guarda QUAL
-- versão a pessoa aceitou. Se o termo mudar, quem aceitou o anterior continua
-- rastreável ao texto que de fato leu.

create table if not exists eventos_termos (id uuid primary key default gen_random_uuid());
alter table eventos_termos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos_termos add column if not exists tipo text;          -- inscricao | foto_visual | foto_biometrica
alter table eventos_termos add column if not exists versao integer not null default 1;
alter table eventos_termos add column if not exists texto text;
alter table eventos_termos add column if not exists em_vigor boolean not null default true;
alter table eventos_termos add column if not exists created_at timestamptz not null default now();
alter table eventos_termos add column if not exists updated_at timestamptz;

create index if not exists idx_eventos_termos_emp
  on eventos_termos (emp_proprietaria_id, tipo, em_vigor);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_termos_tipo') then
    alter table eventos_termos add constraint ck_eventos_termos_tipo
      check (tipo in ('inscricao', 'foto_visual', 'foto_biometrica')) not valid;
  end if;
end $$;

alter table eventos_termos enable row level security;
drop policy if exists tenant_isolation on eventos_termos;
create policy tenant_isolation on eventos_termos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos_termos to authenticated;
drop trigger if exists set_emp_from_jwt on eventos_termos;
create trigger set_emp_from_jwt before insert on eventos_termos
  for each row execute function public.set_emp_from_jwt();

-- ── 3. O evento ──────────────────────────────────────────────────────────────

create table if not exists eventos (id uuid primary key default gen_random_uuid());
alter table eventos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos add column if not exists slug text;                 -- /evento/<slug>
alter table eventos add column if not exists titulo text;
alter table eventos add column if not exists descricao text;
alter table eventos add column if not exists card_url text;             -- imagem no bucket `eventos`
alter table eventos add column if not exists local text;
alter table eventos add column if not exists endereco text;
alter table eventos add column if not exists inicio timestamptz;
alter table eventos add column if not exists termino timestamptz;
-- Capacidade
alter table eventos add column if not exists lotacao_maxima integer;
alter table eventos add column if not exists overbooking_percentual numeric not null default 0;
-- Travas de inscrição
alter table eventos add column if not exists inscricoes_abrem_em timestamptz;
alter table eventos add column if not exists inscricoes_fecham_em timestamptz;
alter table eventos add column if not exists limite_inscricoes integer;  -- teto próprio, além da lotação
-- Regras
alter table eventos add column if not exists exige_aprovacao boolean not null default false;
alter table eventos add column if not exists confirma_filiado_automatico boolean not null default true;
alter table eventos add column if not exists exige_foto boolean not null default false;
alter table eventos add column if not exists exige_rsvp boolean not null default false;
-- Ciclo de vida
alter table eventos add column if not exists situacao text not null default 'rascunho';
alter table eventos add column if not exists adiado_para timestamptz;    -- nulo = adiado SEM data definida
alter table eventos add column if not exists motivo_situacao text;
alter table eventos add column if not exists situacao_em timestamptz;
-- Integração com a Agenda (que já é onde se olha "o que tem essa semana")
alter table eventos add column if not exists agenda_id uuid references agenda(id);
alter table eventos add column if not exists criado_por uuid references usuarios(id);
alter table eventos add column if not exists created_at timestamptz not null default now();
alter table eventos add column if not exists updated_at timestamptz;

create unique index if not exists ux_eventos_slug
  on eventos (emp_proprietaria_id, slug);
create index if not exists idx_eventos_emp_inicio
  on eventos (emp_proprietaria_id, inicio desc);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_situacao') then
    alter table eventos add constraint ck_eventos_situacao
      check (situacao in ('rascunho', 'publicado', 'encerrado', 'cancelado', 'adiado')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_overbooking') then
    alter table eventos add constraint ck_eventos_overbooking
      check (overbooking_percentual >= 0 and overbooking_percentual <= 100) not valid;
  end if;
end $$;

alter table eventos enable row level security;
drop policy if exists tenant_isolation on eventos;
create policy tenant_isolation on eventos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos to authenticated;
drop trigger if exists set_emp_from_jwt on eventos;
create trigger set_emp_from_jwt before insert on eventos
  for each row execute function public.set_emp_from_jwt();

-- ── 4. Dias do evento ────────────────────────────────────────────────────────
--
-- Tabela própria porque a PRESENÇA É POR DIA: um congresso de três dias com
-- presença única mede uma coisa, por dia mede outra — e os indicadores mudam.

create table if not exists eventos_dias (id uuid primary key default gen_random_uuid());
alter table eventos_dias add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos_dias add column if not exists evento_id uuid references eventos(id) on delete cascade;
alter table eventos_dias add column if not exists data date;
alter table eventos_dias add column if not exists hora_inicio time;
alter table eventos_dias add column if not exists hora_fim time;
alter table eventos_dias add column if not exists rotulo text;          -- "1º dia — credenciamento"
alter table eventos_dias add column if not exists ordem integer not null default 0;
alter table eventos_dias add column if not exists created_at timestamptz not null default now();

create unique index if not exists ux_eventos_dias
  on eventos_dias (evento_id, data);
create index if not exists idx_eventos_dias_evento
  on eventos_dias (emp_proprietaria_id, evento_id, ordem);

alter table eventos_dias enable row level security;
drop policy if exists tenant_isolation on eventos_dias;
create policy tenant_isolation on eventos_dias for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos_dias to authenticated;
drop trigger if exists set_emp_from_jwt on eventos_dias;
create trigger set_emp_from_jwt before insert on eventos_dias
  for each row execute function public.set_emp_from_jwt();

-- ── 5. Campos extras, configuráveis por evento ───────────────────────────────

create table if not exists eventos_campos (id uuid primary key default gen_random_uuid());
alter table eventos_campos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos_campos add column if not exists evento_id uuid references eventos(id) on delete cascade;
alter table eventos_campos add column if not exists rotulo text;
alter table eventos_campos add column if not exists tipo text not null default 'texto';  -- texto|numero|data|selecao|sim_nao
alter table eventos_campos add column if not exists opcoes text[];      -- para tipo 'selecao'
alter table eventos_campos add column if not exists ajuda text;
alter table eventos_campos add column if not exists obrigatorio boolean not null default false;
alter table eventos_campos add column if not exists ordem integer not null default 0;
alter table eventos_campos add column if not exists ativo boolean not null default true;
alter table eventos_campos add column if not exists created_at timestamptz not null default now();

create index if not exists idx_eventos_campos_evento
  on eventos_campos (emp_proprietaria_id, evento_id, ordem);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_campos_tipo') then
    alter table eventos_campos add constraint ck_eventos_campos_tipo
      check (tipo in ('texto', 'numero', 'data', 'selecao', 'sim_nao')) not valid;
  end if;
end $$;

alter table eventos_campos enable row level security;
drop policy if exists tenant_isolation on eventos_campos;
create policy tenant_isolation on eventos_campos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos_campos to authenticated;
drop trigger if exists set_emp_from_jwt on eventos_campos;
create trigger set_emp_from_jwt before insert on eventos_campos
  for each row execute function public.set_emp_from_jwt();

-- ── 6. Inscrições ────────────────────────────────────────────────────────────
--
-- CONVIDADO é a mesma linha, com `titular_id` apontando para quem reservou a
-- vaga. Reservar vaga é TAREFA DE DENTRO: só quem edita eventos lança convidado
-- (manualmente ou por planilha), então `reservada_por` é sempre um usuário.

create table if not exists eventos_inscricoes (id uuid primary key default gen_random_uuid());
alter table eventos_inscricoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos_inscricoes add column if not exists evento_id uuid references eventos(id) on delete cascade;
alter table eventos_inscricoes add column if not exists titular_id uuid references eventos_inscricoes(id) on delete cascade;
alter table eventos_inscricoes add column if not exists reservada_por uuid references usuarios(id);
-- Identificação
alter table eventos_inscricoes add column if not exists nome text;
alter table eventos_inscricoes add column if not exists cpf text;
alter table eventos_inscricoes add column if not exists email text;
alter table eventos_inscricoes add column if not exists telefone text;
alter table eventos_inscricoes add column if not exists filiacao_id uuid references filiacoes(id);
-- Confirmação de e-mail por código (mesmo mecanismo de /filiar e /votar)
alter table eventos_inscricoes add column if not exists email_confirmado_em timestamptz;
-- Foto
alter table eventos_inscricoes add column if not exists foto_url text;
alter table eventos_inscricoes add column if not exists foto_capturada_em timestamptz;
alter table eventos_inscricoes add column if not exists foto_expurgada_em timestamptz;
-- Consentimento: guarda QUAL termo (versão) foi aceito
alter table eventos_inscricoes add column if not exists termo_id uuid references eventos_termos(id);
alter table eventos_inscricoes add column if not exists termo_foto_id uuid references eventos_termos(id);
alter table eventos_inscricoes add column if not exists consentimento_em timestamptz;
alter table eventos_inscricoes add column if not exists consentimento_ip text;
-- Situação
alter table eventos_inscricoes add column if not exists origem text not null default 'publica';  -- publica|portal|painel|planilha
alter table eventos_inscricoes add column if not exists situacao text not null default 'pendente';
alter table eventos_inscricoes add column if not exists avaliada_por uuid references usuarios(id);
alter table eventos_inscricoes add column if not exists avaliada_em timestamptz;
alter table eventos_inscricoes add column if not exists motivo text;
-- RSVP (intenção de comparecer, antes do evento)
alter table eventos_inscricoes add column if not exists rsvp_token text;
alter table eventos_inscricoes add column if not exists rsvp_enviado_em timestamptz;
alter table eventos_inscricoes add column if not exists rsvp_respondido_em timestamptz;
alter table eventos_inscricoes add column if not exists rsvp_confirmado boolean;
-- Envio ao controle de acesso — etapa com ESTADO, independente do mecanismo
alter table eventos_inscricoes add column if not exists acesso_situacao text not null default 'nao_aplica';
alter table eventos_inscricoes add column if not exists acesso_enviado_em timestamptz;
alter table eventos_inscricoes add column if not exists acesso_removido_em timestamptz;
alter table eventos_inscricoes add column if not exists acesso_observacao text;
-- LGPD
alter table eventos_inscricoes add column if not exists anonimizada_em timestamptz;
alter table eventos_inscricoes add column if not exists created_at timestamptz not null default now();
alter table eventos_inscricoes add column if not exists updated_at timestamptz;

create index if not exists idx_eventos_insc_evento
  on eventos_inscricoes (emp_proprietaria_id, evento_id, situacao);
create index if not exists idx_eventos_insc_titular
  on eventos_inscricoes (titular_id);
create index if not exists idx_eventos_insc_cpf
  on eventos_inscricoes (emp_proprietaria_id, cpf);
-- Uma pessoa, uma inscrição por evento (o CPF é o identificador da pessoa,
-- como já é em `filiacoes`).
create unique index if not exists ux_eventos_insc_cpf_evento
  on eventos_inscricoes (evento_id, cpf) where cpf is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_insc_situacao') then
    alter table eventos_inscricoes add constraint ck_eventos_insc_situacao
      check (situacao in ('pendente', 'confirmada', 'recusada', 'cancelada', 'lista_espera')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_insc_acesso') then
    alter table eventos_inscricoes add constraint ck_eventos_insc_acesso
      check (acesso_situacao in ('nao_aplica', 'pendente', 'enviado', 'erro', 'removido')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_insc_origem') then
    alter table eventos_inscricoes add constraint ck_eventos_insc_origem
      check (origem in ('publica', 'portal', 'painel', 'planilha')) not valid;
  end if;
end $$;

alter table eventos_inscricoes enable row level security;
drop policy if exists tenant_isolation on eventos_inscricoes;
create policy tenant_isolation on eventos_inscricoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos_inscricoes to authenticated;
drop trigger if exists set_emp_from_jwt on eventos_inscricoes;
create trigger set_emp_from_jwt before insert on eventos_inscricoes
  for each row execute function public.set_emp_from_jwt();

-- ── 7. Respostas aos campos extras ───────────────────────────────────────────

create table if not exists eventos_inscricao_respostas (id uuid primary key default gen_random_uuid());
alter table eventos_inscricao_respostas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos_inscricao_respostas add column if not exists inscricao_id uuid references eventos_inscricoes(id) on delete cascade;
alter table eventos_inscricao_respostas add column if not exists campo_id uuid references eventos_campos(id);
-- Rótulo CONGELADO: o campo pode ser renomeado depois e a resposta antiga
-- precisa continuar legível.
alter table eventos_inscricao_respostas add column if not exists rotulo text;
alter table eventos_inscricao_respostas add column if not exists valor text;
alter table eventos_inscricao_respostas add column if not exists created_at timestamptz not null default now();

create index if not exists idx_eventos_resp_inscricao
  on eventos_inscricao_respostas (inscricao_id);

alter table eventos_inscricao_respostas enable row level security;
drop policy if exists tenant_isolation on eventos_inscricao_respostas;
create policy tenant_isolation on eventos_inscricao_respostas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos_inscricao_respostas to authenticated;
drop trigger if exists set_emp_from_jwt on eventos_inscricao_respostas;
create trigger set_emp_from_jwt before insert on eventos_inscricao_respostas
  for each row execute function public.set_emp_from_jwt();

-- ── 8. Presenças — uma por DIA ───────────────────────────────────────────────
--
-- Espelha o que as assembleias já fazem (`presenca_em`, `presenca_mesario_id`):
-- guarda QUEM confirmou, QUANDO e POR QUAL caminho.

create table if not exists eventos_presencas (id uuid primary key default gen_random_uuid());
alter table eventos_presencas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table eventos_presencas add column if not exists inscricao_id uuid references eventos_inscricoes(id) on delete cascade;
alter table eventos_presencas add column if not exists dia_id uuid references eventos_dias(id) on delete cascade;
alter table eventos_presencas add column if not exists confirmada_em timestamptz not null default now();
alter table eventos_presencas add column if not exists confirmada_por uuid references usuarios(id);
alter table eventos_presencas add column if not exists metodo text not null default 'busca';  -- qr|busca
alter table eventos_presencas add column if not exists created_at timestamptz not null default now();

-- Uma presença por pessoa por dia — reler o QR duas vezes não duplica.
create unique index if not exists ux_eventos_presencas
  on eventos_presencas (inscricao_id, dia_id);
create index if not exists idx_eventos_presencas_dia
  on eventos_presencas (emp_proprietaria_id, dia_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_eventos_presencas_metodo') then
    alter table eventos_presencas add constraint ck_eventos_presencas_metodo
      check (metodo in ('qr', 'busca')) not valid;
  end if;
end $$;

alter table eventos_presencas enable row level security;
drop policy if exists tenant_isolation on eventos_presencas;
create policy tenant_isolation on eventos_presencas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on eventos_presencas to authenticated;
drop trigger if exists set_emp_from_jwt on eventos_presencas;
create trigger set_emp_from_jwt before insert on eventos_presencas
  for each row execute function public.set_emp_from_jwt();

-- ── 9. LGPD: o canal do titular alcança quem NÃO é filiado ───────────────────
--
-- `lgpd_solicitacoes` já tem o fluxo certo (tipo, execução, contagem de
-- anonimizados/retidos e BASE LEGAL da retenção), mas está ancorada em
-- `filiacao_id`/`usuario_id`. Convidado de evento é externo: não tem filiação
-- nem conta. Estas colunas abrem o mesmo fluxo para ele, identificado pelo
-- e-mail que confirmou na inscrição.

alter table lgpd_solicitacoes add column if not exists inscricao_id uuid references eventos_inscricoes(id);
alter table lgpd_solicitacoes add column if not exists email_titular text;
alter table lgpd_solicitacoes add column if not exists cpf_titular text;
-- Pendência de remoção no sistema de catraca — hoje MANUAL e fora do Confluir.
-- Sem isto, o termo prometeria uma exclusão que não conseguimos executar.
alter table lgpd_solicitacoes add column if not exists acesso_remocao_pendente boolean not null default false;
alter table lgpd_solicitacoes add column if not exists acesso_removido_em timestamptz;
alter table lgpd_solicitacoes add column if not exists acesso_removido_por uuid references usuarios(id);

create index if not exists idx_lgpd_solic_email
  on lgpd_solicitacoes (emp_proprietaria_id, email_titular);

-- ── 10. Permissões dedicadas ─────────────────────────────────────────────────
--
-- Três papéis distintos: quem vê, quem organiza e quem fica na porta. A
-- recepção não edita evento nenhum — só confirma quem chegou.

alter table permissoes add column if not exists eventos boolean;
alter table permissoes add column if not exists eventos_gestao boolean;
alter table permissoes add column if not exists eventos_recepcao boolean;

-- ── 11. Configuração e termos iniciais, por tenant ───────────────────────────
--
-- Data-driven: percorre os tenants, não cita nenhum. Nasce em 'nenhuma' — a
-- entidade que tiver catraca muda para 'biometrica' conscientemente.

insert into eventos_config (emp_proprietaria_id, modo_foto, retencao_foto_dias)
select e.id, 'nenhuma', 30
from (select distinct emp_proprietaria_id as id from usuarios where emp_proprietaria_id is not null) e
where not exists (select 1 from eventos_config x where x.emp_proprietaria_id = e.id)
on conflict do nothing;

-- ATENÇÃO: os textos abaixo são um PONTO DE PARTIDA redigido em linguagem
-- simples, não parecer jurídico. Peça revisão do jurídico da entidade antes de
-- publicar o primeiro evento — especialmente o de biometria.

insert into eventos_termos (emp_proprietaria_id, tipo, versao, texto, em_vigor)
select e.id, t.tipo, 1, t.texto, true
from (select distinct emp_proprietaria_id as id from usuarios where emp_proprietaria_id is not null) e
cross join (values
  ('inscricao',
   'Ao se inscrever, você autoriza a entidade a tratar os dados informados (nome, CPF, e-mail e telefone) com a finalidade de organizar sua participação neste evento: confirmar a inscrição, controlar a lotação, comunicar mudanças e registrar sua presença. Os dados não são vendidos nem compartilhados para fins comerciais. Você pode, a qualquer momento, pedir acesso, correção ou exclusão dos seus dados pela página indicada no rodapé desta inscrição.'),
  ('foto_visual',
   'A foto enviada será usada apenas para conferir sua identidade na recepção do evento, por uma pessoa da equipe. Ela não alimenta nenhum sistema automático de reconhecimento. A foto é apagada em até 30 dias após o fim do evento.'),
  ('foto_biometrica',
   'ATENÇÃO — LEIA COM CUIDADO. A foto que você enviar será usada para RECONHECIMENTO FACIAL no sistema de controle de acesso do local, para liberar sua entrada na catraca sem fila. Imagem de rosto usada para identificar uma pessoa é DADO PESSOAL SENSÍVEL (dado biométrico), e por isso pedimos seu consentimento específico para esta finalidade. A foto será enviada ao sistema de controle de acesso da entidade e apagada do Confluir em até 30 dias após o fim do evento. A remoção no sistema de controle de acesso é feita separadamente, mediante seu pedido, e registramos quando foi executada. Você pode recusar: neste caso sua entrada será conferida manualmente na recepção, sem prejuízo à sua participação.')
) as t(tipo, texto)
where not exists (
  select 1 from eventos_termos x
   where x.emp_proprietaria_id = e.id and x.tipo = t.tipo
)
on conflict do nothing;
