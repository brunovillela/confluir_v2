-- Confluir — Pessoal: plano de saúde dos funcionários (Fase 1, 24/11/2026)
--
-- POR QUÊ: o plano de saúde é um benefício com reajuste anual da tabela e por
-- mudança de faixa etária, custeio repartido entre a entidade e o funcionário
-- e regras para dependentes. Hoje a conferência mensal é feita à mão. A
-- entidade quer registrar o contrato, as tabelas por faixa com vigência, as
-- regras de custeio (de qualquer variação: tipo de beneficiário, condição do
-- titular, produto, cargo, departamento, pessoa, idade) e de dependentes, quem
-- está no plano e, quando houver, a coparticipação — e o sistema calcula o mês.
--
-- COMO (src/lib/plano-saude.ts calcula; src/lib/db/plano-saude.ts lê e grava):
--   pessoal_saude_contratos ........ o contrato com a operadora (vários, se houver)
--   pessoal_saude_produtos ......... os produtos do contrato (Básico, Executivo…)
--   pessoal_saude_tabelas .......... preço de cada uma das 10 faixas da ANS
--                                    (RN 63/2003) por produto, com vigência:
--                                    cada reajuste é uma tabela nova
--   pessoal_saude_regras_custeio ... quanto a entidade paga (percentual da
--                                    mensalidade ou valor fixo, com teto), com
--                                    filtros e prioridade; a primeira que casa vale
--   pessoal_saude_regras_dependentes graus aceitos e idade-limite por contrato
--   pessoal_saude_beneficiarios .... adesões: titular (ativo, demitido ou
--                                    aposentado que manteve o plano — arts. 30 e
--                                    31 da Lei 9.656), dependente (de
--                                    pessoal_dependentes) ou agregado
--   pessoal_saude_coparticipacoes .. só o VALOR do mês por titular, nunca o
--                                    procedimento (seria dado de saúde)
-- RLS tenant_isolation, set_emp_from_jwt e auditoria em todas. A antiga
-- pessoal_plano_saude (espelho vazio do Bubble, sem uso) sai se estiver vazia.
-- Idempotente.

-- ── Contratos ───────────────────────────────────────────────────────────────

create table if not exists public.pessoal_saude_contratos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  nome text not null,
  operadora text not null,
  registro_ans_operadora text,
  contrato_id uuid references public.contratos(id) on delete set null,
  tipo_contratacao text not null default 'coletivo_empresarial',
  mes_aniversario smallint,
  faixa_muda text not null default 'mes_seguinte',
  coparticipacao boolean not null default false,
  inicio date,
  fim date,
  observacoes text,
  ativo boolean not null default true,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_saude_contratos_tipo_check
    check (tipo_contratacao in ('coletivo_empresarial', 'coletivo_adesao', 'individual')),
  constraint pessoal_saude_contratos_mes_check check (mes_aniversario is null or mes_aniversario between 1 and 12),
  constraint pessoal_saude_contratos_faixa_check check (faixa_muda in ('mes_seguinte', 'mes_aniversario')),
  constraint pessoal_saude_contratos_datas_check check (fim is null or inicio is null or fim >= inicio)
);

-- ── Produtos ────────────────────────────────────────────────────────────────

create table if not exists public.pessoal_saude_produtos (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  contrato_id uuid not null references public.pessoal_saude_contratos(id) on delete cascade,
  nome text not null,
  registro_ans text,
  acomodacao text,
  abrangencia text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_saude_produtos_acomodacao_check check (acomodacao is null or acomodacao in ('enfermaria', 'apartamento'))
);
create index if not exists pessoal_saude_produtos_contrato_idx on public.pessoal_saude_produtos (contrato_id);

-- ── Tabelas de preço por faixa etária ───────────────────────────────────────

create table if not exists public.pessoal_saude_tabelas (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  produto_id uuid not null references public.pessoal_saude_produtos(id) on delete cascade,
  vigencia_inicio date not null,
  vigencia_fim date,
  motivo text not null default 'inicial',
  percentual numeric(7,4),
  precos numeric(12,2)[] not null,
  observacao text,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_saude_tabelas_motivo_check
    check (motivo in ('inicial', 'reajuste_anual', 'reajuste_ans', 'renegociacao', 'correcao')),
  constraint pessoal_saude_tabelas_precos_check check (array_length(precos, 1) = 10),
  constraint pessoal_saude_tabelas_datas_check check (vigencia_fim is null or vigencia_fim >= vigencia_inicio),
  constraint pessoal_saude_tabelas_unica unique (produto_id, vigencia_inicio)
);

