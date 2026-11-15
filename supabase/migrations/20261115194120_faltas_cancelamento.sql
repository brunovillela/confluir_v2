-- POR QUÊ: a falta justificada cancelada era apagada — sumia o rastro de quem
-- cancelou uma falta já autorizada, e o movimento da folha não tinha como
-- avisar a contabilidade de uma falta abonada que ela já recebeu (15/11/2026).
-- COMO: o cancelamento passa a carimbar quando e quem (como o gozo de férias,
-- 20261114211839); as leituras de limite, ponto, pendências e folha ignoram a
-- cancelada. Idempotente.

ALTER TABLE public.pessoal_faltas_justificadas
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pessoal_faltas_justificadas.cancelado_em IS
  'Quando a falta foi cancelada (null = vigente). Cancelada não conta no limite, no ponto nem na folha; fica só como histórico.';
COMMENT ON COLUMN public.pessoal_faltas_justificadas.cancelado_por IS
  'Quem cancelou: o próprio funcionário (enquanto aguardava) ou a gestão de pessoal (já autorizada). [lgpd:identificacao]';
