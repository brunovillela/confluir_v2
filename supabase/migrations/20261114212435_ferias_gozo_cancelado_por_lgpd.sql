-- POR QUÊ: a coluna pessoal_ferias_gozo.cancelado_por (20261114211839) aponta
-- para uma pessoa e saiu sem a etiqueta LGPD que o dicionário exige.
-- COMO: só refaz o comentário (idempotente), com [lgpd:identificacao], como
-- os demais "*_por" que guardam o usuário.

COMMENT ON COLUMN public.pessoal_ferias_gozo.cancelado_por IS
  'Quem cancelou: o próprio funcionário (até o início das férias) ou alguém da gestão de pessoal. [lgpd:identificacao]';
