-- ===========================================================================
-- SEED DEMO — Pessoal (áreas extras: níveis, anuênios, diárias, atestados/ASO,
-- treinamentos, reembolsos ACT, informes de rendimentos)
-- ---------------------------------------------------------------------------
-- Complementa demo-seed-pessoal.sql (que cobria funcionários/contracheques/
-- ponto/férias) para que as 6 telas restantes do módulo saiam cheias nos prints.
--
-- Pré-requisitos: `supabase/diarias.sql` e `supabase/reembolsos-act.sql` já
-- rodados (senão essas telas mostram "Configurar"). Funcionários demo =
-- usuarios 33333333-…0001..0009 (evitar 0010, desligado). Tenant demo =
-- 11111111-…111 (= sindicato_id). Tabelas `aso` e `pes_atestados_medicos` NÃO
-- têm emp_proprietaria_id (isolam por funcionario_id → usuarios).
--
-- Convenção: sem begin/commit, idempotente (on conflict do nothing). IDs 5a–5f.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Cargos (base de níveis)
-- ---------------------------------------------------------------------------
insert into pessoal_cargo (id, emp_proprietaria_id, sindicato_id, nome, carga_horaria_padrao, carga_horaria_reduzida) values
  ('5a100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Analista', 40, 36),
  ('5a100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111','Assistente Administrativo', 44, 40)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Níveis salariais: tabela (base) + lançamentos por funcionário
-- ---------------------------------------------------------------------------
insert into pessoal_nivel_salarial_base (id, emp_proprietaria_id, sindicato_id, ordem, nivel_vertical, nivel_horizontal, nivel_carreira, salario_base, cargo_id) values
  ('5a200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', 1,'I','A','Júnior', 3200.00,'5a100000-0000-4000-8000-000000000001'),
  ('5a200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', 2,'I','B','Júnior', 3520.00,'5a100000-0000-4000-8000-000000000001'),
  ('5a200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', 3,'II','A','Pleno', 4200.00,'5a100000-0000-4000-8000-000000000001'),
  ('5a200000-0000-4000-8000-000000000004','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', 4,'II','B','Pleno', 4620.00,'5a100000-0000-4000-8000-000000000001')
on conflict (id) do nothing;

