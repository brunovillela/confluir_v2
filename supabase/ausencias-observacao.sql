-- Tipo da ausência vira lista fechada; o detalhe vai para a observação.
--
-- `pessoal_ausencias.motivo` já era a lista do Bubble (falta justificada,
-- afastamento médico, férias, compensação de banco de horas), mas o campo era
-- texto livre e recebeu descrições soltas ("Trabalho externo - Seminário da
-- Mulher"). A partir de agora o tipo é escolhido numa lista e o que era
-- descrição passa a viver em `observacao`.
--
-- A reclassificação dos registros antigos é feita por
-- `node scripts/reclassificar-ausencias.mjs --aplicar` (dry-run por padrão).
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.pessoal_ausencias
  add column if not exists observacao text;

notify pgrst, 'reload schema';
