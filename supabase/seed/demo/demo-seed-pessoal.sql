-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Pessoal) — 2026-08-01
--
-- OBJETIVO: criar uma organização de demonstração, isolada por
-- `emp_proprietaria_id`, povoada com dados 100% FICTÍCIOS, para capturar as
-- telas do manual (/painel/ajuda) sem expor nenhum dado real. Nada aqui toca
-- no tenant real (Sindipetro-NF, id c763cb99-…).
--
-- IMPORTANTE — EXECUÇÃO NO SQL EDITOR DO SUPABASE:
-- Este script NÃO usa `begin/commit` nem tabelas temporárias/auxiliares de
-- propósito. O SQL Editor executa os comandos de um jeito em que objetos não
-- comitados (uma transação aberta ou uma tabela recém-criada) podem não ficar
-- visíveis para o comando seguinte. Por isso cada INSERT é autossuficiente:
-- os dados das pessoas vêm de um CTE `values` inline, e contracheques/ponto
-- derivam da tabela `vinculos_trabalhistas` já gravada nos passos anteriores.
--
-- IDEMPOTENTE: começa apagando TODOS os dados da empresa demo e reinsere.
-- Pode rodar quantas vezes quiser (limpa qualquer resquício de execução falha).
--
-- Como as tabelas centrais foram migradas do Bubble (sem DDL no repo), os
-- INSERTs espelham EXATAMENTE as colunas que o app já grava em produção
-- (portanto satisfazem os NOT NULL). Se algum comando falhar por coluna
-- obrigatória inesperada, me mande a mensagem — ajusto na hora.
--
-- PRÉ-REQUISITO PARA O LOGIN: antes (ou depois) de rodar, crie no Supabase
-- Auth (Authentication → Add user) um usuário  demo@confluir.local  com senha.
-- O script liga esse login à conta operadora pelo e-mail; se criar o usuário
-- depois, rode o script de novo (o vínculo é refeito a cada execução).
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   operador (login) .. 22222222-2222-4222-8222-222222222222
--   funcionários ...... 33333333-3333-4333-8333-0000000000NN
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 0) LIMPEZA da demo (filhos antes dos pais). Escopo: só a empresa demo.
-- ---------------------------------------------------------------------------
delete from pessoal_contracheques
  where remessa_id in (select id from pessoal_contracheques_remessas
    where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from pessoal_contracheques_remessas
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';

delete from pessoal_registro_ponto
  where remessa_id in (select id from pessoal_registro_ponto_remessas
    where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from pessoal_registro_ponto_remessas
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';

delete from pessoal_ferias_gozo
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from pessoal_ferias
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';

delete from permissoes
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from vinculos_trabalhistas
  where empregador_id = '11111111-1111-4111-8111-111111111111';
delete from usuarios
  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from tenants
  where empresa_id = '11111111-1111-4111-8111-111111111111';
delete from empresa
  where id = '11111111-1111-4111-8111-111111111111';

-- ---------------------------------------------------------------------------
-- 1) Empresa (o tenant) + registro de plataforma
--    emp_proprietaria_id = null → a empresa é dona do próprio tenant.
-- ---------------------------------------------------------------------------
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values (
  '11111111-1111-4111-8111-111111111111',
  'Sindicato Demonstração (dados fictícios)',
  'Confluir Demo',
  '00.000.000/0001-91',
  null
);

insert into tenants (empresa_id, slug, status)
values ('11111111-1111-4111-8111-111111111111', 'demo', 'trial');

-- ---------------------------------------------------------------------------
-- 2) Conta operadora da demo (é com ela que você faz login para os prints)
--    Ligada ao usuário demo@confluir.local do Supabase Auth pelo e-mail.
-- ---------------------------------------------------------------------------
insert into usuarios (
  id, emp_proprietaria_id, nome_completo, nome_guerra, email, inativo, deletado
) values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111',
  'Operador de Demonstração', 'Demo', 'demo@confluir.local', false, false
);

update usuarios
  set auth_user_id = (
    select id from auth.users where lower(email) = lower('demo@confluir.local') limit 1
  )
  where id = '22222222-2222-4222-8222-222222222222';

-- Permissões: linha mínima + ligar TODAS as colunas boolean via bloco dinâmico
-- (imune a divergência de nomes de permissão).
insert into permissoes (usuario_id, emp_proprietaria_id, alcada_aprovacao)
values (
  '22222222-2222-4222-8222-222222222222',
  '11111111-1111-4111-8111-111111111111', 1000000
);

