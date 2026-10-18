-- Confluir — Comunicação › Assistente de redação (2026-09-02)
--
-- A IA escreve o texto a partir de TRÊS camadas:
--   1. POLÍTICA EDITORIAL do sindicato (voz, tom, valores) — uma por tenant,
--      estável, e melhorável por IA a partir de textos já publicados;
--   2. CANAL de distribuição (site, Instagram, folder…) — cada um com o
--      tamanho sugerido e as convenções de formato daquele meio;
--   3. SOLICITAÇÃO do usuário (fatos, objetivo, público, chamada para ação…).
--
-- Por que os FATOS são campo obrigatório: tamanho, objetivo e canal dizem à IA
-- COMO escrever, não SOBRE O QUÊ. Sem fatos ela inventa — e numa denúncia
-- inventar é risco jurídico. A trava está aqui no banco (check), não só na tela.
--
-- Padrão da casa: idempotente, RLS inline por tenant, trigger set_emp_from_jwt.
-- Executar UMA VEZ no SQL Editor do Supabase.

-- ── 1. Política editorial (uma por tenant) ───────────────────────────────────

create table if not exists comunicacao_politica (id uuid primary key default gen_random_uuid());
alter table comunicacao_politica add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_politica add column if not exists politica text;            -- voz, valores, como se refere à categoria
alter table comunicacao_politica add column if not exists publico_padrao text;      -- para quem se escreve, quando não se diz outra coisa
alter table comunicacao_politica add column if not exists tom_padrao text;          -- combativo, sóbrio, acolhedor…
alter table comunicacao_politica add column if not exists termos_evitar text;       -- palavras/expressões que a entidade não usa
alter table comunicacao_politica add column if not exists assinatura text;          -- fecho padrão ("Diretoria do …")
alter table comunicacao_politica add column if not exists atualizada_por uuid references usuarios(id);
alter table comunicacao_politica add column if not exists created_at timestamptz not null default now();
alter table comunicacao_politica add column if not exists updated_at timestamptz;

-- uma linha por tenant
create unique index if not exists ux_comunicacao_politica_emp
  on comunicacao_politica (emp_proprietaria_id);

alter table comunicacao_politica enable row level security;
drop policy if exists tenant_isolation on comunicacao_politica;
create policy tenant_isolation on comunicacao_politica for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_politica to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_politica;
create trigger set_emp_from_jwt before insert on comunicacao_politica
  for each row execute function public.set_emp_from_jwt();

-- ── 2. Canais de distribuição (cadastro do tenant) ───────────────────────────
--
-- NÃO é lista fixa no código: cada entidade tem os seus ("carro de som",
-- "mural da refinaria"). Cada canal carrega o que a IA precisa saber sobre o
-- meio — tamanho típico e convenções de formato.

create table if not exists comunicacao_canais (id uuid primary key default gen_random_uuid());
alter table comunicacao_canais add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_canais add column if not exists nome text;
alter table comunicacao_canais add column if not exists limite_caracteres integer;  -- tamanho sugerido ao escolher o canal
alter table comunicacao_canais add column if not exists orientacoes text;           -- convenções do meio, lidas pela IA
alter table comunicacao_canais add column if not exists suporta_busca boolean not null default false;
alter table comunicacao_canais add column if not exists ativo boolean not null default true;
alter table comunicacao_canais add column if not exists ordem integer not null default 0;
alter table comunicacao_canais add column if not exists created_at timestamptz not null default now();
alter table comunicacao_canais add column if not exists updated_at timestamptz;

create unique index if not exists ux_comunicacao_canais_nome
  on comunicacao_canais (emp_proprietaria_id, nome);
create index if not exists idx_comunicacao_canais_emp
  on comunicacao_canais (emp_proprietaria_id);

alter table comunicacao_canais enable row level security;
drop policy if exists tenant_isolation on comunicacao_canais;
create policy tenant_isolation on comunicacao_canais for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_canais to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_canais;
create trigger set_emp_from_jwt before insert on comunicacao_canais
  for each row execute function public.set_emp_from_jwt();

-- ── 3. Textos solicitados ────────────────────────────────────────────────────
--
-- Guarda a SOLICITAÇÃO inteira, não só o resultado: é o que permite regerar
-- com um ajuste ("ficou longo", "menos formal") sem redigitar tudo. Cada
-- regeração é uma linha nova apontando para a original em `origem_id`.
--
-- texto_gerado × texto_final: o primeiro é o que a IA devolveu, o segundo é o
-- que a pessoa publicou depois de editar. Guardar os dois deixa a trilha do
-- que a entidade de fato aprova.

