-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Representação Sindical) — 2026-08-02
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/representacao),
-- presos ao tenant demo (emp_proprietaria_id = 11111111-…). Reaproveita a
-- empresa/tenant do seed do Pessoal. Cobre: Assembleias (campanha→rodada→
-- assembleias, perguntas, aptos), Oposição (campanha→opositores) e Empregadores
-- (fonte pagadora + documentação legal).
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; idempotente
-- (apaga os dados demo do módulo e reinsere); TODA tabela tenant-owned recebe
-- `emp_proprietaria_id = demo` EXPLÍCITO. EXCEÇÃO: `voto_campanha_fontes` NÃO
-- tem essa coluna (não usamos aqui). NÃO inserir `voto_assembleias_aptos.
-- nome_completo_norm` (coluna gerada).
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   operador .......... 22222222-2222-4222-8222-222222222222
--   empregador ........ f0f0f0f0-0000-4000-8000-000000000003
--   assembleia camp ... aa000000-…  rodadas ab000000-…  assembleias ac000000-…
--   oposição camp ..... ba000000-…  opositores bc000000-…
-- ===========================================================================

-- 0) Garante a empresa/tenant demo.
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, emp_proprietaria_id)
values ('11111111-1111-4111-8111-111111111111',
  'Sindicato Demonstração (dados fictícios)', 'Confluir Demo', '00.000.000/0001-91', null)
on conflict (id) do nothing;
insert into tenants (empresa_id, slug, status)
values ('11111111-1111-4111-8111-111111111111', 'demo', 'trial')
on conflict (empresa_id) do nothing;

-- ---------------------------------------------------------------------------
-- 1) LIMPEZA dos dados de REPRESENTAÇÃO da demo (filhos antes dos pais).
-- ---------------------------------------------------------------------------
delete from voto_assembleias_aptos      where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from voto_assembleias_perguntas  where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from voto_assembleias            where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from voto_rod_assembleias        where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from voto_campanha               where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';

delete from oposicao_opositor           where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from oposicao_perguntas          where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from oposicao_campanha           where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';

delete from representacao_documentos    where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from empresa                     where id = 'f0f0f0f0-0000-4000-8000-000000000003';

-- ---------------------------------------------------------------------------
-- 2) Empregador (fonte pagadora) + documentação legal
-- ---------------------------------------------------------------------------
insert into empresa (id, nome_razao, nome_fantasia, cnpj_cpf, tipo, emp_proprietaria_id)
values ('f0f0f0f0-0000-4000-8000-000000000003',
  'Refinaria Modelo do Brasil S.A.', 'Refinaria Modelo', '33.444.555/0001-66',
  'Fonte pagadora', '11111111-1111-4111-8111-111111111111');

