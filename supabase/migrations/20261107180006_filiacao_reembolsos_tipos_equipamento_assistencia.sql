-- Confluir — Reembolsos a filiados: tipos "equipamento" e "assistencia_social" (07/11/2026)
--
-- POR QUÊ: dos 26 reembolsos que ficaram como 'outro' no Sindipetro, quatro
-- são compra de equipamento para diretor usar na entidade (notebook, celular,
-- manutenção) e três são atendimentos pelo serviço social — naturezas que se
-- repetem e que a diretoria quer separar das demais nos totais por tipo.
--
-- COMO: o check de `tipo` passa a aceitar 'equipamento' (equipamento ou
-- material para a entidade) e 'assistencia_social' (assistência pelo serviço
-- social). A reclassificação dos lançamentos existentes é feita à parte,
-- item a item, conferida com o usuário — a migração só muda o domínio.
-- Idempotente (drop/add do check).

alter table public.filiacao_reembolsos
  drop constraint if exists filiacao_reembolsos_tipo_check;

alter table public.filiacao_reembolsos
  add constraint filiacao_reembolsos_tipo_check
  check (tipo in (
    'desconto_greve', 'despesa_atividade', 'cobranca_indevida',
    'equipamento', 'assistencia_social', 'outro'
  ));

comment on column public.filiacao_reembolsos.tipo is 'Natureza do reembolso: desconto_greve, despesa_atividade, cobranca_indevida, equipamento (equipamento ou material para a entidade), assistencia_social (assistência pelo serviço social) ou outro; o histórico foi classificado pelo texto da justificativa. [lgpd:sensivel_sindical]';
