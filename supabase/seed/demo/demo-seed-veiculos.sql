-- Confluir — SEED do tenant de DEMONSTRAÇÃO (módulo Veículos) — 2026-08-02
--
-- Dados 100% FICTÍCIOS para os prints do manual (/painel/ajuda/veiculos),
-- presos ao tenant demo (emp_proprietaria_id = 11111111-…). Reaproveita a
-- empresa/tenant e o operador do seed do Pessoal. Cobre: Frota (hub),
-- Agendamentos (com retirada/devolução por hodômetro) e Infração (com infrator
-- e cobrança no contracheque).
--
-- MESMAS REGRAS: sem begin/commit e sem tabela temporária; idempotente.
-- ARMADILHAS deste módulo:
--  * condutor_id / condutor_infrator_id = usuarios.id (NÃO o cadastro de CNH).
--    → criamos um USUÁRIO condutor dedicado (4d…0001).
--  * veiculos_infracoes e veiculos_infracoes_historico NÃO têm
--    emp_proprietaria_id (escopadas pelo pai veiculo_id / infracao_id).
--  * hodômetro de retirada/devolução mora em veiculos_disponibilidade (a
--    movimentação), ligada ao agendamento por agendamento_id.
--  * ano_fabricacao/ano_modelo são DATE. Situações são TEXTO livre.
--
-- IDs FIXOS:
--   empresa/tenant .... 11111111-1111-4111-8111-111111111111
--   operador .......... 22222222-2222-4222-8222-222222222222
--   condutor (usuario)  4d000000-0000-4000-8000-000000000001
--   veículos .......... 4e000000-…  agend 4a000000-…  infração 41000000-…
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
-- 1) LIMPEZA (filhos antes dos pais). Infrações/histórico por veiculo do tenant.
-- ---------------------------------------------------------------------------
delete from veiculos_infracoes_historico where infracao_id in (
  select id from veiculos_infracoes where veiculo_id in (
    select id from veiculos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111'));
delete from veiculos_infracoes where veiculo_id in (
  select id from veiculos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111');
delete from veiculos_disponibilidade where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from veiculos_agendamentos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from veiculos_condutores where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from veiculos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';
delete from usuarios where id = '4d000000-0000-4000-8000-000000000001';

-- ---------------------------------------------------------------------------
-- 2) Usuário condutor (motorista) + cadastro de CNH
-- ---------------------------------------------------------------------------
insert into usuarios (id, emp_proprietaria_id, nome_completo, nome_guerra, email, inativo, deletado)
values ('4d000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  'Eduardo Prado Martins','Edu','eduardo.motorista.demo@confluir.local', false, false);

insert into veiculos_condutores (
  id, emp_proprietaria_id, usuario_id, cnh_numero, cnh_categoria, cnh_validade,
  autorizado, autorizado_por_id, autorizado_em
) values (
  '4c000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '4d000000-0000-4000-8000-000000000001','01234567890','D', date '2029-06-30',
  true, '22222222-2222-4222-8222-222222222222', now() - interval '200 days');

-- ---------------------------------------------------------------------------
-- 3) Frota (aparece no hub). inativo=false → lista padrão.
-- ---------------------------------------------------------------------------
insert into veiculos (
  id, emp_proprietaria_id, codigo, placa, marca_modelo, cor, combustivel,
  lotacao, lotacao_os, ano_fabricacao, inativo, manutencao, eh_alugado
) values
  ('4e000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
   'V-001','ABC1D23','Fiat Cronos','Prata','Flex (Etanol e Gasolina)','Sede','Sede', date '2022-09-01', false, false, false),
  ('4e000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111',
   'V-002','DEF2E34','Volkswagen Saveiro','Branco','Flex (Etanol e Gasolina)','Refinaria','Refinaria', date '2021-09-01', false, false, false),
  ('4e000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111',
   'V-003','GHI3F45','Toyota Corolla','Preto','Flex (Etanol e Gasolina)','Sede','Sede', date '2023-09-01', false, false, true);

-- ---------------------------------------------------------------------------
-- 4) Agendamentos nos 3 estágios do fluxo (para o print ilustrar tudo):
--    'solicitada' (fila) · 'atendida' (aguardando retirada) · 'retirada'
--    (veículo na rua — com hodômetro de retirada, devolução em aberto).
-- ---------------------------------------------------------------------------
insert into veiculos_agendamentos (
  id, emp_proprietaria_id, empresa_id, situacao, atendido, motivo, destino,
  data_retirada, data_retorno, condutor_id, veiculo_id,
  atendido_por_id, atendido_em
) values
  ('4a000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',
   'atendida', true, 'Visita técnica à refinaria','Refinaria', date '2026-08-05', date '2026-08-05',
   '4d000000-0000-4000-8000-000000000001','4e000000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222', now() - interval '1 days'),
  ('4a000000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',
   'retirada', true, 'Transporte de documentos ao cartório','Centro do Rio', date '2026-08-01', date '2026-08-02',
   '4d000000-0000-4000-8000-000000000001','4e000000-0000-4000-8000-000000000002',
   '22222222-2222-4222-8222-222222222222', now() - interval '2 days'),
  ('4a000000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111',
   'solicitada', false, 'Deslocamento administrativo ao centro','Centro do Rio', date '2026-08-10', date '2026-08-10',
   '4d000000-0000-4000-8000-000000000001', null, null, null);

-- Movimentação ABERTA do agendamento 'retirada' (veículo na rua): hodômetro de
-- retirada registrado, devolução em aberto (data/hodômetro de devolução nulos).
insert into veiculos_disponibilidade (
  id, emp_proprietaria_id, veiculo_id, condutor_id, agendamento_id, registrado_por_id,
  data_retirada, hodometro_retirada, data_devolucao, hodometro_devolucao, km_rodado, disponivel
) values (
  '4f000000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111',
  '4e000000-0000-4000-8000-000000000002','4d000000-0000-4000-8000-000000000001',
  '4a000000-0000-4000-8000-000000000002','22222222-2222-4222-8222-222222222222',
  date '2026-08-01', 32500, null, null, null, false);

-- ---------------------------------------------------------------------------
-- 5) Infração com infrator e cobrança (contracheque). SEM emp_proprietaria_id
--    (escopo vem do veiculo_id).
-- ---------------------------------------------------------------------------
insert into veiculos_infracoes (
  id, codigo, veiculo_id, condutor_infrator_id, infracao_data, infracao_tipo,
  infracao_orgao_autuador, infracao_descricao, infracao_local, infracao_custo,
  notificacao_infrator, notificacao_infrator_quando, justificativa_sindical,
  cobranca_forma, cobranca_situacao, cobranca_valor, reembolso, created_at
) values (
  '41000000-0000-4000-8000-000000000001','I-001','4e000000-0000-4000-8000-000000000001',
  '4d000000-0000-4000-8000-000000000001', date '2026-07-05','Média',
  'DETRAN-RJ','Excesso de velocidade (até 20% acima do limite)','BR-101, km 320', 130.16,
  true, date '2026-07-08', false,
  'contracheque','pendente', 130.16, false, now() - interval '25 days');

insert into veiculos_infracoes_historico (id, infracao_id, usuario_id, evento, detalhe) values
  ('42000000-0000-4000-8000-000000000001','41000000-0000-4000-8000-000000000001',
   '22222222-2222-4222-8222-222222222222','registro','Infração registrada e vinculada ao condutor infrator');

-- ===========================================================================
-- Depois de rodar: capture os prints com scripts/manual-prints.mjs.
--   select count(*) from veiculos where emp_proprietaria_id = '11111111-1111-4111-8111-111111111111';  -- 3
-- ===========================================================================