insert into representacao_documentos (
  id, emp_proprietaria_id, empresa_id, tipo, titulo, numero, data_documento, vigencia_fim
) values
  ('da000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'f0f0f0f0-0000-4000-8000-000000000003','carta_sindical','Carta Sindical','CS-001/1992', date '1992-05-10', null),
  ('da000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'f0f0f0f0-0000-4000-8000-000000000003','acordo','Acordo Coletivo de Trabalho 2025/2026','ACT-2025', date '2025-05-01', date '2026-04-30'),
  ('da000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'f0f0f0f0-0000-4000-8000-000000000003','procuracao','Procuração de Representação','PR-2024/07', date '2024-07-15', null);

-- ---------------------------------------------------------------------------
-- 3) ASSEMBLEIAS: 1 campanha → 2 rodadas → assembleias, perguntas e aptos.
-- ---------------------------------------------------------------------------
insert into voto_campanha (id, emp_proprietaria_id, tema, finalizado, created_at)
values ('aa000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Pauta de Reivindicações 2026 — Reajuste e ACT', false, now() - interval '30 days');

insert into voto_rod_assembleias (
  id, emp_proprietaria_id, campanha_id, nome_assembleia, codigo, descricao,
  inicio, termino, apuracao_encerrada, created_at
) values
  ('ab000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'aa000000-0000-4000-8000-000000000001','1ª Rodada — Refinaria','2026.0310.0900.0001',
   'Rodada na unidade da refinaria', date '2026-03-10', date '2026-03-12', false, now() - interval '28 days'),
  ('ab000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'aa000000-0000-4000-8000-000000000001','2ª Rodada — Administrativo','2026.0315.0900.0002',
   'Rodada nas áreas administrativas', date '2026-03-15', date '2026-03-16', false, now() - interval '26 days');

insert into voto_assembleias (
  id, emp_proprietaria_id, rod_assembleia_id, nome_assembleia, descricao,
  online, urnas_de_votacao, voto_em_separado, data_inicio, data_termino,
  codigo, contador_votos, apuracao_encerrada, created_at
) values
  ('ac000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'ab000000-0000-4000-8000-000000000001','Assembleia Refinaria — Turno Manhã','Portão principal',
   false, true, false, date '2026-03-10', date '2026-03-10','ASSEM-0001', 0, false, now() - interval '28 days'),
  ('ac000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'ab000000-0000-4000-8000-000000000001','Assembleia Refinaria — Turno Tarde','Refeitório',
   false, true, false, date '2026-03-10', date '2026-03-10','ASSEM-0002', 0, false, now() - interval '28 days'),
  ('ac000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'ab000000-0000-4000-8000-000000000002','Assembleia Administrativo — Online','Plataforma de votação',
   true, false, false, date '2026-03-15', date '2026-03-16','ASSEM-0003', 0, false, now() - interval '26 days');

insert into voto_assembleias_perguntas (
  id, emp_proprietaria_id, rod_assembleia_id, pergunta, ordem, created_at
) values
  ('ad000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'ab000000-0000-4000-8000-000000000001','Aprova a proposta de reajuste salarial de 5%?', 1, now() - interval '28 days'),
  ('ad000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'ab000000-0000-4000-8000-000000000001','Autoriza a diretoria a prosseguir na negociação do ACT?', 2, now() - interval '28 days');

-- Aptos da 1ª rodada (alguns já votaram → hora_voto preenchida).
insert into voto_assembleias_aptos (
  id, emp_proprietaria_id, rod_assembleia_id, cpf, nome_completo, matricula, hora_voto, created_at
) values
  ('ae000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ab000000-0000-4000-8000-000000000001','11122233301','Roberto Alves Pereira','2001', now() - interval '27 days', now() - interval '28 days'),
  ('ae000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ab000000-0000-4000-8000-000000000001','33344455503','José Carlos de Oliveira','2003', now() - interval '27 days', now() - interval '28 days'),
  ('ae000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ab000000-0000-4000-8000-000000000001','55566677705','Antônio Ferreira Nunes','2005', null, now() - interval '28 days'),
  ('ae000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','ab000000-0000-4000-8000-000000000001','44455566604','Patrícia Gomes Lima','2004', null, now() - interval '28 days'),
  ('ae000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','ab000000-0000-4000-8000-000000000001','66677788806','Camila Rodrigues Pinto','2006', null, now() - interval '28 days');

-- ---------------------------------------------------------------------------
-- 4) OPOSIÇÃO: 1 campanha aberta → perguntas → opositores (situações variadas).
--    'nao_avaliada' = pendente na fila de avaliação.
-- ---------------------------------------------------------------------------
insert into oposicao_campanha (
  id, emp_proprietaria_id, codigo, nome, detalhe_desconto, prazo_inicio, prazo_fim,
  modo_formalizacao, situacao, created_at
) values (
  'ba000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'OPO-2026','Contribuição Assistencial 2026','Desconto de 1 dia de salário em folha',
  date '2026-04-01', date '2026-04-30','tela','aberta', now() - interval '40 days');

insert into oposicao_perguntas (id, emp_proprietaria_id, campanha_id, pergunta, ordem) values
  ('bb000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ba000000-0000-4000-8000-000000000001','Confirma que se opõe ao desconto da contribuição assistencial?', 1),
  ('bb000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ba000000-0000-4000-8000-000000000001','Qual o motivo da oposição?', 2);

insert into oposicao_opositor (
  id, emp_proprietaria_id, campanha_id, cpf, nome_completo, email, telefone,
  matricula, lotacao, empregador_id, situacao, protocolo, created_at
) values
  ('bc000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','ba000000-0000-4000-8000-000000000001','12312312301','Paulo Ricardo Menezes','paulo.demo@exemplo.com','(21) 98800-0001','3001','Refinaria','f0f0f0f0-0000-4000-8000-000000000003','nao_avaliada', 501, now() - interval '5 days'),
  ('bc000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','ba000000-0000-4000-8000-000000000001','23423423402','Renata Aparecida Vasconcelos','renata.demo@exemplo.com','(21) 98800-0002','3002','Administrativo','f0f0f0f0-0000-4000-8000-000000000003','nao_avaliada', 502, now() - interval '4 days'),
  ('bc000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','ba000000-0000-4000-8000-000000000001','34534534503','Sérgio Luiz Fontoura','sergio.demo@exemplo.com','(21) 98800-0003','3003','Operação','f0f0f0f0-0000-4000-8000-000000000003','aprovada', 498, now() - interval '8 days'),
  ('bc000000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','ba000000-0000-4000-8000-000000000001','45645645604','Tânia Regina Barcelos','tania.demo@exemplo.com','(21) 98800-0004','3004','Laboratório','f0f0f0f0-0000-4000-8000-000000000003','reprovada', 495, now() - interval '9 days'),
  ('bc000000-0000-4000-8000-000000000005','11111111-1111-4111-8111-111111111111','ba000000-0000-4000-8000-000000000001','56756756705','Wagner Souza Lima','wagner.demo@exemplo.com','(21) 98800-0005','3005','Manutenção','f0f0f0f0-0000-4000-8000-000000000003','aguardando_documento', 503, now() - interval '2 days'),
  ('bc000000-0000-4000-8000-000000000006','11111111-1111-4111-8111-111111111111','ba000000-0000-4000-8000-000000000001','67867867806','Cláudia Marques Teles','claudia.demo@exemplo.com','(21) 98800-0006','3006','Segurança','f0f0f0f0-0000-4000-8000-000000000003','desistente', 490, now() - interval '12 days');

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs.
--   select count(*) from oposicao_opositor
--     where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 6
-- ===========================================================================