create table if not exists comunicacao_textos (id uuid primary key default gen_random_uuid());
alter table comunicacao_textos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table comunicacao_textos add column if not exists assunto text;               -- título curto da solicitação (para a lista)
alter table comunicacao_textos add column if not exists objetivo text;              -- denúncia, informe, convite…
alter table comunicacao_textos add column if not exists canal_id uuid references comunicacao_canais(id);
alter table comunicacao_textos add column if not exists canal_nome text;            -- congelado: o canal pode ser renomeado depois
alter table comunicacao_textos add column if not exists tamanho integer;            -- alvo em caracteres
alter table comunicacao_textos add column if not exists fatos text;                 -- OBRIGATÓRIO — a matéria-prima
alter table comunicacao_textos add column if not exists publico text;
alter table comunicacao_textos add column if not exists tom text;
alter table comunicacao_textos add column if not exists chamada_acao text;
alter table comunicacao_textos add column if not exists restricoes text;            -- o que NÃO dizer
alter table comunicacao_textos add column if not exists palavras_chave text;
alter table comunicacao_textos add column if not exists otimizar_busca boolean not null default false;
-- resultado
alter table comunicacao_textos add column if not exists titulo text;
alter table comunicacao_textos add column if not exists texto_gerado text;
alter table comunicacao_textos add column if not exists texto_final text;
alter table comunicacao_textos add column if not exists caracteres integer;         -- contagem real do gerado
alter table comunicacao_textos add column if not exists meta_descricao text;        -- otimização de busca (site)
alter table comunicacao_textos add column if not exists slug_sugerido text;         -- otimização de busca (site)
alter table comunicacao_textos add column if not exists hashtags text;              -- descoberta (redes sociais)
-- iteração
alter table comunicacao_textos add column if not exists versao integer not null default 1;
alter table comunicacao_textos add column if not exists origem_id uuid references comunicacao_textos(id);
alter table comunicacao_textos add column if not exists ajuste_pedido text;         -- o que se pediu ao regerar
-- controle
alter table comunicacao_textos add column if not exists solicitado_por uuid references usuarios(id);
alter table comunicacao_textos add column if not exists created_at timestamptz not null default now();
alter table comunicacao_textos add column if not exists updated_at timestamptz;

create index if not exists idx_comunicacao_textos_emp
  on comunicacao_textos (emp_proprietaria_id, created_at desc);
create index if not exists idx_comunicacao_textos_origem
  on comunicacao_textos (origem_id);

-- Trava dos fatos no banco (defesa em profundidade — a tela também exige).
-- NOT VALID: não reprova linhas antigas caso a tabela já exista com dados.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ck_comunicacao_textos_fatos'
  ) then
    alter table comunicacao_textos
      add constraint ck_comunicacao_textos_fatos
      check (fatos is not null and length(btrim(fatos)) >= 20) not valid;
  end if;
end $$;

alter table comunicacao_textos enable row level security;
drop policy if exists tenant_isolation on comunicacao_textos;
create policy tenant_isolation on comunicacao_textos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on comunicacao_textos to authenticated;
drop trigger if exists set_emp_from_jwt on comunicacao_textos;
create trigger set_emp_from_jwt before insert on comunicacao_textos
  for each row execute function public.set_emp_from_jwt();

-- ── 4. Canais iniciais, para cada tenant que ainda não tem nenhum ────────────
--
-- Data-driven: percorre os tenants existentes, não cita nenhum. São meios
-- genéricos (não a composição de um sindicato específico) — o tenant edita,
-- renomeia e acrescenta os seus.

insert into comunicacao_canais
  (emp_proprietaria_id, nome, limite_caracteres, orientacoes, suporta_busca, ordem)
select e.id, c.nome, c.limite, c.orientacoes, c.busca, c.ordem
from (select distinct emp_proprietaria_id as id from usuarios where emp_proprietaria_id is not null) e
cross join (values
  ('Site do sindicato', 3000, 'Texto para a página de notícias do site. Comece por um título e uma linha de abertura que resuma o fato. Parágrafos curtos, subtítulos a cada dois ou três blocos. Pode citar fontes e datas por extenso.', true, 1),
  ('Instagram', 2200, 'Legenda de post. As duas primeiras linhas precisam prender antes do "ver mais". Frases curtas, quebras de linha frequentes, no máximo um emoji por bloco. Hashtags só no final.', true, 2),
  ('LinkedIn', 3000, 'Tom profissional e sóbrio, sem gíria. Abertura direta, sem "estamos felizes em anunciar". Poucas hashtags (até cinco) e nenhuma no meio do texto.', true, 3),
  ('Facebook', 2000, 'Texto conversacional, um pouco mais longo que o do Instagram. Links funcionam bem; hashtags, quase nada.', true, 4),
  ('WhatsApp', 800, 'Mensagem para listas e grupos. Vai direto ao ponto na primeira linha, porque a pessoa lê na notificação. Sem formatação além de negrito ocasional. Curto o bastante para não ser cortado.', false, 5),
  ('E-mail', 2500, 'Informativo por e-mail. Assunto curto e específico. Primeiro parágrafo resolve a informação principal; o resto é detalhamento para quem quiser.', false, 6),
  ('Folder impresso', 1500, 'Peça impressa. Título forte, blocos com subtítulos, informação que se sustenta sozinha (quem lê não tem link para clicar). Datas, locais e telefones sempre por extenso.', false, 7),
  ('Cartaz ou mural', 400, 'Leitura à distância e de passagem. Poucas palavras, uma ideia só, chamada para ação em destaque. Nada de parágrafo corrido.', false, 8)
) as c(nome, limite, orientacoes, busca, ordem)
where not exists (
  select 1 from comunicacao_canais x where x.emp_proprietaria_id = e.id
)
on conflict do nothing;
