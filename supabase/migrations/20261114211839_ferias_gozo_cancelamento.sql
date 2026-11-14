-- Férias: o gozo cancelado fica no histórico (14/11/2026).
--
-- Antes, cancelar apagava a linha. Agora o cancelamento só carimba quando e
-- quem cancelou; os dias voltam ao saldo porque as leituras de saldo, partes,
-- pendências, aviso, ausência e movimento da folha ignoram o gozo cancelado.
-- `autorizado` fica como estava, para o histórico mostrar se as férias já
-- estavam autorizadas quando foram canceladas.

ALTER TABLE public.pessoal_ferias_gozo
  ADD COLUMN IF NOT EXISTS cancelado_em timestamptz,
  ADD COLUMN IF NOT EXISTS cancelado_por uuid REFERENCES public.usuarios(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.pessoal_ferias_gozo.cancelado_em IS
  'Quando o gozo foi cancelado (null = vigente). Cancelado não conta no saldo nem nas 3 partes do período; fica só como histórico.';
COMMENT ON COLUMN public.pessoal_ferias_gozo.cancelado_por IS
  'Quem cancelou: o próprio funcionário (até o início das férias) ou alguém da gestão de pessoal.';
