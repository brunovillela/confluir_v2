-- Confluir — dados demo p/ os prints da Área do comprador e do Acompanhamento
-- de etapas (29/08). Bancada demo (tenant 1111…). Espelha o applier JS
-- scripts/seed-prints-extra.mjs. Idempotente.

do $$
declare d uuid := '11111111-1111-4111-8111-111111111111'; dep uuid;
begin
  select id into dep from empresa_departamentos where emp_proprietaria_id = d and departamento = 'Administrativo' limit 1;

  -- Área do comprador: 2 processos Via Compras abertos (solicitada + cotada).
  -- (o seed de Compras já deixou 1 "em cotação" → três blocos preenchidos.)
  delete from compras_solicitacoes where id in
    ('9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000002');
  insert into compras_solicitacoes (id, emp_proprietaria_id, codigo, aquisicao_direta, solicitacao_produto, solicitacao_departamento_id, cancelado, em_cotacao, comprado, recebido, estocavel, solicitacao_data_limite, cotacao_termino, created_at) values
    ('9d000000-0000-4000-8000-000000000001', d, '2026.0801.0900.0003', false, 'Cadeiras ergonômicas para a secretaria (6 un.)', dep, false, false, false, false, false, '2026-08-20', null,         '2026-08-01T12:00:00Z'),
    ('9d000000-0000-4000-8000-000000000002', d, '2026.0728.0900.0002', false, 'Notebooks para a equipe de campo (3 un.)',       dep, false, false, false, false, false, '2026-09-10', '2026-08-15', '2026-07-28T12:00:00Z');

  -- Acompanhamento: move filiados demo p/ condições intermediárias + condicao_desde.
  update filiacoes set filiacao_condicao = 'Aguarda ficha assinada',      condicao_desde = '2026-08-22' where emp_proprietaria_id = d and nome_completo = 'Mariana Souza Ribeiro';
  update filiacoes set filiacao_condicao = 'Aguarda ficha assinada',      condicao_desde = '2026-08-18' where emp_proprietaria_id = d and nome_completo = 'Patrícia Gomes Lima';
  update filiacoes set filiacao_condicao = 'Filiação não informada à fonte', condicao_desde = '2026-08-10', created_at = '2026-08-05T12:00:00Z', ficha_assinada_em = '2026-08-10T12:00:00Z' where emp_proprietaria_id = d and nome_completo = 'José Carlos de Oliveira';
  update filiacoes set filiacao_condicao = 'Filiação aguarda fonte',      condicao_desde = '2026-07-15', ficha_assinada_em = '2026-07-01T12:00:00Z', filiacao_informada_fonte_em = '2026-07-15T12:00:00Z' where emp_proprietaria_id = d and nome_completo = 'Antônio Ferreira Nunes';
  update filiacoes set filiacao_condicao = 'Desfiliação não informada à fonte', condicao_desde = '2026-08-20' where emp_proprietaria_id = d and nome_completo = 'Camila Rodrigues Pinto';
  update filiacoes set filiacao_condicao = 'Desfiliação aguarda fonte',   condicao_desde = '2026-07-30', desfiliacao_informada_fonte_em = '2026-07-30T12:00:00Z' where emp_proprietaria_id = d and nome_completo = 'Fernando Batista Rocha';
end $$;
