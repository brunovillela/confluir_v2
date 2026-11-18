-- Confluir — Tipo da chave Pix nas contas de recebimento do hotel
--
-- POR QUÊ: todo cadastro de conta do sistema pede o tipo da chave Pix na
-- lista única (CNPJ / CPF, Telefone, E-mail, Chave aleatória — TIPOS_CHAVE_PIX),
-- menos o Portal do hotel, onde o hotel digitava só a chave. Sem o tipo, a
-- chave não era conferida e o dado bancário que a fatura cria para a ordem
-- nascia sem tipo em dados_bancarios.
--
-- COMO: coluna chave_pix_tipo; as chaves já cadastradas recebem o tipo
-- deduzido pelo formato (o mesmo critério de deduzirTipoPix em lib/bancos:
-- @ = e-mail, UUID = aleatória, + = telefone, 14 dígitos = CNPJ, 11 dígitos =
-- CPF — sem conferir o dígito, raro em conta de hotel —, 10/12/13 = telefone).
-- Formato irreconhecível fica nulo. Idempotente.

alter table public.hospedagem_hotel_contas
  add column if not exists chave_pix_tipo text;

comment on column public.hospedagem_hotel_contas.chave_pix_tipo is 'Tipo da chave Pix (CNPJ / CPF, Telefone, E-mail ou Chave aleatória). [lgpd:nenhum]';

update public.hospedagem_hotel_contas
set chave_pix_tipo = case
  when chave_pix like '%@%' then 'E-mail'
  when chave_pix ~* '^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$' then 'Chave aleatória'
  when btrim(chave_pix) like '+%' then 'Telefone'
  when length(regexp_replace(chave_pix, '\D', '', 'g')) in (11, 14) then 'CNPJ / CPF'
  when length(regexp_replace(chave_pix, '\D', '', 'g')) in (10, 12, 13) then 'Telefone'
  else null
end
where chave_pix is not null and btrim(chave_pix) <> '' and chave_pix_tipo is null;
