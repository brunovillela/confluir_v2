-- Confluir — CPF/CNPJ do titular da conta (dados_bancarios.titular_documento)
--
-- POR QUÊ: a regra de auditoria "Conta de outro titular" (TED numa conta que
-- não é do favorecido — a troca da conta do fornecedor é o golpe mais comum)
-- só tinha o NOME do titular (`favorecido`) para comparar, e nome gera alerta
-- falso (grafias diferentes) ou deixa passar (homônimos). Com o documento, a
-- comparação é exata.
--
-- COMO: coluna nova, só dígitos (11 = CPF, 14 = CNPJ), preenchida nos
-- formulários de conta (fornecedor, conta nova na compra/contrato/custeio,
-- funcionário, ficha do diretor, contas do hotel). Opcional: as contas antigas
-- seguem comparadas pelo nome até alguém informar o documento.

alter table public.dados_bancarios
  add column if not exists titular_documento text;

alter table public.dados_bancarios
  drop constraint if exists dados_bancarios_titular_documento_check;
alter table public.dados_bancarios
  add constraint dados_bancarios_titular_documento_check
  check (titular_documento is null or titular_documento ~ '^([0-9]{11}|[0-9]{14})$');

comment on column public.dados_bancarios.titular_documento is 'CPF (11 dígitos) ou CNPJ (14) do titular da conta, só dígitos. Comparado com o favorecido da ordem na regra "Conta de outro titular". [lgpd:identificacao]';
