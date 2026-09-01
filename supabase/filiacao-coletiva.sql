-- Confluir — Filiação coletiva (2026-08-31)
--
-- Quando a assembleia aprova um ACT com CLÁUSULA DE FILIAÇÃO COLETIVA, todos os
-- aptos a votar daquela rodada passam a filiados. O processo:
--   1. a RODADA de assembleia registra que tem a cláusula e o prazo (dias) de
--      desistência (o "nascedouro" — toggle no cadastro da rodada);
--   2. em Representação cria-se o PROCESSO a partir de uma rodada com cláusula
--      ainda não vinculada a outro processo;
--   3. o motor CONCILIA os aptos com o cadastro (CPF → matrícula → e-mail →
--      nome, este último só como sugestão para o gestor confirmar);
--   4. ao aplicar: quem é Ativo permanece; quem não existe é criado; quem existe
--      com outra condição é re-carimbado — os dois últimos ficam "Em processo de
--      filiação coletiva" e ganham vínculo novo no histórico;
--   5. vencido o prazo, viram "Filiação aguarda fonte" e depois "Ativo";
--   6. dentro do prazo o trabalhador pode DESISTIR pela área do filiado — segue
--      a trilha normal de desfiliação (o empregador é avisado).
--
-- Idempotente; RLS inline por tenant (padrão da casa). Executar UMA VEZ.

-- 1. Cláusula na rodada de assembleia (nascedouro) ------------------------------
alter table voto_rod_assembleias
  add column if not exists clausula_filiacao_coletiva boolean not null default false;
alter table voto_rod_assembleias
  add column if not exists filiacao_coletiva_dias integer;

-- 2. Aptos podem vir SEM CPF (a empresa nem sempre envia) -----------------------
-- O CPF continua sendo a melhor chave, mas deixa de ser obrigatório: a
-- conciliação cai para matrícula/e-mail/nome, e o CPF é completado depois
-- (inclusive quando a pessoa aparece para votar).
alter table voto_assembleias_aptos alter column cpf drop not null;

-- 3. Processo de filiação coletiva (o lote) -------------------------------------
create table if not exists filiacao_coletiva (id uuid primary key default gen_random_uuid());
alter table filiacao_coletiva add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_coletiva add column if not exists rod_assembleia_id uuid references voto_rod_assembleias(id);
alter table filiacao_coletiva add column if not exists acordo_id uuid references acordo_coletivo(id) on delete set null;
alter table filiacao_coletiva add column if not exists titulo text;
alter table filiacao_coletiva add column if not exists observacoes text;
alter table filiacao_coletiva add column if not exists dias_desistencia integer;
-- rascunho (conciliação em revisão) | processado | revertido
alter table filiacao_coletiva add column if not exists situacao text not null default 'rascunho';
alter table filiacao_coletiva add column if not exists processado_em timestamptz;
alter table filiacao_coletiva add column if not exists prazo_ate date;
alter table filiacao_coletiva add column if not exists revertido_em timestamptz;
alter table filiacao_coletiva add column if not exists revertido_por uuid references usuarios(id);
alter table filiacao_coletiva add column if not exists criado_por uuid references usuarios(id);
alter table filiacao_coletiva add column if not exists created_at timestamptz not null default now();
alter table filiacao_coletiva add column if not exists updated_at timestamptz;
-- uma rodada só alimenta UM processo
create unique index if not exists ux_filiacao_coletiva_rodada
  on filiacao_coletiva (rod_assembleia_id);
create index if not exists idx_filiacao_coletiva_emp
  on filiacao_coletiva (emp_proprietaria_id);

-- 4. Itens do lote (um por apto) ------------------------------------------------
create table if not exists filiacao_coletiva_itens (id uuid primary key default gen_random_uuid());
alter table filiacao_coletiva_itens add column if not exists emp_proprietaria_id uuid references empresa(id);
alter table filiacao_coletiva_itens add column if not exists coletiva_id uuid references filiacao_coletiva(id) on delete cascade;
alter table filiacao_coletiva_itens add column if not exists apto_id uuid references voto_assembleias_aptos(id) on delete set null;
alter table filiacao_coletiva_itens add column if not exists filiacao_id uuid references filiacoes(id) on delete set null;
-- dados do apto, congelados no momento da conciliação
alter table filiacao_coletiva_itens add column if not exists cpf text;
alter table filiacao_coletiva_itens add column if not exists nome_completo text;
alter table filiacao_coletiva_itens add column if not exists matricula text;
alter table filiacao_coletiva_itens add column if not exists email text;
-- como casou: cpf | matricula | email | nome | manual | nenhum
alter table filiacao_coletiva_itens add column if not exists chave_casamento text;
-- resultado: mantido_ativo | criado | recarimbado | duvida | ignorado | desistiu
alter table filiacao_coletiva_itens add column if not exists resultado text;
-- condição ANTES do lote (para o histórico e para auditoria da reversão)
alter table filiacao_coletiva_itens add column if not exists condicao_anterior text;
alter table filiacao_coletiva_itens add column if not exists vinculo_id uuid references filiacao_vinculos(id) on delete set null;
alter table filiacao_coletiva_itens add column if not exists observacao text;
alter table filiacao_coletiva_itens add column if not exists desistencia_em timestamptz;
alter table filiacao_coletiva_itens add column if not exists ativado_em timestamptz;
alter table filiacao_coletiva_itens add column if not exists created_at timestamptz not null default now();
alter table filiacao_coletiva_itens add column if not exists updated_at timestamptz;
create index if not exists idx_filiacao_coletiva_itens_lote
  on filiacao_coletiva_itens (coletiva_id);
create index if not exists idx_filiacao_coletiva_itens_filiacao
  on filiacao_coletiva_itens (filiacao_id);

-- 5. Marca na filiação: veio de filiação coletiva -------------------------------
-- Permite ao portal saber se o filiado pode desistir online (e a qual lote
-- pertence) sem varrer os itens.
alter table filiacoes
  add column if not exists filiacao_coletiva_id uuid references filiacao_coletiva(id) on delete set null;
alter table filiacoes
  add column if not exists filiacao_coletiva_prazo date;
create index if not exists idx_filiacoes_coletiva
  on filiacoes (filiacao_coletiva_id);

-- 6. Data de entrada na condição "Em processo de filiação coletiva" -------------
-- Espelha o padrão DATA_AO_ENTRAR das demais condições (motor de etapas).
alter table filiacoes
  add column if not exists filiacao_coletiva_em date;

-- 7. RLS por tenant (inline — padrão noticias.sql) ------------------------------
alter table filiacao_coletiva enable row level security;
drop policy if exists tenant_isolation on filiacao_coletiva;
create policy tenant_isolation on filiacao_coletiva for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on filiacao_coletiva to authenticated;
drop trigger if exists set_emp_from_jwt on filiacao_coletiva;
create trigger set_emp_from_jwt before insert on filiacao_coletiva
  for each row execute function public.set_emp_from_jwt();

alter table filiacao_coletiva_itens enable row level security;
drop policy if exists tenant_isolation on filiacao_coletiva_itens;
create policy tenant_isolation on filiacao_coletiva_itens for all to authenticated
  using (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid)
  with check (emp_proprietaria_id = (auth.jwt() ->> 'tenant_id')::uuid);
grant select, insert, update, delete on filiacao_coletiva_itens to authenticated;
drop trigger if exists set_emp_from_jwt on filiacao_coletiva_itens;
create trigger set_emp_from_jwt before insert on filiacao_coletiva_itens
  for each row execute function public.set_emp_from_jwt();
