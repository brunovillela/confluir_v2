-- Confluir — Comunicação › Etiquetas para os Correios (2026-09-14)
--
-- Impressão de etiquetas de endereçamento (folhas Pimaco, Carta e A4) para
-- enviar publicações impressas a filiados de qualquer condição sindical.
-- Os endereços vêm do cadastro (filiacoes) — nada é copiado para cá.
--
-- • Permissão própria `comunicacao_etiquetas`: baixar endereço residencial de
--   milhares de pessoas é mais sensível que publicar notícia, então não pega
--   carona na permissão `noticias`. A gestão da filiação também acessa.
-- • Cada PDF/CSV baixado fica registrado (LGPD: quem, quando, quantas, com que
--   recorte). Sem esta tabela a emissão funciona, mas não fica registrada.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

alter table permissoes add column if not exists comunicacao_etiquetas boolean;

create table if not exists comunicacao_etiquetas_emissoes (id uuid primary key default gen_random_uuid());
alter table comunicacao_etiquetas_emissoes add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_etiquetas_emissoes add column if not exists usuario_id uuid references usuarios(id);
alter table comunicacao_etiquetas_emissoes add column if not exists tipo text;         -- pdf | csv
alter table comunicacao_etiquetas_emissoes add column if not exists modelo text;       -- código Pimaco
alter table comunicacao_etiquetas_emissoes add column if not exists lote text;         -- "1 de 3 (etiquetas 1–1.980)"
alter table comunicacao_etiquetas_emissoes add column if not exists quantidade integer not null default 0;
alter table comunicacao_etiquetas_emissoes add column if not exists recorte text;      -- filtros aplicados, legíveis
alter table comunicacao_etiquetas_emissoes add column if not exists created_at timestamptz not null default now();

create index if not exists idx_comunicacao_etiquetas_emissoes_emp
  on comunicacao_etiquetas_emissoes (emp_proprietaria_id, created_at desc);

alter table comunicacao_etiquetas_emissoes enable row level security;
drop policy if exists tenant_isolation on comunicacao_etiquetas_emissoes;
create policy tenant_isolation on comunicacao_etiquetas_emissoes for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_etiquetas_emissoes to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_etiquetas_emissoes;
create trigger set_emp_from_jwt before insert on comunicacao_etiquetas_emissoes
  for each row execute function public.set_emp_from_jwt();
