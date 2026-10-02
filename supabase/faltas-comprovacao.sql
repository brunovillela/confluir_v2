-- Confluir — Faltas justificadas: comprovação obrigatória e trava (2026-10-02)
--
-- Duas decisões novas nas Configurações das faltas:
--   exige_comprovacao     — a falta precisa ser comprovada. Falta já ocorrida
--                           pede o arquivo no pedido; falta futura recebe o
--                           arquivo depois ("Anexar comprovação" no Meu perfil).
--   trava_sem_comprovacao — a falta AUTORIZADA mais recente sem comprovação
--                           trava um novo pedido do funcionário. Só contam as
--                           lançadas no Confluir (bubble_id nulo): as migradas
--                           quase nunca têm arquivo e travariam todo mundo.
--
-- Padrão da casa: idempotente. Executar UMA VEZ, depois de faltas-justificadas.sql.

alter table public.pessoal_faltas_config
  add column if not exists exige_comprovacao boolean not null default false;
alter table public.pessoal_faltas_config
  add column if not exists trava_sem_comprovacao boolean not null default false;

notify pgrst, 'reload schema';
