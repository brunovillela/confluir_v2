-- Aviso por e-mail aos aptos de uma rodada ("você está habilitado a votar").
--
-- Cada apto guarda quando foi processado pelo aviso, para qual e-mail e, se
-- não saiu, por quê. Assim o envio é feito em lotes, pode ser interrompido e
-- retomado, e quem entra na lista depois recebe só o dele — sem repetir.
--
--   aviso_email_em    quando o apto foi processado (enviado, sem e-mail ou falha)
--   aviso_email_para  e-mail usado (nulo quando não havia e-mail)
--   aviso_email_erro  nulo = enviado; 'sem_email'; 'duplicado' (o mesmo e-mail
--                     já recebeu por outro apto da rodada); 'falha' (o provedor
--                     recusou — dá para tentar de novo pelo painel)
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.voto_assembleias_aptos
  add column if not exists aviso_email_em timestamptz,
  add column if not exists aviso_email_para text,
  add column if not exists aviso_email_erro text;

-- Os pendentes de uma rodada saem por este índice (lotes de envio).
create index if not exists voto_assembleias_aptos_aviso_pendente_idx
  on public.voto_assembleias_aptos (rod_assembleia_id)
  where aviso_email_em is null;

notify pgrst, 'reload schema';
