-- Confluir — Finalizar contrato
--
-- POR QUÊ: o contrato só "acabava" deixando a vigência passar — e aí aparecia
-- como VENCIDO, que sugere pendência (renovar, regularizar). Não havia como
-- dizer que ele foi cumprido, rescindido ou substituído e está encerrado.
--
-- COMO: finalizado_em (a data do encerramento), finalizado_por (quem
-- finalizou) e finalizacao_motivo (o motivo e a observação). Com a data, a
-- vigência do contrato passa a ser "finalizado" (lib/contratos-constantes),
-- fora de vigentes/vencendo/vencidos e dos alertas. Reabrir limpa os três.
-- A coluna legada `ativo` acompanha (false finalizado). Idempotente.

alter table public.contratos
  add column if not exists finalizado_em date,
  add column if not exists finalizado_por uuid,
  add column if not exists finalizacao_motivo text;

comment on column public.contratos.finalizado_em is 'Data em que o contrato foi finalizado (cumprido, rescindido, substituído). Preenchida: a vigência é "finalizado", não vencido. [lgpd:nenhum]';
comment on column public.contratos.finalizado_por is 'Usuário (usuarios.id) que finalizou o contrato. [lgpd:nenhum]';
comment on column public.contratos.finalizacao_motivo is 'Motivo da finalização e a observação de quem finalizou. [lgpd:nenhum]';
