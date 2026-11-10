-- Viagens: quarto individual ou coletivo no pedido de hospedagem.
--
-- POR QUÊ: quartos coletivos (duplos, triplos…) não existiam em Viagens; cada
-- hospedagem era um quarto solto e a divisão do valor era feita à mão na
-- fatura. Fase 1 do docs/plano-viagens-quartos.md (10/11/2026): quem pede
-- diz se quer quarto individual ou coletivo e, se quiser, com quem prefere
-- dividir. É só indicação: o atendimento monta os quartos (Fase 2).
--
-- COMO: duas colunas em viagens_itens, válidas só para hospedagem.
-- Hospedagens já pedidas ficam como individual. Idempotente.

alter table public.viagens_itens
  add column if not exists quarto_pedido text not null default 'individual',
  add column if not exists dividir_com text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'viagens_itens_quarto_pedido_check'
  ) then
    alter table public.viagens_itens
      add constraint viagens_itens_quarto_pedido_check
      check (quarto_pedido in ('individual', 'coletivo'));
  end if;
end;
$$;

comment on column public.viagens_itens.quarto_pedido is
  'Hospedagem: quarto pedido por quem viaja (individual | coletivo). Só indicação; o atendimento monta os quartos.';
comment on column public.viagens_itens.dividir_com is
  'Hospedagem em quarto coletivo: com quem a pessoa prefere dividir, em texto livre. [lgpd:identificacao]';
