-- Confluir — Eventos: fechar as inscrições à mão
--
-- POR QUÊ: a inscrição só fechava sozinha (prazo configurado, vagas
-- esgotadas, evento adiado/cancelado). Quem organiza precisa poder fechar
-- antes — a lista já serve, o espaço mudou — sem apagar o prazo configurado,
-- que é o que decide se dá para reabrir depois.
--
-- COMO: inscricoes_encerradas_em (quando foi fechada) e
-- inscricoes_encerradas_por (quem fechou). Preenchida, `inscricoesAbertas`
-- (lib/db/eventos.ts) responde "fechada" para o link público e o portal; a
-- reserva interna de convidados não passa por ela e continua possível.
-- Reabrir limpa as duas, e só é oferecido enquanto o prazo configurado não
-- terminou. Idempotente.

alter table public.eventos
  add column if not exists inscricoes_encerradas_em timestamptz,
  add column if not exists inscricoes_encerradas_por uuid;

comment on column public.eventos.inscricoes_encerradas_em is 'Quando quem organiza fechou as inscrições à mão (antes do prazo). Preenchida: o link público e o portal não aceitam inscrição. Reabrir limpa. [lgpd:nenhum]';
comment on column public.eventos.inscricoes_encerradas_por is 'Usuário (usuarios.id) que fechou as inscrições à mão. [lgpd:nenhum]';
