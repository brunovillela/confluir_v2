-- Ofícios: mais de um assinante.
--
-- POR QUÊ: o ofício só aceitava um assinante da diretoria
-- (`assinante_integrante_id`). Há ofícios assinados por mais de um diretor
-- (pedido de 06/11/2026). Todos recebem o convite juntos; o ofício é emitido
-- quando o último assina, e a recusa de qualquer um devolve ao rascunho.
--
-- COMO:
--   - `oficios.coassinantes`: os assinantes além do principal, na ordem do
--     documento. No rascunho, só o integrante; na emissão, ganha o retrato de
--     nome e cargo (como `assinante_nome`/`assinante_cargo` do principal).
--   - `documento_assinaturas.rodada`: um envio para vários assinantes cria um
--     envelope por pessoa, todos com a mesma rodada. É ela que diz quais
--     envelopes compõem o envio atual (uma recusa encerra a rodada; o novo
--     envio abre outra). Envelopes antigos ficam sem rodada: cada um é a sua.
-- Nada existente muda. Idempotente.

alter table public.oficios
  add column if not exists coassinantes jsonb not null default '[]'::jsonb;

comment on column public.oficios.coassinantes is 'Assinantes além do principal, na ordem do documento: [{integrante_id, nome, cargo}] (nome e cargo gravados na emissão). Vazio = só o assinante principal. [lgpd:identificacao]';

alter table public.documento_assinaturas
  add column if not exists rodada uuid;

comment on column public.documento_assinaturas.rodada is 'Envio do mesmo documento para vários assinantes ao mesmo tempo: os envelopes de um envio têm a mesma rodada. Nulo nos envios de um assinante só. [lgpd:nenhum]';

create index if not exists documento_assinaturas_rodada_idx
  on public.documento_assinaturas (rodada)
  where rodada is not null;
