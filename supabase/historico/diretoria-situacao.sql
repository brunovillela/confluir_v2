-- ============================================================================
-- Diretoria: situação de cada membro do mandato (2026-09-18). Idempotente —
-- rodar no SQL Editor.
--
-- Pedido do Bruno: cada linha de membro do mandato informa se está liberado,
-- licenciado ou excluído. "Liberado" já vem das liberações sindicais; faltava
-- registrar licença e exclusão. Em exercício é o padrão. Licenciado e excluído
-- não assinam ofícios (saem da lista de signatários).
-- ============================================================================

alter table diretoria_integrantes
  add column if not exists situacao text not null default 'exercicio';
alter table diretoria_integrantes drop constraint if exists diretoria_integrantes_situacao_check;
alter table diretoria_integrantes add constraint diretoria_integrantes_situacao_check
  check (situacao in ('exercicio', 'licenciado', 'excluido'));
alter table diretoria_integrantes add column if not exists situacao_desde date;
alter table diretoria_integrantes add column if not exists situacao_motivo text;

comment on column diretoria_integrantes.situacao is
  'exercicio | licenciado | excluido — licenciado e excluído não assinam ofícios.';

notify pgrst, 'reload schema';
