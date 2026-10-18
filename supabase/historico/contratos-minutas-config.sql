-- Confluir — Minutas: tipos de contrato e cláusulas fixas por entidade (2026-09-27)
--
-- Configuração do tenant em Compras › Contratos › Minutas › Configuração:
--
-- contratos_minuta_tipos     → tipos de contrato (ex.: "Prestação de serviços por
--                              prazo determinado"), cada um com a explicação para
--                              quem escolhe e a ORIENTAÇÃO que vai para a IA.
-- contratos_clausulas_fixas  → cláusulas que entram em TODA minuta (ou só nos
--                              tipos marcados), com o texto exatamente como a
--                              entidade quer — a IA só as encaixa e numera.
--
-- Os tipos iniciais são semeados para cada tenant que ainda não tem nenhum.
-- Pré-requisito: supabase/contratos-minutas.sql. Idempotente.

-- ── Tipos ────────────────────────────────────────────────────────────────────

create table if not exists contratos_minuta_tipos (id uuid primary key default gen_random_uuid());
alter table contratos_minuta_tipos add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table contratos_minuta_tipos add column if not exists nome text not null default '';
alter table contratos_minuta_tipos add column if not exists descricao text;
alter table contratos_minuta_tipos add column if not exists orientacao text;
alter table contratos_minuta_tipos add column if not exists ativo boolean not null default true;
alter table contratos_minuta_tipos add column if not exists ordem integer not null default 0;
alter table contratos_minuta_tipos add column if not exists created_at timestamptz not null default now();
alter table contratos_minuta_tipos add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_contratos_minuta_tipos_emp
  on contratos_minuta_tipos (emp_proprietaria_id, ativo, ordem);

-- ── Cláusulas fixas ─────────────────────────────────────────────────────────

create table if not exists contratos_clausulas_fixas (id uuid primary key default gen_random_uuid());
alter table contratos_clausulas_fixas add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table contratos_clausulas_fixas add column if not exists titulo text not null default '';
alter table contratos_clausulas_fixas add column if not exists texto text not null default '';
alter table contratos_clausulas_fixas add column if not exists ativa boolean not null default true;
alter table contratos_clausulas_fixas add column if not exists ordem integer not null default 0;
-- Vazio = vale para todos os tipos; senão, só para os tipos listados.
alter table contratos_clausulas_fixas add column if not exists tipos uuid[] not null default '{}';
alter table contratos_clausulas_fixas add column if not exists created_at timestamptz not null default now();
alter table contratos_clausulas_fixas add column if not exists updated_at timestamptz not null default now();

create index if not exists idx_contratos_clausulas_fixas_emp
  on contratos_clausulas_fixas (emp_proprietaria_id, ativa, ordem);

-- A minuta passa a apontar para o tipo configurado (o nome fica em `tipo`).
alter table contratos_minutas add column if not exists tipo_id uuid references contratos_minuta_tipos(id) on delete set null;

-- ── RLS por tenant ───────────────────────────────────────────────────────────

alter table contratos_minuta_tipos enable row level security;
drop policy if exists tenant_isolation on contratos_minuta_tipos;
create policy tenant_isolation on contratos_minuta_tipos for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on contratos_minuta_tipos to authenticated;
drop trigger if exists set_emp_from_jwt on contratos_minuta_tipos;
create trigger set_emp_from_jwt before insert on contratos_minuta_tipos
  for each row execute function public.set_emp_from_jwt();

alter table contratos_clausulas_fixas enable row level security;
drop policy if exists tenant_isolation on contratos_clausulas_fixas;
create policy tenant_isolation on contratos_clausulas_fixas for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on contratos_clausulas_fixas to authenticated;
drop trigger if exists set_emp_from_jwt on contratos_clausulas_fixas;
create trigger set_emp_from_jwt before insert on contratos_clausulas_fixas
  for each row execute function public.set_emp_from_jwt();

-- ── Tipos iniciais (para cada tenant sem nenhum tipo) ───────────────────────

insert into contratos_minuta_tipos (emp_proprietaria_id, nome, descricao, orientacao, ordem)
select t.empresa_id, v.nome, v.descricao, v.orientacao, v.ordem
  from tenants t
 cross join (values
  (10, 'Prestação de serviços por prazo determinado',
   'Serviço contínuo com início e fim definidos (ex.: limpeza, assessoria, manutenção por 12 meses).',
   'Prazo determinado com data de início e término; valor mensal ou global; renovação só por aditivo; rescisão antecipada com aviso prévio e multa proporcional; ausência de vínculo empregatício; entrega e aceite dos serviços.'),
  (20, 'Prestação de serviços por prazo indeterminado',
   'Serviço contínuo sem data de término, encerrado por aviso prévio.',
   'Prazo indeterminado; denúncia por qualquer parte com aviso prévio escrito (a preencher, ex.: 30 dias); valor mensal com reajuste anual; ausência de vínculo empregatício.'),
  (30, 'Prestação de serviço pontual',
   'Serviço único ou por tarefa/evento (ex.: palestra, som de um evento, reforma).',
   'Escopo fechado e cronograma; preço global com eventual sinal e saldo na entrega; aceite formal da entrega; responsabilidade por danos durante a execução.'),
  (40, 'Fornecimento de produtos com valor fixo por prazo determinado',
   'Entregas periódicas de produtos a preço fixo durante um período (ex.: água, material de escritório por 12 meses).',
   'Prazo determinado; preço fixo (unitário ou mensal) sem reajuste durante a vigência salvo o que for informado; cronograma e local de entrega; conferência e recusa de produto fora da especificação; substituição sem custo.'),
  (50, 'Fornecimento sob demanda (preço unitário)',
   'Compras conforme a necessidade, pagando por unidade pedida, sem quantidade mínima.',
   'Sem obrigação de quantidade mínima; pedidos por escrito; tabela de preços unitários; prazo de entrega por pedido; faturamento por pedido entregue.'),
  (60, 'Compra e venda (entrega única)',
   'Aquisição de um bem ou lote com entrega única.',
   'Descrição do bem; preço e forma de pagamento; prazo e local de entrega; transferência de propriedade e riscos na entrega; garantia e assistência técnica.'),
  (70, 'Locação de imóvel',
   'Aluguel de imóvel (sede, sala, espaço).',
   'Seguir a lógica da Lei do Inquilinato; prazo; aluguel e reajuste; encargos (IPTU, condomínio, consumo); conservação, benfeitorias e vistoria de entrada e saída; garantia locatícia se informada.'),
  (80, 'Locação de bens ou equipamentos',
   'Aluguel de veículos, equipamentos, som, estrutura para evento.',
   'Descrição e estado dos bens; prazo; valor; entrega, montagem e retirada; responsabilidade por danos, perda e seguro; manutenção.'),
  (90, 'Comodato',
   'Empréstimo gratuito de bem, com devolução no prazo e no estado combinados.',
   'Gratuidade; descrição e estado do bem; prazo e devolução; uso exclusivo para a finalidade; conservação e responsabilidade por danos.'),
  (100, 'Patrocínio ou apoio',
   'A entidade patrocina ou recebe patrocínio/apoio, com contrapartidas.',
   'Valor ou bens do patrocínio; contrapartidas e uso de marca; prestação de contas; vedação a uso político-partidário ou que comprometa a autonomia da entidade.'),
  (110, 'Convênio ou parceria',
   'Cooperação com outra entidade, empresa ou órgão, com obrigações de cada lado.',
   'Objetivo comum; obrigações de cada partícipe; ausência de repasse ou forma de repasse; gestão e acompanhamento; vigência e denúncia.'),
  (120, 'Confidencialidade',
   'Acordo de sigilo sobre informações trocadas entre as partes.',
   'Definição de informação confidencial; exceções; prazo do sigilo após o fim da relação; devolução ou destruição; penalidade por violação.'),
  (130, 'Termo aditivo',
   'Altera um contrato existente (prazo, valor, objeto) sem refazê-lo.',
   'Identificar o contrato original (a preencher se não informado); cláusulas alteradas; ratificação das demais cláusulas.'),
  (140, 'Distrato',
   'Encerra um contrato antes do fim, com quitação e obrigações finais.',
   'Identificar o contrato encerrado; data de encerramento; pendências financeiras e devoluções; quitação recíproca.')
 ) as v(ordem, nome, descricao, orientacao)
 where not exists (
   select 1 from contratos_minuta_tipos x where x.emp_proprietaria_id = t.empresa_id
 );
