-- Confluir — IRRF do RPA apurado pelo mês do pagamento (31/10/2026)
--
-- POR QUÊ: o IRRF do autônomo é apurado pelo total que ele recebe no mês. Com
-- dois RPAs pagos no mesmo mês, cada um calculado sozinho fica abaixo da
-- isenção. A contabilidade confirmou (31/10): acumular pelo mês do pagamento;
-- o limite de RPAs por mês deixa de bloquear e vira só um aviso.
--
-- COMO: na emissão, o código soma os outros RPAs do prestador pagos ou
-- previstos no mesmo mês, calcula o IRRF (e o teto do INSS) sobre o total e
-- retém a diferença. O recibo guarda o mês da apuração e a memória do
-- cálculo, que aparecem no PDF e na página do RPA. Idempotente.

alter table public.compras_rpa add column if not exists irrf_mes date;
alter table public.compras_rpa add column if not exists irrf_memoria jsonb;

comment on column public.compras_rpa.irrf_mes is 'Primeiro dia do mês do pagamento em que o IRRF e o teto do INSS deste RPA foram apurados. Nulo nos RPAs anteriores a 31/10/2026 e nos avulsos, emitidos sem data de pagamento.';
comment on column public.compras_rpa.irrf_memoria is 'Memória do cálculo do mês, quando havia outros RPAs do prestador no mesmo mês do pagamento: os anteriores (número, bruto, INSS, IRRF), o bruto, o INSS, a base e o IRRF do mês e o já retido. Nulo quando o RPA foi o único do mês. [lgpd:financeiro]';

alter table public.compras_rpa_config alter column limite_rpas_mes set default 1;
comment on column public.compras_rpa_config.limite_rpas_mes is 'A partir de quantos RPAs do mesmo prestador no mesmo mês (de emissão ou de pagamento) o sistema avisa. Só aviso desde 31/10/2026: o IRRF já é apurado pelo total do mês. Nulo = sem aviso; padrão 1.';
