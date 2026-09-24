-- Confluir — Cessão de espaços: quem compareceu à visita técnica (2026-09-24)
--
-- A visita técnica é obrigação de QUEM RECEBE o espaço: é ele que precisa
-- comparecer, ver o lugar e acertar o que for necessário. A entidade
-- acompanha, pelo responsável já registrado em `visita_responsavel_id`.
--
-- Faltava o outro lado: quem veio pelo solicitante. Sem isso, o parecer diz o
-- que ficou acertado mas não com quem — e é justamente essa pessoa que o termo
-- nomeia como responsável no dia.
--
-- Idempotente. Executar UMA VEZ.

alter table cessao_solicitacoes add column if not exists visita_participante text;

comment on column cessao_solicitacoes.visita_participante is
  'Quem compareceu à visita técnica pelo solicitante. A visita é obrigação de quem recebe o espaço; a entidade acompanha.';

notify pgrst, 'reload schema';
