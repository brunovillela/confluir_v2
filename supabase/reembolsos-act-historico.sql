-- ============================================================================
-- Reembolsos do ACT: histórico do Bubble (2026-09-19). Idempotente.
--
-- O Bubble tem 275 lançamentos (2025–2026) e 9 categorias, que o
-- scripts/migrar-reembolsos-act-bubble.mjs traz. Faltavam três coisas nas
-- tabelas criadas por supabase/reembolsos-act.sql:
--   • bubble_id nas duas, para a migração ser repetível sem duplicar;
--   • proporção reembolsável e ícone na categoria (o ACT reembolsa 50%, 70% ou
--     100% conforme o benefício — o teto já existia em valor_limite);
--   • a data em que o FUNCIONÁRIO pagou a despesa (diferente da data do
--     lançamento e da competência do contracheque).
-- ============================================================================

alter table pessoal_reembolsos_act_tipos add column if not exists bubble_id text;
alter table pessoal_reembolsos_act_tipos add column if not exists proporcao_reembolsavel numeric
  check (proporcao_reembolsavel is null or (proporcao_reembolsavel > 0 and proporcao_reembolsavel <= 1));
alter table pessoal_reembolsos_act_tipos add column if not exists icone_url text;

comment on column pessoal_reembolsos_act_tipos.proporcao_reembolsavel is
  'Parte da despesa que o ACT reembolsa (0,5 = 50%). O teto fica em valor_limite.';

alter table pessoal_reembolsos_act add column if not exists bubble_id text;
alter table pessoal_reembolsos_act add column if not exists despesa_paga_em date;

comment on column pessoal_reembolsos_act.despesa_paga_em is
  'Quando o funcionário pagou a despesa (o pagamento pela entidade é pago_em).';

create unique index if not exists ux_reembolsos_act_tipos_bubble
  on pessoal_reembolsos_act_tipos (emp_proprietaria_id, bubble_id) where bubble_id is not null;
create unique index if not exists ux_reembolsos_act_bubble
  on pessoal_reembolsos_act (emp_proprietaria_id, bubble_id) where bubble_id is not null;
