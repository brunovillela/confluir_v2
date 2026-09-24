-- Confluir — Assinatura eletrônica GENERALIZADA (2026-09-24)
--
-- O envelope de assinatura deixa de ser só de ofício e passa a servir a
-- qualquer documento — o primeiro caso novo é o termo de cessão de espaço.
--
-- ── POR QUE RENOMEAR, E NÃO COPIAR ──────────────────────────────────────────
-- A alternativa era criar uma tabela nova e migrar as linhas. Só que há um
-- envelope PENDENTE em produção (um ofício aguardando assinatura): copiar
-- linhas abriria uma janela em que o link já enviado apontaria para o lugar
-- errado. `alter table ... rename` é atômico e instantâneo, e leva junto os
-- índices, as constraints e as policies. O dado não se move.
--
-- O nome `assinaturas` NÃO serve: já existe uma tabela com esse nome, legado
-- do Bubble para assinatura de atas.
--
-- ── DOIS ASSINANTES ─────────────────────────────────────────────────────────
-- O ofício tem um assinante por vez. A cessão tem DOIS — a entidade (cedente)
-- e quem recebe o espaço (concessionário) —, e a ordem importa: quem cede
-- assina primeiro. Daí `ordem` e `papel`.
--
-- Idempotente: pode rodar mais de uma vez. Executar UMA VEZ no SQL Editor.

-- ── 1. Renomeia (só se ainda não foi renomeado) ──────────────────────────────

do $$
begin
  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'oficios_assinaturas')
     and not exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'documento_assinaturas') then
    alter table public.oficios_assinaturas rename to documento_assinaturas;
  end if;

  if exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'oficios_assinaturas_eventos')
     and not exists (select 1 from information_schema.tables
             where table_schema = 'public' and table_name = 'documento_assinatura_eventos') then
    alter table public.oficios_assinaturas_eventos rename to documento_assinatura_eventos;
  end if;
end $$;

-- ── 2. Colunas genéricas ─────────────────────────────────────────────────────

-- Que documento este envelope assina. 'oficio' é o que existia.
alter table documento_assinaturas add column if not exists documento_tipo text;
alter table documento_assinaturas add column if not exists documento_id uuid;
-- Ordem de assinatura (1 = primeiro) e papel de quem assina.
alter table documento_assinaturas add column if not exists ordem smallint not null default 1;
alter table documento_assinaturas add column if not exists papel text;

-- Backfill do que já existe: tudo era ofício.
update documento_assinaturas
   set documento_tipo = 'oficio',
       documento_id = oficio_id
 where documento_tipo is null and oficio_id is not null;

-- A partir daqui o vínculo é pelo par (tipo, id). `oficio_id` continua
-- preenchido para o ofício — é FK com ON DELETE CASCADE, e apagar um ofício
-- deve seguir levando o envelope junto.
alter table documento_assinaturas alter column oficio_id drop not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ck_doc_assinaturas_tipo') then
    alter table documento_assinaturas add constraint ck_doc_assinaturas_tipo
      check (documento_tipo is null or documento_tipo in ('oficio', 'cessao')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ck_doc_assinaturas_papel') then
    alter table documento_assinaturas add constraint ck_doc_assinaturas_papel
      check (papel is null or papel in ('cedente', 'concessionario', 'assinante')) not valid;
  end if;
end $$;

create index if not exists idx_doc_assinaturas_documento
  on documento_assinaturas (documento_tipo, documento_id, ordem);

comment on table documento_assinaturas is
  'Envelope de assinatura eletrônica de um documento (ofício, termo de cessão), por assinante: token do link, código por e-mail, hash do conteúdo e certificado. Nome antigo: oficios_assinaturas.';
comment on column documento_assinaturas.documento_tipo is
  'oficio | cessao — define de onde sai o conteúdo assinado e o que acontece ao assinar.';
comment on column documento_assinaturas.ordem is
  'Ordem de assinatura. A cessão tem dois assinantes: cedente (1) e concessionário (2).';

-- ── 3. RLS, grants e trigger nos nomes novos ─────────────────────────────────
--
-- As policies acompanham o rename, mas re-declarar é barato e deixa o arquivo
-- auto-suficiente para quem criar um tenant do zero.

alter table documento_assinaturas enable row level security;
drop policy if exists tenant_isolation on documento_assinaturas;
create policy tenant_isolation on documento_assinaturas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on documento_assinaturas to authenticated;
drop trigger if exists set_emp_from_jwt on documento_assinaturas;
create trigger set_emp_from_jwt before insert on documento_assinaturas
  for each row execute function public.set_emp_from_jwt();

alter table documento_assinatura_eventos enable row level security;
drop policy if exists trilha_leitura on documento_assinatura_eventos;
create policy trilha_leitura on documento_assinatura_eventos for select to authenticated
  using (true);
drop policy if exists trilha_insercao on documento_assinatura_eventos;
create policy trilha_insercao on documento_assinatura_eventos for insert to authenticated
  with check (true);
grant select, insert on documento_assinatura_eventos to authenticated;

-- ── 4. O termo de cessão aponta para o envelope ──────────────────────────────

alter table cessao_solicitacoes add column if not exists termo_hash text;
alter table cessao_solicitacoes add column if not exists termo_assinado_em timestamptz;
alter table cessao_solicitacoes add column if not exists termo_pdf text;

comment on column cessao_solicitacoes.termo_hash is
  'SHA-256 do texto no momento do envio para assinatura. Confere de novo na hora de assinar: se o termo mudou, a assinatura não vale.';

notify pgrst, 'reload schema';