do $$
declare col text;
begin
  for col in
    select column_name from information_schema.columns
    where table_schema = 'public' and table_name = 'permissoes'
      and data_type = 'boolean'
  loop
    execute format(
      'update permissoes set %I = true where usuario_id = %L',
      col, '22222222-2222-4222-8222-222222222222'
    );
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 3) Funcionários fictícios — usuarios (conta) e vinculos_trabalhistas (o
--    "funcionário": empregador_id = tenant). O CTE `values` inline evita
--    depender de objeto compartilhado entre comandos.
-- ---------------------------------------------------------------------------
with pessoas(id, nome, guerra, email, matricula) as (
  values
    ('33333333-3333-4333-8333-000000000001'::uuid,'Ana Beatriz Nogueira','Ana','ana.demo@confluir.local','0101'),
    ('33333333-3333-4333-8333-000000000002'::uuid,'Carlos Eduardo Simões','Cadu','carlos.demo@confluir.local','0102'),
    ('33333333-3333-4333-8333-000000000003'::uuid,'Débora Cristina Alves','Débora','debora.demo@confluir.local','0103'),
    ('33333333-3333-4333-8333-000000000004'::uuid,'Eduardo Prado Martins','Edu','eduardo.demo@confluir.local','0104'),
    ('33333333-3333-4333-8333-000000000005'::uuid,'Fernanda Lima Rocha','Fê','fernanda.demo@confluir.local','0105'),
    ('33333333-3333-4333-8333-000000000006'::uuid,'Gustavo Henrique Dias','Gustavo','gustavo.demo@confluir.local','0106'),
    ('33333333-3333-4333-8333-000000000007'::uuid,'Helena Barros Teixeira','Helena','helena.demo@confluir.local','0107'),
    ('33333333-3333-4333-8333-000000000008'::uuid,'Igor Marques Fontes','Igor','igor.demo@confluir.local','0108'),
    ('33333333-3333-4333-8333-000000000009'::uuid,'Juliana Aparecida Costa','Juliana','juliana.demo@confluir.local','0109'),
    ('33333333-3333-4333-8333-000000000010'::uuid,'Marcos Vinícius Pereira','Marcão','marcos.demo@confluir.local','0110')
)
insert into usuarios (
  id, emp_proprietaria_id, nome_completo, nome_guerra, email, empresa_matricula,
  inativo, deletado
)
select id, '11111111-1111-4111-8111-111111111111', nome, guerra, email, matricula,
  false, false
from pessoas;

with pessoas(id, cargo, lotacao, matricula, admissao, demissao) as (
  values
    ('33333333-3333-4333-8333-000000000001'::uuid,'Assistente Administrativo','Secretaria','0101', date '2018-03-12', null::date),
    ('33333333-3333-4333-8333-000000000002'::uuid,'Analista Financeiro','Financeiro','0102', date '2016-08-01', null::date),
    ('33333333-3333-4333-8333-000000000003'::uuid,'Advogada','Jurídico','0103', date '2020-02-17', null::date),
    ('33333333-3333-4333-8333-000000000004'::uuid,'Motorista','Frota','0104', date '2015-05-20', null::date),
    ('33333333-3333-4333-8333-000000000005'::uuid,'Recepcionista','Atendimento','0105', date '2021-09-06', null::date),
    ('33333333-3333-4333-8333-000000000006'::uuid,'Técnico de Segurança do Trabalho','Saúde','0106', date '2019-11-11', null::date),
    ('33333333-3333-4333-8333-000000000007'::uuid,'Assistente Social','Social','0107', date '2017-07-03', null::date),
    ('33333333-3333-4333-8333-000000000008'::uuid,'Auxiliar de Serviços Gerais','Manutenção','0108', date '2022-01-24', null::date),
    ('33333333-3333-4333-8333-000000000009'::uuid,'Coordenadora de Comunicação','Comunicação','0109', date '2014-04-15', null::date),
    ('33333333-3333-4333-8333-000000000010'::uuid,'Contador','Financeiro','0110', date '2013-10-02', date '2025-06-30')
)
-- emp_proprietaria_id É OBRIGATÓRIO aqui: o RLS de leitura isola por essa
-- coluna. Se não for informado, um default/trigger a preenche com o tenant
-- REAL e os vínculos somem da demo (o app filtra por empregador_id, mas o RLS
-- filtra por emp_proprietaria_id).
insert into vinculos_trabalhistas (
  trabalhador_id, empregador_id, emp_proprietaria_id, cargo, lotacao, matricula,
  regime_trabalho, contrato_admissao, contrato_demissao
)
select id, '11111111-1111-4111-8111-111111111111',
  '11111111-1111-4111-8111-111111111111', cargo, lotacao, matricula, 'CLT',
  admissao, demissao
from pessoas;

