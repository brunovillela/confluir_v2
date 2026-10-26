-- Confluir — Saúde: CAT registrada sem conferência (26/10/2026)
--
-- POR QUÊ: a leitura de CAT por IA passou a aceitar vários PDFs de uma vez, e
-- o usuário pode mandar gravar o que a IA leu sem conferir campo a campo. A IA
-- erra (CBO, datas, códigos); esses registros precisam ficar marcados até que
-- alguém os confira contra o PDF.
--
-- COMO: `sem_conferencia` liga a marca (a página da CAT mostra um alerta no
-- topo e a lista tem filtro e selo); `leitura_avisos` guarda os avisos da
-- leitura para quem for conferir; `conferida_em/por` registram quem tirou a
-- marca. O PDF lido vai para `arquivo_url` (coluna já existente, caminho no
-- bucket privado `saude`). Idempotente.

alter table public.saude_cat
  add column if not exists sem_conferencia boolean not null default false,
  add column if not exists leitura_avisos text[],
  add column if not exists conferida_em timestamptz,
  add column if not exists conferida_por uuid references public.usuarios(id) on delete set null;

create index if not exists saude_cat_sem_conferencia_idx
  on public.saude_cat (emp_proprietaria_id)
  where sem_conferencia;

comment on column public.saude_cat.sem_conferencia is 'Gravada a partir da leitura do PDF por IA sem conferência humana; fica marcada até alguém conferir (alerta no topo da CAT).';
comment on column public.saude_cat.leitura_avisos is 'Avisos da leitura por IA no momento da gravação sem conferência (data não reconhecida, opção desconhecida…). [lgpd:sensivel_saude]';
comment on column public.saude_cat.conferida_em is 'Quando a CAT registrada sem conferência foi conferida.';
comment on column public.saude_cat.conferida_por is 'Quem conferiu a CAT registrada sem conferência (usuarios.id). [lgpd:identificacao]';
comment on column public.saude_cat.arquivo_url is 'PDF da CAT: caminho no bucket privado `saude` (cat/<id>/…); a exibição gera signed URL de 1h. [lgpd:sensivel_saude]';
