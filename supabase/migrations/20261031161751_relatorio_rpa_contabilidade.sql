-- Confluir — Relatório de RPAs por e-mail à contabilidade no fechamento do mês (31/10/2026)
--
-- POR QUÊ: o relatório mensal de RPAs (bruto, retenções, NIT/PIS, patronal)
-- já sai na Exportação contábil, mas alguém precisa lembrar de baixá-lo e
-- mandar. Decisão do usuário (onda 6 do plano do RPA): o sistema envia à
-- contabilidade no dia seguinte ao fechamento do mês.
--
-- COMO:
--   1. financeiro_config.email_contabilidade — para onde vai o relatório
--      (configurado na Exportação contábil). Sem ele, nada é enviado.
--   2. financeiro_meses_fechados.rpa_relatorio_enviado_em / _para — o envio
--      de cada fechamento (o tick diário não manda duas vezes; reabrir e
--      fechar de novo cria outro fechamento, que manda a versão corrigida).
--   Idempotente.

alter table public.financeiro_config add column if not exists email_contabilidade text;
alter table public.financeiro_meses_fechados add column if not exists rpa_relatorio_enviado_em timestamptz;
alter table public.financeiro_meses_fechados add column if not exists rpa_relatorio_enviado_para text;

comment on column public.financeiro_config.email_contabilidade is 'E-mail da contabilidade que recebe o relatório mensal de RPAs no dia seguinte ao fechamento do mês. [lgpd:identificacao]';
comment on column public.financeiro_meses_fechados.rpa_relatorio_enviado_em is 'Quando o relatório de RPAs deste fechamento foi enviado à contabilidade (nulo = ainda não).';
comment on column public.financeiro_meses_fechados.rpa_relatorio_enviado_para is 'Para qual e-mail o relatório de RPAs deste fechamento foi enviado. [lgpd:identificacao]';