-- ---------------------------------------------------------------------------
-- 4) Contracheques — 1 remessa mensal ABERTA + 1 FINALIZADA. Itens derivados
--    dos funcionários ATIVOS (vinculos sem demissão).
-- ---------------------------------------------------------------------------
insert into pessoal_contracheques_remessas (
  id, emp_proprietaria_id, nome_remessa, ordem,
  finalizada, decimo_terceiro, ferias, adiantamento, complementar_mensal, created_at
) values
  ('44444444-4444-4444-8444-000000000001','11111111-1111-4111-8111-111111111111',
   'Folha — Março/2026', 3, false, false, false, false, false, now()),
  ('44444444-4444-4444-8444-000000000002','11111111-1111-4111-8111-111111111111',
   'Folha — Fevereiro/2026', 2, true, false, false, false, false, now() - interval '30 days');

-- Remessa aberta: metade liberada, metade bloqueada (mostra as duas situações).
insert into pessoal_contracheques (funcionario_id, remessa_id, arquivo, liberado, ordem)
select v.trabalhador_id, '44444444-4444-4444-8444-000000000001', null,
  (row_number() over (order by v.matricula)) % 2 = 0,
  row_number() over (order by v.matricula)
from vinculos_trabalhistas v
where v.empregador_id = '11111111-1111-4111-8111-111111111111'
  and v.contrato_demissao is null;

-- Remessa finalizada: tudo liberado.
insert into pessoal_contracheques (funcionario_id, remessa_id, arquivo, liberado, ordem)
select v.trabalhador_id, '44444444-4444-4444-8444-000000000002', null, true,
  row_number() over (order by v.matricula)
from vinculos_trabalhistas v
where v.empregador_id = '11111111-1111-4111-8111-111111111111'
  and v.contrato_demissao is null;

-- ---------------------------------------------------------------------------
-- 5) Ponto — 1 remessa aberta com horas 70%/100% de exemplo
-- ---------------------------------------------------------------------------
insert into pessoal_registro_ponto_remessas (
  id, emp_proprietaria_id, nome_remessa, ordem,
  mes_referencia_os, ano_referencia_os, finalizada, created_at
) values (
  '55555555-5555-4555-8555-000000000001','11111111-1111-4111-8111-111111111111',
  'Ponto — Março/2026', 3, 'Março', '2026', false, now()
);

insert into pessoal_registro_ponto (
  funcionario_id, remessa_id, arquivo, liberado, ordem,
  horas_realizadas_70, horas_pagas_70, horas_realizadas_100, horas_pagas_100
)
select v.trabalhador_id, '55555555-5555-4555-8555-000000000001', null,
  (row_number() over (order by v.matricula)) % 2 = 0,
  row_number() over (order by v.matricula),
  8, 8, 2, 2
from vinculos_trabalhistas v
where v.empregador_id = '11111111-1111-4111-8111-111111111111'
  and v.contrato_demissao is null;

-- ---------------------------------------------------------------------------
-- 6) Férias — períodos + gozos
--    Período 1: concessivo vencendo em ~60 dias (aciona o alerta de 120 dias)
--    e um gozo AGUARDANDO autorização (aciona o alerta de gozos pendentes).
-- ---------------------------------------------------------------------------
insert into pessoal_ferias (
  id, trabalhador_id, aquisitivo_inicio, aquisitivo_termino,
  concessivo_inicio, concessivo_termino, dias_disponiveis, abono_pecuniario,
  finalizado, emp_proprietaria_id, empregador_id
) values
  ('66666666-6666-4666-8666-000000000001','33333333-3333-4333-8333-000000000001',
   date '2024-03-01', date '2025-02-28', date '2025-03-01', (now() + interval '60 days')::date,
   30, false, false,
   '11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111'),
  ('66666666-6666-4666-8666-000000000002','33333333-3333-4333-8333-000000000002',
   date '2025-08-01', date '2026-07-31', date '2026-08-01', date '2027-07-31',
   30, false, false,
   '11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');

insert into pessoal_ferias_gozo (
  funcionario_id, ferias_periodo_id, inicio, termino, dias, mes, ano,
  autorizado, abono_solicitado, emp_proprietaria_id, empregador_id
) values
  ('33333333-3333-4333-8333-000000000001','66666666-6666-4666-8666-000000000001',
   date '2026-09-07', date '2026-09-27', 20, 9, 2026, false, false,
   '11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111');

-- ===========================================================================
-- Pronto. Confira rapidamente:
--   select count(*) from vinculos_trabalhistas
--     where empregador_id = '11111111-1111-4111-8111-111111111111';  -- 10 (9 ativos)
-- ===========================================================================