insert into pessoal_nivel_salarial (id, emp_proprietaria_id, funcionario_id, ano, mes, tipo_avanco, nivel_atual_id, nivel_atual_data, proximo_nivel_id, proximo_nivel_data) values
  ('5a300000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000001','2026','Março','Por mérito','5a200000-0000-4000-8000-000000000003', current_date - 120,'5a200000-0000-4000-8000-000000000004', current_date + 240),
  ('5a300000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000002','2025','Agosto','Automático','5a200000-0000-4000-8000-000000000002', current_date - 300,'5a200000-0000-4000-8000-000000000003', current_date + 60),
  ('5a300000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000003','2024','Fevereiro','Inicial','5a200000-0000-4000-8000-000000000001', current_date - 700,'5a200000-0000-4000-8000-000000000002', null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Anuênios: tabela de alíquotas (base) + lançamentos por funcionário
-- ---------------------------------------------------------------------------
insert into pessoal_anuenio_base (id, emp_proprietaria_id, sindicato_id, nivel, aliquota) values
  ('5a400000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', 1, 0.02),
  ('5a400000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', 2, 0.04),
  ('5a400000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','11111111-1111-4111-8111-111111111111', 3, 0.06)
on conflict (id) do nothing;

insert into pessoal_anuenio (id, emp_proprietaria_id, funcionario_id, ano, mes, informado_contabilidade, nivel_atual_id, nivel_atual_data, proximo_nivel_id, proximo_nivel_data) values
  ('5a500000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000001','2026','Março', false,'5a400000-0000-4000-8000-000000000002', current_date - 400,'5a400000-0000-4000-8000-000000000003', current_date + 20),
  ('5a500000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000002','2025','Agosto', true,'5a400000-0000-4000-8000-000000000001', current_date - 800,'5a400000-0000-4000-8000-000000000002', current_date + 120),
  ('5a500000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000003','2024','Fevereiro', true,'5a400000-0000-4000-8000-000000000003', current_date - 1200, null, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Diárias: tipos (financeiro_diarias) + solicitações
-- ---------------------------------------------------------------------------
-- `diaria` é enum legado (Nacional/Internacional/Local/Outro); o que vale hoje
-- é nome/ativa/valor_reembolso.
insert into financeiro_diarias (id, emp_proprietaria_id, nome, ativa, valor_reembolso, diaria) values
  ('5b100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Diária de viagem', true, 180.00,'Nacional'),
  ('5b100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Diária de curso', true, 120.00,'Local')
on conflict (id) do nothing;

insert into pessoal_diarias_solicitacoes (id, emp_proprietaria_id, funcionario_id, diaria_id, quantidade, motivo, data_inicio, data_termino, situacao, valor_unitario, valor_total) values
  ('5b200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000001','5b100000-0000-4000-8000-000000000001', 3,'Viagem a Brasília — reunião da federação', current_date + 5, current_date + 7,'aguardando', 180.00, 540.00),
  ('5b200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000002','5b100000-0000-4000-8000-000000000002', 2,'Curso de formação sindical', current_date - 10, current_date - 9,'aprovada', 120.00, 240.00),
  ('5b200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000003','5b100000-0000-4000-8000-000000000001', 1,'Assembleia na base de Macaé', current_date - 20, current_date - 20,'aprovada', 180.00, 180.00)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Reembolsos do ACT: tipos + solicitações
-- ---------------------------------------------------------------------------
insert into pessoal_reembolsos_act_tipos (id, emp_proprietaria_id, nome, descricao, valor_limite, ativa) values
  ('5c100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','Material escolar','Reembolso de material escolar dos dependentes', 800.00, true),
  ('5c100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Óculos de grau','Auxílio para lentes e armação', 500.00, true)
on conflict (id) do nothing;

insert into pessoal_reembolsos_act (id, emp_proprietaria_id, funcionario_id, tipo_id, valor_solicitado, valor_aprovado, descricao, situacao, pagamento_mes, pagamento_ano) values
  ('5c200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000001','5c100000-0000-4000-8000-000000000001', 750.00, null,'Material escolar 2026 — dois filhos','aguardando', null, null),
  ('5c200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000002','5c100000-0000-4000-8000-000000000002', 480.00, 480.00,'Óculos de grau','aprovado','03','2026'),
  ('5c200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000003','5c100000-0000-4000-8000-000000000001', 300.00, 300.00,'Material escolar — um filho','pago','02','2026')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Treinamentos: catálogo + alunos
-- ---------------------------------------------------------------------------
insert into pessoal_treinamentos (id, emp_proprietaria_id, treinamento, carga_horaria, vencimento_meses) values
  ('5d100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','NR-35 — Trabalho em Altura', 8, 24),
  ('5d100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','Primeiros Socorros', 16, 12)
on conflict (id) do nothing;

insert into pessoal_treinamentos_alunos (id, emp_proprietaria_id, aluno_id, treinamento_id, data_inicio, data_termino) values
  ('5d200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000001','5d100000-0000-4000-8000-000000000001', current_date - 120, current_date - 118),
  ('5d200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000002','5d100000-0000-4000-8000-000000000001', current_date - 120, current_date - 118),
  ('5d200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000003','5d100000-0000-4000-8000-000000000002', current_date - 430, current_date - 429)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Informes de rendimentos: remessas + itens por funcionário
-- ---------------------------------------------------------------------------
insert into pessoal_informes_rendimentos_remessas (id, emp_proprietaria_id, ordem, fechada, ano_referencia_os) values
  ('5e100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111', 2, false,'2025'),
  ('5e100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111', 1, true,'2024')
on conflict (id) do nothing;

insert into pessoal_informes_rendimentos (id, emp_proprietaria_id, remessa_id, funcionario_id, ordem, liberado, ano_referencia_os) values
  ('5e200000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','5e100000-0000-4000-8000-000000000001','33333333-3333-4333-8333-000000000001', 1, true,'2025'),
  ('5e200000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','5e100000-0000-4000-8000-000000000001','33333333-3333-4333-8333-000000000002', 2, false,'2025'),
  ('5e200000-0000-4000-8000-000000000003','11111111-1111-4111-8111-111111111111','5e100000-0000-4000-8000-000000000001','33333333-3333-4333-8333-000000000003', 3, true,'2025')
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Ausências (COM emp) e Atestados médicos (SEM emp — por-pai)
-- ---------------------------------------------------------------------------
insert into pessoal_ausencias (id, emp_proprietaria_id, funcionario_id, inicio, termino, motivo) values
  ('5f100000-0000-4000-8000-000000000001','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000004', current_date - 40, current_date - 38,'Licença nojo (falecimento de familiar)'),
  ('5f100000-0000-4000-8000-000000000002','11111111-1111-4111-8111-111111111111','33333333-3333-4333-8333-000000000005', current_date - 60, current_date - 58,'Licença-gala (casamento)')
on conflict (id) do nothing;

insert into pes_atestados_medicos (id, funcionario_id, cid10, inicio, termino, ano, mes, quantidade_dias, consideracao, atestado_acompanhamento) values
  ('5f200000-0000-4000-8000-000000000001','33333333-3333-4333-8333-000000000001','J11', current_date - 25, current_date - 23,'2026','Julho', 3,'Repouso domiciliar', false),
  ('5f200000-0000-4000-8000-000000000002','33333333-3333-4333-8333-000000000002','M54.5', current_date - 15, current_date - 11,'2026','Julho', 5,'Fisioterapia', false),
  ('5f200000-0000-4000-8000-000000000003','33333333-3333-4333-8333-000000000003','J06', current_date - 8, current_date - 8,'2026','Agosto', 1,'Acompanhamento de filho', true)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- ASO (SEM emp — por-pai). Um por funcionário, ultimo=true; vencimentos
-- variados p/ badges Vigente/Venceu e o alerta de 90 dias no hub.
-- ---------------------------------------------------------------------------
insert into aso (id, funcionario_id, tipo, data, ultimo, vencimento, realizado, enviado) values
  ('5f300000-0000-4000-8000-000000000001','33333333-3333-4333-8333-000000000001','Periódico', current_date - 65, true, current_date + 300, true, true),
  ('5f300000-0000-4000-8000-000000000002','33333333-3333-4333-8333-000000000002','Periódico', current_date - 300, true, current_date + 60, true, true),
  ('5f300000-0000-4000-8000-000000000003','33333333-3333-4333-8333-000000000003','Admissional', current_date - 400, true, current_date - 30, true, true)
on conflict (id) do nothing;

-- ===========================================================================
-- Depois de rodar, capture com:  node scripts/manual-prints.mjs
-- ===========================================================================
