-- Confluir — Limite de RPAs por prestador por mês (30/10/2026)
--
-- POR QUÊ: o IRRF do autônomo é apurado por mês, pela tabela progressiva, e a
-- faixa de isenção vale para o total pago no mês. Vários RPAs pequenos ao
-- mesmo prestador no mesmo mês ficam, cada um, abaixo da isenção — e o
-- imposto que seria devido sobre a soma some. Os gestores de compras querem
-- travar isso: por padrão, um RPA por prestador por mês.
--
-- COMO: compras_rpa_config.limite_rpas_mes — quantos RPAs o mesmo prestador
-- pode receber no mesmo mês (pela data de emissão, no fuso de São Paulo).
-- Nulo = sem limite. Padrão 1. A emissão acima do limite é recusada no
-- código; quem ajusta é o Comprador (aquisicoes_comprador). Idempotente.

alter table public.compras_rpa_config add column if not exists limite_rpas_mes integer default 1;
alter table public.compras_rpa_config drop constraint if exists compras_rpa_config_limite_rpas_mes_check;
alter table public.compras_rpa_config
  add constraint compras_rpa_config_limite_rpas_mes_check check (limite_rpas_mes is null or limite_rpas_mes >= 1);

comment on column public.compras_rpa_config.limite_rpas_mes is 'Quantos RPAs o mesmo prestador pode receber no mesmo mês de emissão (fuso de São Paulo). Nulo = sem limite; padrão 1, para que vários recibos pequenos não escapem da tabela mensal do IRRF.';
