-- Confluir — Comunicação › Slides para TV (2026-09-12)
--
-- Conjuntos de slides para passar em televisões com navegador. Cada conjunto
-- tem orientação própria (horizontal 16:9 ou vertical 9:16) e um LINK PÚBLICO
-- ÚNICO /tv/<slug>, sem login. A TV abre o link uma vez e fica rodando: ela
-- confere a versão a cada minuto e recarrega sozinha quando o conteúdo muda.
-- "Gerar novo link" troca o slug e derruba as TVs que usavam o antigo.
--
-- Cada slide: imagem e/ou título + descrição, com duração e período de
-- exibição opcionais. O logo da organização entra no canto superior direito
-- com a opacidade escolhida, e a faixa de rodapé passa as últimas notícias
-- (tabela `noticias`) e mensagens fixas.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

-- 1. Conjuntos -----------------------------------------------------------------
create table if not exists comunicacao_slides_conjuntos (id uuid primary key default gen_random_uuid());
alter table comunicacao_slides_conjuntos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_slides_conjuntos add column if not exists nome text;
alter table comunicacao_slides_conjuntos add column if not exists slug text;                 -- código do link público /tv/<slug>
alter table comunicacao_slides_conjuntos add column if not exists orientacao text not null default 'horizontal';
alter table comunicacao_slides_conjuntos add column if not exists girar text not null default 'nao';  -- nao | horario | anti_horario
alter table comunicacao_slides_conjuntos add column if not exists duracao_segundos integer not null default 10;
alter table comunicacao_slides_conjuntos add column if not exists mostrar_logo boolean not null default true;
alter table comunicacao_slides_conjuntos add column if not exists opacidade_logo integer not null default 70;  -- %
alter table comunicacao_slides_conjuntos add column if not exists faixa_ativa boolean not null default true;
alter table comunicacao_slides_conjuntos add column if not exists faixa_noticias boolean not null default true;
alter table comunicacao_slides_conjuntos add column if not exists faixa_quantidade integer not null default 8;
alter table comunicacao_slides_conjuntos add column if not exists faixa_texto text;          -- mensagens fixas, uma por linha
alter table comunicacao_slides_conjuntos add column if not exists mostrar_relogio boolean not null default true;
alter table comunicacao_slides_conjuntos add column if not exists publicado boolean not null default true;
alter table comunicacao_slides_conjuntos add column if not exists ultimo_acesso timestamptz; -- última vez que uma TV conferiu o link
alter table comunicacao_slides_conjuntos add column if not exists criado_por uuid references usuarios(id);
alter table comunicacao_slides_conjuntos add column if not exists created_at timestamptz not null default now();
alter table comunicacao_slides_conjuntos add column if not exists updated_at timestamptz;

do $$ begin
  alter table comunicacao_slides_conjuntos add constraint ck_slides_conjuntos_orientacao
    check (orientacao in ('horizontal', 'vertical'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table comunicacao_slides_conjuntos add constraint ck_slides_conjuntos_girar
    check (girar in ('nao', 'horario', 'anti_horario'));
exception when duplicate_object then null; end $$;

create unique index if not exists ux_comunicacao_slides_conjuntos_slug
  on comunicacao_slides_conjuntos (emp_proprietaria_id, slug);

-- 2. Slides --------------------------------------------------------------------
create table if not exists comunicacao_slides (id uuid primary key default gen_random_uuid());
alter table comunicacao_slides add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_slides add column if not exists conjunto_id uuid references comunicacao_slides_conjuntos(id) on delete cascade;
alter table comunicacao_slides add column if not exists ordem integer not null default 0;
alter table comunicacao_slides add column if not exists titulo text;
alter table comunicacao_slides add column if not exists descricao text;
alter table comunicacao_slides add column if not exists imagem_caminho text;               -- caminho no bucket `comunicacao`
alter table comunicacao_slides add column if not exists imagem_url text;                   -- URL pública
alter table comunicacao_slides add column if not exists ajuste text not null default 'cobrir';  -- cobrir | conter
alter table comunicacao_slides add column if not exists duracao_segundos integer;          -- null = a do conjunto
alter table comunicacao_slides add column if not exists exibir_de date;
alter table comunicacao_slides add column if not exists exibir_ate date;
alter table comunicacao_slides add column if not exists ativo boolean not null default true;
alter table comunicacao_slides add column if not exists criado_por uuid references usuarios(id);
alter table comunicacao_slides add column if not exists created_at timestamptz not null default now();
alter table comunicacao_slides add column if not exists updated_at timestamptz;

do $$ begin
  alter table comunicacao_slides add constraint ck_slides_ajuste
    check (ajuste in ('cobrir', 'conter'));
exception when duplicate_object then null; end $$;

create index if not exists idx_comunicacao_slides_conjunto
  on comunicacao_slides (conjunto_id, ordem);

-- 3. RLS por tenant (inline — mesmo padrão de comunicacao-pagina-links.sql) ----
alter table comunicacao_slides_conjuntos enable row level security;
drop policy if exists tenant_isolation on comunicacao_slides_conjuntos;
create policy tenant_isolation on comunicacao_slides_conjuntos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_slides_conjuntos to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_slides_conjuntos;
create trigger set_emp_from_jwt before insert on comunicacao_slides_conjuntos
  for each row execute function public.set_emp_from_jwt();

alter table comunicacao_slides enable row level security;
drop policy if exists tenant_isolation on comunicacao_slides;
create policy tenant_isolation on comunicacao_slides for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_slides to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_slides;
create trigger set_emp_from_jwt before insert on comunicacao_slides
  for each row execute function public.set_emp_from_jwt();

-- 4. Bucket PÚBLICO das imagens ------------------------------------------------
-- Público porque a TV abre sem login. Os arquivos ficam em slides/<emp>/<uuid>
-- e só são gravados pelo servidor (service role).
insert into storage.buckets (id, name, public)
values ('comunicacao', 'comunicacao', true)
on conflict (id) do update set public = true;