-- ── Regras de custeio ───────────────────────────────────────────────────────

create table if not exists public.pessoal_saude_regras_custeio (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  contrato_id uuid not null references public.pessoal_saude_contratos(id) on delete cascade,
  nome text not null,
  prioridade integer not null default 100,
  vigencia_inicio date,
  vigencia_fim date,
  beneficiarios text[],
  condicoes text[],
  produtos uuid[],
  cargos text[],
  departamentos text[],
  funcionarios uuid[],
  idade_min smallint,
  idade_max smallint,
  modo text not null default 'percentual',
  entidade_percentual numeric(5,2),
  entidade_valor numeric(12,2),
  entidade_teto numeric(12,2),
  copart_funcionario_percentual numeric(5,2),
  copart_limite_mensal numeric(12,2),
  clausula text,
  ativo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_saude_regras_custeio_modo_check check (modo in ('percentual', 'valor_fixo')),
  constraint pessoal_saude_regras_custeio_pct_check
    check (entidade_percentual is null or entidade_percentual between 0 and 100),
  constraint pessoal_saude_regras_custeio_copart_check
    check (copart_funcionario_percentual is null or copart_funcionario_percentual between 0 and 100),
  constraint pessoal_saude_regras_custeio_valor_check
    check ((modo = 'percentual' and entidade_percentual is not null) or (modo = 'valor_fixo' and entidade_valor is not null)),
  constraint pessoal_saude_regras_custeio_datas_check
    check (vigencia_fim is null or vigencia_inicio is null or vigencia_fim >= vigencia_inicio)
);
create index if not exists pessoal_saude_regras_custeio_contrato_idx on public.pessoal_saude_regras_custeio (contrato_id);

-- ── Regras de dependentes ───────────────────────────────────────────────────

create table if not exists public.pessoal_saude_regras_dependentes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  contrato_id uuid not null references public.pessoal_saude_contratos(id) on delete cascade,
  grau text not null,
  permitido boolean not null default true,
  idade_limite smallint,
  idade_limite_estudante smallint,
  observacao text,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_saude_regras_dependentes_unica unique (contrato_id, grau)
);

-- ── Beneficiários (adesões) ─────────────────────────────────────────────────

create table if not exists public.pessoal_saude_beneficiarios (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  produto_id uuid not null references public.pessoal_saude_produtos(id),
  titular_id uuid not null references public.usuarios(id),
  tipo text not null,
  dependente_id uuid references public.pessoal_dependentes(id) on delete set null,
  grau text,
  nome text,
  nascimento date,
  cpf text,
  condicao text not null default 'ativo',
  carteirinha text,
  inclusao date not null,
  exclusao date,
  motivo_exclusao text,
  estudante_ate date,
  observacao text,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_saude_beneficiarios_tipo_check check (tipo in ('titular', 'dependente', 'agregado')),
  constraint pessoal_saude_beneficiarios_condicao_check check (condicao in ('ativo', 'demitido', 'aposentado')),
  constraint pessoal_saude_beneficiarios_agregado_check
    check (tipo <> 'agregado' or (nome is not null and nascimento is not null)),
  constraint pessoal_saude_beneficiarios_datas_check check (exclusao is null or exclusao >= inclusao)
);
create index if not exists pessoal_saude_beneficiarios_titular_idx on public.pessoal_saude_beneficiarios (titular_id);
create index if not exists pessoal_saude_beneficiarios_produto_idx on public.pessoal_saude_beneficiarios (produto_id);

-- ── Coparticipação (só o valor) ─────────────────────────────────────────────

