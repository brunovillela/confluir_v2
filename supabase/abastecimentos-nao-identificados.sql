-- Abastecimentos: veículo e condutor como vieram no relatório (30/09/2026).
--
-- A leitura do relatório pela IA passa a gravar TODAS as transações — as de
-- placa que não bate com a frota ficam sem veículo, com a placa informada
-- guardada, para vincular depois (editando o lançamento, um a um ou todos da
-- mesma placa). O mesmo para o nome do motorista não identificado.
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.veiculos_abastecimentos
  add column if not exists placa_informada text,
  add column if not exists condutor_informado text;

comment on column public.veiculos_abastecimentos.placa_informada is
  'Placa como veio no relatório/fatura (a leitura pela IA grava sempre; sem veículo, é o que resta para vincular).';
comment on column public.veiculos_abastecimentos.condutor_informado is
  'Nome do motorista como veio no relatório, quando não foi identificado entre os condutores.';

create index if not exists veiculos_abastecimentos_sem_veiculo_idx
  on public.veiculos_abastecimentos (emp_proprietaria_id, placa_informada)
  where veiculo_id is null;
