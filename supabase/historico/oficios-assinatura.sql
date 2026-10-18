-- ============================================================================
-- Assinatura eletrônica de ofícios (2026-09-15). Idempotente — rodar no SQL
-- Editor do Supabase antes do deploy.
--
-- Pedido do Bruno: o assinador recebe e-mail avisando que há ofício a assinar;
-- assinado, o ofício passa a Emitido e ganha QR Code para conferir data, hora
-- e um certificado único. Modelo inspirado no DocuSign:
--
--   • ENVELOPE = a linha de `oficios_assinaturas` (um por assinante; hoje o
--     ofício tem um assinante, o modelo aceita mais);
--   • o link do e-mail leva um TOKEN único; na hora de assinar, um CÓDIGO de
--     6 dígitos vai ao mesmo e-mail (prova de posse da caixa), guardado como
--     hash salgado, com validade e limite de tentativas;
--   • o conteúdo é CONGELADO no envio: `hash_documento` (SHA-256 do conteúdo
--     que o PDF mostra) é recalculado na assinatura e precisa bater;
--   • TRILHA DE AUDITORIA append-only em `oficios_assinaturas_eventos`
--     (envio, abertura, código, assinatura, recusa, cancelamento — com IP e
--     navegador), que vira a página "Certificado de assinatura" do PDF;
--   • CERTIFICADO = código público curto, impresso sob a assinatura e no QR,
--     conferido em /verificar/<código> sem login.
--
-- Situações do ofício ganham "Aguardando assinatura" (texto livre, sem CHECK).
-- ============================================================================

-- E-mail de assinatura do integrante da diretoria (nem todo integrante tem
-- usuário no painel — o Coordenador Geral, por exemplo). Preenchido no envio.
alter table diretoria_integrantes add column if not exists email text;

-- Quem enviou para assinatura (recebe o aviso de assinado/recusado).
alter table oficios add column if not exists enviado_por_id uuid references usuarios(id);

create table if not exists oficios_assinaturas (id uuid primary key default gen_random_uuid());
alter table oficios_assinaturas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table oficios_assinaturas add column if not exists oficio_id uuid references oficios(id) on delete cascade;
alter table oficios_assinaturas add column if not exists integrante_id uuid references diretoria_integrantes(id) on delete set null;
alter table oficios_assinaturas add column if not exists nome text;
alter table oficios_assinaturas add column if not exists cargo text;
alter table oficios_assinaturas add column if not exists email text;
alter table oficios_assinaturas add column if not exists token uuid not null default gen_random_uuid();
alter table oficios_assinaturas add column if not exists certificado text;
alter table oficios_assinaturas add column if not exists situacao text not null default 'pendente';
alter table oficios_assinaturas add column if not exists hash_documento text;
alter table oficios_assinaturas add column if not exists codigo_hash text;
alter table oficios_assinaturas add column if not exists codigo_expira_em timestamptz;
alter table oficios_assinaturas add column if not exists codigo_tentativas integer not null default 0;
alter table oficios_assinaturas add column if not exists enviado_em timestamptz;
alter table oficios_assinaturas add column if not exists visualizado_em timestamptz;
alter table oficios_assinaturas add column if not exists assinado_em timestamptz;
alter table oficios_assinaturas add column if not exists recusado_em timestamptz;
alter table oficios_assinaturas add column if not exists motivo_recusa text;
alter table oficios_assinaturas add column if not exists ip text;
alter table oficios_assinaturas add column if not exists user_agent text;
alter table oficios_assinaturas add column if not exists enviado_por_id uuid references usuarios(id);
alter table oficios_assinaturas add column if not exists created_at timestamptz not null default now();
alter table oficios_assinaturas add column if not exists updated_at timestamptz;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oficios_assinaturas_situacao_check') then
    alter table oficios_assinaturas add constraint oficios_assinaturas_situacao_check
      check (situacao in ('pendente', 'assinado', 'recusado', 'cancelado'));
  end if;
end $$;

create unique index if not exists ux_oficios_assinaturas_token on oficios_assinaturas (token);
create unique index if not exists ux_oficios_assinaturas_certificado on oficios_assinaturas (certificado);
create index if not exists idx_oficios_assinaturas_oficio on oficios_assinaturas (oficio_id, created_at desc);

comment on table oficios_assinaturas is
  'Envelope de assinatura eletrônica de um ofício, por assinante (token do link, código por e-mail, hash do conteúdo, certificado).';

create table if not exists oficios_assinaturas_eventos (id uuid primary key default gen_random_uuid());
alter table oficios_assinaturas_eventos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table oficios_assinaturas_eventos add column if not exists assinatura_id uuid references oficios_assinaturas(id) on delete cascade;
alter table oficios_assinaturas_eventos add column if not exists tipo text not null;
alter table oficios_assinaturas_eventos add column if not exists detalhe text;
alter table oficios_assinaturas_eventos add column if not exists ip text;
alter table oficios_assinaturas_eventos add column if not exists user_agent text;
alter table oficios_assinaturas_eventos add column if not exists created_at timestamptz not null default now();

create index if not exists idx_oficios_assinaturas_eventos on oficios_assinaturas_eventos (assinatura_id, created_at);

comment on table oficios_assinaturas_eventos is
  'Trilha de auditoria da assinatura (enviado, reenviado, visualizado, codigo_enviado, codigo_invalido, assinado, recusado, cancelado). Só inserção.';

-- ── RLS por tenant (padrão da casa). A página pública usa service role com o
--    tenant explícito; o painel lê pelo JWT do tenant. A trilha não tem update
--    nem delete para o authenticated: é só inserção.
do $$
declare t text;
begin
  foreach t in array array['oficios_assinaturas', 'oficios_assinaturas_eventos'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on %I', t);
    execute format('drop trigger if exists set_emp_from_jwt on %I', t);
    execute format('create trigger set_emp_from_jwt before insert on %I for each row execute function public.set_emp_from_jwt()', t);
  end loop;
end $$;

create policy tenant_isolation on oficios_assinaturas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on oficios_assinaturas to authenticated;

drop policy if exists trilha_leitura on oficios_assinaturas_eventos;
drop policy if exists trilha_insercao on oficios_assinaturas_eventos;
create policy trilha_leitura on oficios_assinaturas_eventos for select to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
create policy trilha_insercao on oficios_assinaturas_eventos for insert to authenticated
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
revoke update, delete on oficios_assinaturas_eventos from authenticated;
grant select, insert on oficios_assinaturas_eventos to authenticated;

notify pgrst, 'reload schema';
