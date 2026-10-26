-- ============================================================================
-- SEED DEMO — Dados bancários fictícios dos favorecidos e convênio do hotel (26/10/2026)
--
-- POR QUÊ: desde 26/10 toda ordem nasce com forma de pagamento, puxada do
-- cadastro do favorecido, e Pix/TED exige a conta registrada
-- (src/lib/db/ordens-destino.ts). Sem conta, as diárias do Carlos Andrade da
-- Silva e o faturamento da Pousada Mar Azul seriam recusados na demo.
--
-- dados_bancarios NÃO tem emp_proprietaria_id: escopada pelo pai
-- (usuario_id / fornecedor_id). IDs fixos db200000-…; idempotente.
-- ============================================================================

-- Upsert (não delete): as ordens da demo passam a apontar para estes dados.
-- Carlos Andrade da Silva (usuário da demo): Pix preferido e uma conta.
insert into dados_bancarios (id, usuario_id, pix, pix_tipo, prefere_pix, favorito, favorecido) values
  ('db200000-0000-4000-8000-000000000001', 'ab000000-0000-4000-8000-000000000022',
   'carlos.andrade@exemplo.com', 'E-mail', true, true, 'Carlos Andrade da Silva')
  on conflict (id) do update set pix = excluded.pix, pix_tipo = excluded.pix_tipo,
    prefere_pix = excluded.prefere_pix, favorito = excluded.favorito, favorecido = excluded.favorecido;
insert into dados_bancarios (id, usuario_id, banco, banco_codigo, agencia, conta, tipo_conta, favorecido) values
  ('db200000-0000-4000-8000-000000000002', 'ab000000-0000-4000-8000-000000000022',
   'Banco do Brasil', '001', '1234-5', '11223-4', 'Corrente', 'Carlos Andrade da Silva')
  on conflict (id) do update set banco = excluded.banco, banco_codigo = excluded.banco_codigo,
    agencia = excluded.agencia, conta = excluded.conta, tipo_conta = excluded.tipo_conta, favorecido = excluded.favorecido;

-- Pousada Mar Azul (fornecedor): a conta de recebimento do convênio.
insert into dados_bancarios (id, fornecedor_id, banco, banco_codigo, agencia, conta, tipo_conta, favorito, favorecido) values
  ('db200000-0000-4000-8000-000000000003', 'f0f0f0f0-0000-4000-8000-000000000005',
   'Caixa Econômica Federal', '104', '0456', '00098765-1', 'Corrente', true, 'Pousada Mar Azul Hotelaria Ltda')
  on conflict (id) do update set banco = excluded.banco, banco_codigo = excluded.banco_codigo,
    agencia = excluded.agencia, conta = excluded.conta, tipo_conta = excluded.tipo_conta,
    favorito = excluded.favorito, favorecido = excluded.favorecido;

-- ---------------------------------------------------------------------------
-- Convênio da Pousada Mar Azul: o faturamento do hotel entra no contrato do
-- hotel (contratoDoHotel) e recusa faturar sem ele. A demo não tinha.
-- ---------------------------------------------------------------------------
update hospedagem_hotel set contrato_id = null
  where id = '40010000-0000-4000-8000-000000000001';
delete from contratos where id = 'c1100000-0000-4000-8000-000000000020';

insert into contratos (
  id, emp_proprietaria_id, codigo, objeto, valor, vigencia_inicio, vigencia_termino,
  ativo, deletado, aditivo, apoio_institucional, sob_demanda,
  fornecedor_id, departamento_id, categoria_id, centro_custo_id, created_at
) values (
  'c1100000-0000-4000-8000-000000000020','11111111-1111-4111-8111-111111111111',
  '2026.0601.0900.0020','Convênio de hospedagem para filiados — subsídio por diária', 0,
  (now() - interval '150 days')::date, (now() + interval '215 days')::date,
  true, false, false, false, true,
  'f0f0f0f0-0000-4000-8000-000000000005','de100000-0000-4000-8000-000000000001',
  'cf100000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001', now() - interval '150 days');

update hospedagem_hotel set contrato_id = 'c1100000-0000-4000-8000-000000000020'
  where id = '40010000-0000-4000-8000-000000000001';
