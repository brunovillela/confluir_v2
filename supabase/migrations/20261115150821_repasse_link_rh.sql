-- Confluir — link do RH da fonte pagadora (controle de envio das relações)
--
-- POR QUÊ: a relação de descontos chega por e-mail, alguém baixa, guarda e
-- importa; as inclusões e exclusões de desconto vão em planilha anexa, com
-- nomes e CPFs circulando por e-mail. Um link próprio de cada empresa deixa o
-- RH enviar a relação do mês direto ao Confluir (ou informar que não houve
-- desconto), ver as inclusões e exclusões que o sindicato disponibilizou e
-- confirmar que recebeu, sem login.
--
-- COMO:
--  1. `filiacao_repasse_links`: o link de cada empresa (token aleatório, como
--     /assinar e /dados-bancarios). Um ativo por empresa; revogar encerra.
--  2. `filiacao_repasse_envios`: cada envio feito pelo link — competência,
--     tipo, arquivo (bucket privado `relacoes-desconto`) ou "sem desconto",
--     quem enviou (nome e e-mail informados) e quando. A equipe lança o
--     arquivo em Receitas; o controle trata o envio como "recebida, falta
--     lançar" até a relação ser lançada.
--  3. `filiacao_desconto_confirmacoes`: a confirmação, pelo RH, de que recebeu
--     uma comunicação de inclusões/exclusões. A comunicação continua imutável.
--  4. A comunicação ganha o meio 'link' (disponibilizada no link do RH).
-- Idempotente.

-- ── 1. Links ────────────────────────────────────────────────────────────────
create table if not exists public.filiacao_repasse_links (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  token text not null unique check (length(token) >= 32),
  criado_em timestamptz not null default now(),
  criado_por text,
  revogado_em timestamptz,
  revogado_por text,
  ultimo_acesso_em timestamptz
);

create unique index if not exists filiacao_repasse_links_ativo
  on public.filiacao_repasse_links (emp_proprietaria_id, empresa_id)
  where revogado_em is null;

-- ── 2. Envios pelo link ─────────────────────────────────────────────────────
create table if not exists public.filiacao_repasse_envios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  empresa_id uuid not null references public.empresa(id) on delete cascade,
  link_id uuid references public.filiacao_repasse_links(id) on delete set null,
  competencia integer not null check (competencia between 200001 and 210012 and competencia % 100 between 1 and 12),
  tipo text not null check (tipo in ('Associativa', 'Assistencial', 'Sindical')),
  sem_desconto boolean not null default false,
  arquivo text,
  nome_arquivo text,
  tamanho integer,
  valor_informado numeric(14,2),
  observacao text,
  enviado_por text not null check (length(trim(enviado_por)) > 0),
  enviado_email text,
  enviado_em timestamptz not null default now(),
  arquivado_em timestamptz,
  arquivado_por text,
  constraint filiacao_repasse_envios_conteudo check (sem_desconto or arquivo is not null)
);

create index if not exists filiacao_repasse_envios_idx
  on public.filiacao_repasse_envios (emp_proprietaria_id, competencia, tipo, empresa_id);

-- ── 3. Confirmações de recebimento ──────────────────────────────────────────
create table if not exists public.filiacao_desconto_confirmacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id) on delete cascade,
  comunicacao_id uuid not null unique references public.filiacao_desconto_comunicacoes(id) on delete cascade,
  link_id uuid references public.filiacao_repasse_links(id) on delete set null,
  confirmado_em timestamptz not null default now(),
  confirmado_por text not null check (length(trim(confirmado_por)) > 0),
  confirmado_email text
);

-- ── RLS e permissões (padrão das tabelas da entidade) ───────────────────────
do $$
declare t text;
begin
  foreach t in array array['filiacao_repasse_links', 'filiacao_repasse_envios', 'filiacao_desconto_confirmacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format($p$create policy tenant_isolation on public.%I to authenticated
      using (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)
      with check (emp_proprietaria_id = ((auth.jwt() ->> 'tenant_id'))::uuid)$p$, t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- ── 4. Comunicação disponibilizada no link ──────────────────────────────────
alter table public.filiacao_desconto_comunicacoes drop constraint if exists filiacao_desconto_comunicacoes_meio_check;
alter table public.filiacao_desconto_comunicacoes
  add constraint filiacao_desconto_comunicacoes_meio_check
  check (meio in ('email', 'sistema_rh', 'oficio', 'em_maos', 'outro', 'link'));

-- ── 5. Bucket privado dos arquivos enviados ─────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'relacoes-desconto',
  'relacoes-desconto',
  false,
  26214400,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
    'text/plain',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ── Comentários ─────────────────────────────────────────────────────────────
comment on table public.filiacao_repasse_links is 'Link próprio do RH de cada fonte pagadora para enviar a relação de descontos e confirmar inclusões/exclusões, sem login. Um ativo por empresa (15/11/2026). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.filiacao_repasse_links.token is 'Segredo do link (/relacao/<token>). Quem tem o link envia relações da empresa. [lgpd:nenhum]';
comment on column public.filiacao_repasse_links.criado_por is 'Nome de quem gerou o link. [lgpd:identificacao]';
comment on column public.filiacao_repasse_links.revogado_por is 'Nome de quem revogou o link. [lgpd:identificacao]';
comment on column public.filiacao_repasse_links.ultimo_acesso_em is 'Última vez que o link foi aberto.';

comment on table public.filiacao_repasse_envios is 'Relações de desconto (ou avisos de sem desconto) enviadas pelo RH da fonte pagadora pelo link próprio (15/11/2026). [lgpd:identificacao|titulares:contatos das empresas, filiados (no arquivo)]';
comment on column public.filiacao_repasse_envios.arquivo is 'Caminho do arquivo no bucket privado relacoes-desconto (a relação traz nome, CPF e valor de cada trabalhador). [lgpd:trabalhista]';
comment on column public.filiacao_repasse_envios.nome_arquivo is 'Nome original do arquivo. [lgpd:nenhum]';
comment on column public.filiacao_repasse_envios.valor_informado is 'Total da relação informado pelo RH (opcional), para conferir com a importação.';
comment on column public.filiacao_repasse_envios.observacao is 'Recado do RH. [lgpd:nenhum]';
comment on column public.filiacao_repasse_envios.enviado_por is 'Nome informado por quem enviou. [lgpd:identificacao]';
comment on column public.filiacao_repasse_envios.enviado_email is 'E-mail informado por quem enviou. [lgpd:identificacao]';
comment on column public.filiacao_repasse_envios.arquivado_em is 'Quando a equipe deu o envio por tratado sem lançar (ex.: arquivo errado, reenviado).';
comment on column public.filiacao_repasse_envios.arquivado_por is 'Nome de quem arquivou o envio. [lgpd:identificacao]';

comment on table public.filiacao_desconto_confirmacoes is 'Confirmação, pelo RH da fonte pagadora, de que recebeu uma comunicação de inclusões/exclusões de desconto (15/11/2026). [lgpd:identificacao|titulares:contatos das empresas]';
comment on column public.filiacao_desconto_confirmacoes.confirmado_por is 'Nome informado por quem confirmou. [lgpd:identificacao]';
comment on column public.filiacao_desconto_confirmacoes.confirmado_email is 'E-mail informado por quem confirmou. [lgpd:identificacao]';
