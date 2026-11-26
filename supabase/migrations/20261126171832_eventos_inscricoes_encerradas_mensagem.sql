-- Confluir — Eventos: mensagem de quem fecha as inscrições
--
-- POR QUÊ: fechadas à mão (20261126165654), as inscrições mostravam só "As
-- inscrições foram encerradas." a quem chegava tarde — e a pessoa liga para
-- perguntar o que fazer. Quem fecha sabe a resposta (vagas esgotadas, nova
-- turma, falar com a secretaria).
--
-- COMO: inscricoes_encerradas_mensagem, texto opcional digitado ao fechar.
-- `inscricoesAbertas` (lib/db/eventos.ts) o acrescenta ao motivo que a página
-- pública e o portal exibem. Reabrir limpa, junto com a data e o autor.
-- Idempotente.

alter table public.eventos
  add column if not exists inscricoes_encerradas_mensagem text;

comment on column public.eventos.inscricoes_encerradas_mensagem is 'Mensagem opcional de quem fechou as inscrições à mão, exibida a quem tenta se inscrever (página pública e portal). Reabrir limpa. [lgpd:nenhum]';
