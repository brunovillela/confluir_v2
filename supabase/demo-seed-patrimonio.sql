-- Confluir — seed do módulo PATRIMÔNIO no tenant de DEMONSTRAÇÃO (28/08)
--
-- Popula o Patrimônio na bancada demo (tenant 1111…) para os prints do manual.
-- Espelha o applier JS scripts/seed-patrimonio-demo.mjs. Idempotente:
-- apaga por emp (na ordem das FKs) e reinsere com ids fixos (prefixo 9c…).
-- Reusa usuários (funcionários demo) e o fornecedor "Tech Suprimentos" por nome.
--
-- Cautela: item "Em cautela" = patrimonio_item.responsavel_cautela_id preenchido;
-- cautela aberta = patrimonio_item_responsavel.termino IS NULL. sede é enum
-- sedes_enum (usar 'Campos'/'Macaé').

do $$
declare
  d uuid := '11111111-1111-4111-8111-111111111111';
  u_ana uuid;    u_carlos uuid;  u_debora uuid;  u_eduardo uuid;  e_forn uuid;
begin
  select id into u_ana     from usuarios where emp_proprietaria_id = d and nome_completo = 'Ana Beatriz Nogueira'   limit 1;
  select id into u_carlos  from usuarios where emp_proprietaria_id = d and nome_completo = 'Carlos Eduardo Simões'  limit 1;
  select id into u_debora  from usuarios where emp_proprietaria_id = d and nome_completo = 'Débora Cristina Alves'  limit 1;
  select id into u_eduardo from usuarios where emp_proprietaria_id = d and nome_completo = 'Eduardo Prado Martins'  limit 1;
  select id into e_forn    from empresa  where emp_proprietaria_id = d and nome_fantasia  = 'Tech Suprimentos'      limit 1;

  -- idempotente: limpa na ordem das FKs
  delete from patrimonio_item_responsavel   where emp_proprietaria_id = d;
  delete from patrimonio_item               where emp_proprietaria_id = d;
  delete from patrimonio_recinto_responsavel where emp_proprietaria_id = d;
  delete from patrimonio_nota_fiscal        where emp_proprietaria_id = d;
  delete from patrimonio_recinto            where emp_proprietaria_id = d;

  -- recintos
  insert into patrimonio_recinto (id, emp_proprietaria_id, bubble_id, nome_recinto, codigo, descricao_fisica, sede, created_at) values
    ('9c000000-0000-4000-8000-000000000001', d, 'demo-rec-1', 'Secretaria — Sala 1', 'DEMO.REC.001', 'Sala administrativa com estações de trabalho.', 'Campos', '2025-02-10T12:00:00Z'),
    ('9c000000-0000-4000-8000-000000000002', d, 'demo-rec-2', 'Almoxarifado',        'DEMO.REC.002', 'Depósito de materiais e equipamentos.',        'Campos', '2025-02-10T12:00:00Z');

  -- notas fiscais (N1 entrada c/ fornecedor; N2 saída)
  insert into patrimonio_nota_fiscal (id, emp_proprietaria_id, bubble_id, entrada, numero_nota, data_emissao, fornecedor_id, arquivo_nota, created_at) values
    ('9c000000-0000-4000-8000-000000000021', d, 'demo-nf-1', true,  '005.123', '2025-02-05', e_forn, null, '2025-02-06T12:00:00Z'),
    ('9c000000-0000-4000-8000-000000000022', d, 'demo-nf-2', false, '005.200', '2025-06-20', null,   null, '2025-06-20T12:00:00Z');

  -- itens (I3 em cautela → responsavel_cautela_id = Débora)
  insert into patrimonio_item (id, emp_proprietaria_id, bubble_id, nome, descricao, numero_patrimonio, ativo, recinto_id, nota_fiscal_entrada_id, responsavel_cautela_id, created_at) values
    ('9c000000-0000-4000-8000-000000000031', d, 'demo-it-1', 'Notebook Dell Latitude 3440', 'Notebook i5, 16GB, uso administrativo.',  'DEMO.2024.001', true, '9c000000-0000-4000-8000-000000000001', '9c000000-0000-4000-8000-000000000021', null,      '2025-02-06T12:00:00Z'),
    ('9c000000-0000-4000-8000-000000000032', d, 'demo-it-2', 'Projetor Epson PowerLite',    'Projetor para sala de reuniões.',         'DEMO.2024.002', true, '9c000000-0000-4000-8000-000000000002', '9c000000-0000-4000-8000-000000000021', null,      '2025-02-06T12:00:00Z'),
    ('9c000000-0000-4000-8000-000000000033', d, 'demo-it-3', 'Cadeira Presidente',          'Cadeira de escritório giratória.',        'DEMO.2024.003', true, '9c000000-0000-4000-8000-000000000001', null,                                   u_debora,  '2025-02-06T12:00:00Z'),
    ('9c000000-0000-4000-8000-000000000034', d, 'demo-it-4', 'Impressora HP LaserJet',      'Impressora multifuncional do almoxarifado.', 'DEMO.2024.004', true, '9c000000-0000-4000-8000-000000000002', null,                                null,      '2025-02-06T12:00:00Z');

  -- responsáveis de recinto (atual)
  insert into patrimonio_recinto_responsavel (id, emp_proprietaria_id, bubble_id, recinto_id, funcionario_id, inicio, termino, atual, created_at) values
    ('9c000000-0000-4000-8000-000000000011', d, 'demo-rr-1', '9c000000-0000-4000-8000-000000000001', u_ana,    '2025-02-10', null, true, '2025-02-10T12:00:00Z'),
    ('9c000000-0000-4000-8000-000000000012', d, 'demo-rr-2', '9c000000-0000-4000-8000-000000000002', u_carlos, '2025-02-10', null, true, '2025-02-10T12:00:00Z');

  -- cautelas: C1 aberta (I3/Débora), C2 encerrada (I1/Eduardo)
  insert into patrimonio_item_responsavel (id, emp_proprietaria_id, bubble_id, item_id, responsavel_id, inicio, termino, arquivo_cautela, created_at) values
    ('9c000000-0000-4000-8000-000000000041', d, 'demo-ca-1', '9c000000-0000-4000-8000-000000000033', u_debora,  '2025-07-01', null,         null, '2025-07-01T12:00:00Z'),
    ('9c000000-0000-4000-8000-000000000042', d, 'demo-ca-2', '9c000000-0000-4000-8000-000000000031', u_eduardo, '2025-03-01', '2025-05-15', null, '2025-03-01T12:00:00Z');
end $$;
