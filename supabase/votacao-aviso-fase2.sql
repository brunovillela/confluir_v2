-- Votação online — fase 2 do plano de adequação (docs/plano-votacao-online-adequacao.md).
--
-- 1) Primeiro envio do link pessoal. "Reenviar a quem não votou" e "Reenviar
--    para todos" zeram aviso_email_em para devolver o apto à fila — e com isso
--    se perdia QUANDO a pessoa recebeu o link pela primeira vez (na SLB não dava
--    para saber quantos receberam antes da abertura). aviso_primeiro_em só é
--    gravado no primeiro envio bem-sucedido e nunca é zerado.
--
-- 2) Tentativas automáticas. A falha do provedor volta sozinha para a fila uma
--    vez, 1 h depois, nas rodadas com envio automático ligado.
--
-- 3) Envio automático por rodada: aviso_auto_horas = quantas horas antes da
--    abertura da votação pela internet os links começam a sair sozinhos (nulo =
--    desligado). O tick de 15 em 15 minutos (/api/votacao/tick) envia aos
--    pendentes a partir daí — inclusive a quem entrar na lista depois.
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.voto_assembleias_aptos
  add column if not exists aviso_primeiro_em timestamptz,
  add column if not exists aviso_tentativas smallint not null default 0;

-- O que já foi enviado conta como primeiro envio (melhor estimativa possível:
-- quem foi reenviado fica com a data do último envio).
update public.voto_assembleias_aptos
   set aviso_primeiro_em = aviso_email_em
 where aviso_primeiro_em is null
   and aviso_email_em is not null
   and aviso_email_erro is null;

alter table public.voto_rod_assembleias
  add column if not exists aviso_auto_horas smallint
    check (aviso_auto_horas is null or aviso_auto_horas between 1 and 720);

-- O tick procura as rodadas com envio automático ligado.
create index if not exists voto_rod_assembleias_aviso_auto_idx
  on public.voto_rod_assembleias (emp_proprietaria_id)
  where aviso_auto_horas is not null;

notify pgrst, 'reload schema';
