-- Confluir — Votação: aviso pelo canal que o apto escolheu (22/10/2026)
--
-- POR QUÊ: na Halliburton (21/10) o link pessoal foi entregue ao e-mail
-- corporativo, mas só o robô de segurança da empresa o abriu: 927 de 969 votos
-- vieram pelo link geral + código. 971 pessoas cadastraram um e-mail pessoal
-- ou o Telegram no link geral, e mesmo assim o aviso e o reenvio continuaram
-- indo só para o corporativo (docs/plano-votacao-entrega-preparacao.md, fase 1).
--
-- COMO: o aviso passa a sair também para o contato que o apto confirmou no link
-- geral (email_contato e/ou telegram_chat_id). Marca própria, separada da do
-- e-mail corporativo, para que um não esconda o outro: quando saiu, por quais
-- canais e se falhou. Idempotente.

alter table public.voto_assembleias_aptos
  add column if not exists aviso_contato_em timestamptz,
  add column if not exists aviso_contato_canais text,
  add column if not exists aviso_contato_erro text;

comment on column public.voto_assembleias_aptos.aviso_contato_em is 'Quando o link pessoal saiu para o contato confirmado no link geral (e-mail pessoal e/ou Telegram); null = pendente. [lgpd:identificacao]';
comment on column public.voto_assembleias_aptos.aviso_contato_canais is 'Canais do aviso ao contato que deram certo: "email", "telegram" ou "email,telegram". [lgpd:identificacao]';
comment on column public.voto_assembleias_aptos.aviso_contato_erro is 'Falha do aviso ao contato: "falha" quando nenhum canal aceitou o envio. [lgpd:identificacao]';

-- Fila do aviso ao contato: quem tem contato e ainda não recebeu por ele.
create index if not exists voto_assembleias_aptos_aviso_contato_idx
  on public.voto_assembleias_aptos (emp_proprietaria_id, rod_assembleia_id)
  where aviso_contato_em is null and (email_contato is not null or telegram_chat_id is not null);
