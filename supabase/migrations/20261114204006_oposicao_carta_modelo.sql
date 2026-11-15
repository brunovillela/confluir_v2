-- Confluir — Oposição: texto da carta editável, com referências (14/11/2026)
--
-- POR QUÊ: pedido do usuário. O texto da carta de oposição era fixo no
-- código. O jurídico da entidade precisa poder ajustá-lo — no padrão da
-- entidade e, quando preciso, numa campanha —, vendo o modelo com as
-- referências ([NOME_COMPLETO], [CPF]…) que o sistema troca pelos dados de
-- cada pessoa. E o "documento-modelo" (PDF em branco anexado à campanha)
-- deixa de ser oferecido: a carta gerada já sai preenchida.
--
-- COMO:
--  1. oposicao_regras.carta_modelo (+ quem/quando): o padrão da entidade;
--     nulo = o texto padrão do sistema.
--  2. oposicao_campanha.carta_modelo (+ quem/quando): o texto da campanha;
--     nulo = segue o padrão da entidade.
--  3. oposicao_opositor.carta_modelo: o modelo que valia quando a pessoa
--     registrou a oposição. A carta (e o resumo SHA-256 da carta assinada)
--     usa este, não o atual — mudar o texto não muda carta já registrada.
--     Nulo nas oposições antigas = o texto padrão do sistema (o de antes).
--  4. documento_modelo_url fica (dados antigos), marcada como descontinuada.
-- Idempotente.

alter table public.oposicao_regras
  add column if not exists carta_modelo text,
  add column if not exists carta_modelo_por_nome text,
  add column if not exists carta_modelo_em timestamptz;

alter table public.oposicao_campanha
  add column if not exists carta_modelo text,
  add column if not exists carta_modelo_por_nome text,
  add column if not exists carta_modelo_em timestamptz;

alter table public.oposicao_opositor
  add column if not exists carta_modelo text;

comment on column public.oposicao_regras.carta_modelo is
  'Modelo da carta de oposição da entidade, com referências [NOME_COMPLETO] etc. (src/lib/oposicao-carta.ts); nulo = texto padrão do sistema. [lgpd:nenhum]';
comment on column public.oposicao_regras.carta_modelo_por_nome is
  'Quem alterou por último o modelo da carta. [lgpd:identificacao]';
comment on column public.oposicao_regras.carta_modelo_em is
  'Quando o modelo da carta foi alterado por último. [lgpd:nenhum]';
comment on column public.oposicao_campanha.carta_modelo is
  'Modelo da carta próprio da campanha; nulo = segue o da entidade (oposicao_regras.carta_modelo). [lgpd:nenhum]';
comment on column public.oposicao_campanha.carta_modelo_por_nome is
  'Quem alterou por último o modelo da carta da campanha. [lgpd:identificacao]';
comment on column public.oposicao_campanha.carta_modelo_em is
  'Quando o modelo da carta da campanha foi alterado por último. [lgpd:nenhum]';
comment on column public.oposicao_opositor.carta_modelo is
  'Modelo da carta em vigor quando a oposição foi registrada (a carta e o hash da assinatura usam este); nulo = texto padrão do sistema. [lgpd:nenhum]';
comment on column public.oposicao_campanha.documento_modelo_url is
  'DESCONTINUADA em 14/11/2026: PDF-modelo em branco que era oferecido ao trabalhador; a carta gerada pelo sistema o substitui. Mantida pelos dados antigos. [lgpd:nenhum]';
