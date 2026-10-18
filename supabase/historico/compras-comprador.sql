-- Confluir — papel "Comprador" em Aquisições (2026-08-28)
--
-- Permissão dedicada para quem opera os processos Via Compras (cotar, escolher
-- proposta, registrar compra), separando-o de quem só cadastra a solicitação.
-- As permissões são colunas boolean de `permissoes` (ver lib/permissoes-catalogo.ts);
-- `select *` já expõe a coluna nova ao mapa de permissões. Idempotente.

alter table permissoes
  add column if not exists aquisicoes_comprador boolean not null default false;