create table if not exists public.pessoal_saude_coparticipacoes (
  id uuid primary key default gen_random_uuid(),
  emp_proprietaria_id uuid not null references public.empresa(id),
  contrato_id uuid not null references public.pessoal_saude_contratos(id) on delete cascade,
  titular_id uuid not null references public.usuarios(id),
  competencia text not null,
  valor numeric(12,2) not null,
  criado_por uuid references public.usuarios(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint pessoal_saude_coparticipacoes_competencia_check check (competencia ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  constraint pessoal_saude_coparticipacoes_valor_check check (valor >= 0),
  constraint pessoal_saude_coparticipacoes_unica unique (contrato_id, titular_id, competencia)
);

-- ── RLS, tenant, auditoria e permissões (todas as tabelas) ──────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'pessoal_saude_contratos', 'pessoal_saude_produtos', 'pessoal_saude_tabelas',
    'pessoal_saude_regras_custeio', 'pessoal_saude_regras_dependentes',
    'pessoal_saude_beneficiarios', 'pessoal_saude_coparticipacoes'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    execute format(
      'create policy tenant_isolation on public.%I to authenticated
         using (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)
         with check (emp_proprietaria_id = ((auth.jwt() ->> ''tenant_id''))::uuid)', t);
    execute format('drop trigger if exists set_emp_from_jwt on public.%I', t);
    execute format('create trigger set_emp_from_jwt before insert on public.%I for each row execute function public.set_emp_from_jwt()', t);
    execute format('drop trigger if exists auditoria_registrar on public.%I', t);
    execute format('create trigger auditoria_registrar after insert or update or delete on public.%I for each row execute function public.registrar_auditoria()', t);
    execute format('revoke all on table public.%I from public, anon', t);
    execute format('grant select, insert, update, delete on table public.%I to authenticated', t);
    execute format('grant all on table public.%I to service_role', t);
  end loop;
end $$;

-- ── A tabela antiga (espelho vazio do Bubble) sai, se estiver vazia ─────────

do $$
begin
  if to_regclass('public.pessoal_plano_saude') is not null
     and not exists (select 1 from public.pessoal_plano_saude) then
    drop table public.pessoal_plano_saude;
  end if;
end $$;

-- ── Comentários (dicionário e LGPD) ─────────────────────────────────────────

comment on table public.pessoal_saude_contratos is 'Contrato de plano de saúde dos funcionários com uma operadora: tipo de contratação, mês de aniversário (reajuste anual), quando muda a faixa etária e se há coparticipação (src/lib/db/plano-saude.ts). [lgpd:identificacao|titulares:usuários do sistema]';
comment on column public.pessoal_saude_contratos.nome is 'Nome do contrato na entidade (ex.: "Unimed — empresarial").';
comment on column public.pessoal_saude_contratos.operadora is 'Nome da operadora.';
comment on column public.pessoal_saude_contratos.registro_ans_operadora is 'Registro da operadora na ANS.';
comment on column public.pessoal_saude_contratos.contrato_id is 'O contrato em Contratos (fornecedor, vigência, arquivo), quando cadastrado lá.';
comment on column public.pessoal_saude_contratos.tipo_contratacao is 'coletivo_empresarial, coletivo_adesao ou individual.';
comment on column public.pessoal_saude_contratos.mes_aniversario is 'Mês do reajuste anual da tabela (1–12).';
comment on column public.pessoal_saude_contratos.faixa_muda is 'Quando o preço da nova faixa etária vale: mes_seguinte (ao do aniversário) ou mes_aniversario.';
comment on column public.pessoal_saude_contratos.coparticipacao is 'O contrato cobra coparticipação.';
comment on column public.pessoal_saude_contratos.inicio is 'Início do contrato.';
comment on column public.pessoal_saude_contratos.fim is 'Fim do contrato (vazio: em vigor).';
comment on column public.pessoal_saude_contratos.observacoes is 'Observações livres.';
comment on column public.pessoal_saude_contratos.ativo is 'Contrato em uso.';
comment on column public.pessoal_saude_contratos.criado_por is 'Quem cadastrou. [lgpd:identificacao]';

comment on table public.pessoal_saude_produtos is 'Produto (plano) de um contrato de plano de saúde: nome, registro na ANS, acomodação e abrangência.';
comment on column public.pessoal_saude_produtos.contrato_id is 'Contrato de plano de saúde.';
comment on column public.pessoal_saude_produtos.nome is 'Nome do produto (ex.: Básico, Executivo).';
comment on column public.pessoal_saude_produtos.registro_ans is 'Número de registro do produto na ANS.';
comment on column public.pessoal_saude_produtos.acomodacao is 'enfermaria ou apartamento.';
comment on column public.pessoal_saude_produtos.abrangencia is 'Abrangência geográfica (texto livre).';
comment on column public.pessoal_saude_produtos.ativo is 'Produto em uso.';

comment on table public.pessoal_saude_tabelas is 'Tabela de preço de um produto de plano de saúde nas 10 faixas etárias da ANS (RN 63/2003), com vigência; cada reajuste é uma tabela nova.';
comment on column public.pessoal_saude_tabelas.produto_id is 'Produto.';
comment on column public.pessoal_saude_tabelas.vigencia_inicio is 'Início da vigência.';
comment on column public.pessoal_saude_tabelas.vigencia_fim is 'Fim da vigência (vazio: até a próxima tabela).';
comment on column public.pessoal_saude_tabelas.motivo is 'inicial, reajuste_anual, reajuste_ans, renegociacao ou correcao.';
comment on column public.pessoal_saude_tabelas.percentual is 'Percentual do reajuste sobre a tabela anterior, quando houver.';
comment on column public.pessoal_saude_tabelas.precos is 'Mensalidade das 10 faixas, na ordem: 0–18, 19–23, 24–28, 29–33, 34–38, 39–43, 44–48, 49–53, 54–58, 59+.';
comment on column public.pessoal_saude_tabelas.observacao is 'Observação livre.';
comment on column public.pessoal_saude_tabelas.criado_por is 'Quem registrou. [lgpd:identificacao]';

comment on table public.pessoal_saude_regras_custeio is 'Regra de custeio do plano de saúde: quanto a entidade paga (percentual da mensalidade ou valor fixo, com teto) e a parte do funcionário na coparticipação, com filtros opcionais; vale a de menor prioridade que casa. [lgpd:identificacao|titulares:funcionários]';
comment on column public.pessoal_saude_regras_custeio.contrato_id is 'Contrato de plano de saúde.';
comment on column public.pessoal_saude_regras_custeio.nome is 'Nome da regra (ex.: "Titular 100%").';
comment on column public.pessoal_saude_regras_custeio.prioridade is 'Ordem de avaliação: menor primeiro; a primeira regra que casa vale.';
comment on column public.pessoal_saude_regras_custeio.vigencia_inicio is 'Início da vigência (vazio: sempre).';
comment on column public.pessoal_saude_regras_custeio.vigencia_fim is 'Fim da vigência (vazio: sem fim).';
comment on column public.pessoal_saude_regras_custeio.beneficiarios is 'Filtro: titular e/ou graus de dependente (vazio: todos).';
comment on column public.pessoal_saude_regras_custeio.condicoes is 'Filtro: condição do titular — ativo, demitido, aposentado (vazio: todas).';
comment on column public.pessoal_saude_regras_custeio.produtos is 'Filtro: produtos (vazio: todos).';
comment on column public.pessoal_saude_regras_custeio.cargos is 'Filtro: cargos do titular (vazio: todos).';
comment on column public.pessoal_saude_regras_custeio.departamentos is 'Filtro: departamentos do titular (vazio: todos).';
comment on column public.pessoal_saude_regras_custeio.funcionarios is 'Filtro: titulares específicos (vazio: todos). [lgpd:identificacao]';
comment on column public.pessoal_saude_regras_custeio.idade_min is 'Filtro: idade mínima do beneficiário.';
comment on column public.pessoal_saude_regras_custeio.idade_max is 'Filtro: idade máxima do beneficiário.';
comment on column public.pessoal_saude_regras_custeio.modo is 'percentual (da mensalidade) ou valor_fixo.';
comment on column public.pessoal_saude_regras_custeio.entidade_percentual is 'Percentual da mensalidade pago pela entidade (modo percentual).';
comment on column public.pessoal_saude_regras_custeio.entidade_valor is 'Valor pago pela entidade (modo valor_fixo), limitado à mensalidade.';
comment on column public.pessoal_saude_regras_custeio.entidade_teto is 'Teto do que a entidade paga por beneficiário (opcional).';
comment on column public.pessoal_saude_regras_custeio.copart_funcionario_percentual is 'Percentual da coparticipação descontado do funcionário (vazio: 100%).';
comment on column public.pessoal_saude_regras_custeio.copart_limite_mensal is 'Limite mensal do desconto de coparticipação (opcional).';
comment on column public.pessoal_saude_regras_custeio.clausula is 'Cláusula do acordo coletivo ou norma interna que sustenta a regra.';
comment on column public.pessoal_saude_regras_custeio.ativo is 'Regra em uso.';

comment on table public.pessoal_saude_regras_dependentes is 'Graus de dependente aceitos num contrato de plano de saúde e a idade-limite (e a de estudante).';
comment on column public.pessoal_saude_regras_dependentes.contrato_id is 'Contrato de plano de saúde.';
comment on column public.pessoal_saude_regras_dependentes.grau is 'Grau de parentesco (como em pessoal_dependentes) ou Agregado.';
comment on column public.pessoal_saude_regras_dependentes.permitido is 'O grau pode entrar no plano.';
comment on column public.pessoal_saude_regras_dependentes.idade_limite is 'Idade em que perde o direito (vazio: sem limite).';
comment on column public.pessoal_saude_regras_dependentes.idade_limite_estudante is 'Idade-limite para quem comprova ser estudante (vazio: igual à geral).';
comment on column public.pessoal_saude_regras_dependentes.observacao is 'Observação livre.';

comment on table public.pessoal_saude_beneficiarios is 'Adesão ao plano de saúde: o titular (funcionário ativo, ou demitido ou aposentado que manteve o plano), um dependente dele ou um agregado, com o produto, a carteirinha e as datas de inclusão e exclusão. [lgpd:identificacao,trabalhista|titulares:funcionários, dependentes (inclusive menores), ex-funcionários]';
comment on column public.pessoal_saude_beneficiarios.produto_id is 'Produto do plano.';
comment on column public.pessoal_saude_beneficiarios.titular_id is 'Funcionário titular. [lgpd:identificacao]';
comment on column public.pessoal_saude_beneficiarios.tipo is 'titular, dependente ou agregado.';
comment on column public.pessoal_saude_beneficiarios.dependente_id is 'Dependente em pessoal_dependentes (tipo dependente). [lgpd:identificacao]';
comment on column public.pessoal_saude_beneficiarios.grau is 'Grau do agregado (no dependente, vale o de pessoal_dependentes).';
comment on column public.pessoal_saude_beneficiarios.nome is 'Nome do agregado. [lgpd:identificacao]';
comment on column public.pessoal_saude_beneficiarios.nascimento is 'Nascimento do agregado (define a faixa etária). [lgpd:identificacao]';
comment on column public.pessoal_saude_beneficiarios.cpf is 'CPF do agregado. [lgpd:identificacao]';
comment on column public.pessoal_saude_beneficiarios.condicao is 'Condição do titular: ativo, demitido (art. 30 da Lei 9.656) ou aposentado (art. 31). [lgpd:trabalhista]';
comment on column public.pessoal_saude_beneficiarios.carteirinha is 'Número da carteirinha na operadora. [lgpd:identificacao]';
comment on column public.pessoal_saude_beneficiarios.inclusao is 'Data de inclusão no plano.';
comment on column public.pessoal_saude_beneficiarios.exclusao is 'Data de exclusão do plano (vazio: ativo).';
comment on column public.pessoal_saude_beneficiarios.motivo_exclusao is 'Motivo da exclusão. [lgpd:trabalhista]';
comment on column public.pessoal_saude_beneficiarios.estudante_ate is 'Comprovante de estudante válido até esta data (vale a idade-limite de estudante). [lgpd:identificacao]';
comment on column public.pessoal_saude_beneficiarios.observacao is 'Observação livre.';
comment on column public.pessoal_saude_beneficiarios.criado_por is 'Quem registrou. [lgpd:identificacao]';

comment on table public.pessoal_saude_coparticipacoes is 'Valor da coparticipação do plano de saúde cobrado no mês por titular; só o total, nunca o procedimento. [lgpd:financeiro,sensivel_saude|titulares:funcionários]';
comment on column public.pessoal_saude_coparticipacoes.contrato_id is 'Contrato de plano de saúde.';
comment on column public.pessoal_saude_coparticipacoes.titular_id is 'Funcionário titular. [lgpd:identificacao]';
comment on column public.pessoal_saude_coparticipacoes.competencia is 'Mês (AAAA-MM).';
comment on column public.pessoal_saude_coparticipacoes.valor is 'Total da coparticipação do titular e dependentes no mês (revela uso do plano). [lgpd:financeiro,sensivel_saude]';
comment on column public.pessoal_saude_coparticipacoes.criado_por is 'Quem lançou. [lgpd:identificacao]';
