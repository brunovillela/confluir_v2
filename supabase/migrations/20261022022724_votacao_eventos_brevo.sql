-- Confluir — Votação: eventos de entrega da Brevo no apto (22/10/2026)
--
-- POR QUÊ: na Halliburton (21/10) só se descobriu consultando a Brevo à mão
-- que os links foram entregues e que os cliques eram do robô de segurança da
-- empresa (segundos depois da entrega), não de gente. A fase 4 do plano
-- (docs/plano-votacao-entrega-preparacao.md) traz esses eventos para dentro:
-- o webhook da Brevo (/api/webhooks/brevo) grava, por apto, a entrega do
-- aviso com o link pessoal, o clique de gente × o do robô, e a rejeição
-- definitiva do endereço (que passa a contar como "sem link").
--
-- COMO: quatro colunas em voto_assembleias_aptos, preenchidas pelo webhook a
-- partir do cabeçalho X-Mailin-custom que o envio põe em cada e-mail de
-- votação (entidade, tipo e apto). Só datas e o motivo curto da rejeição.
-- Idempotente.

alter table public.voto_assembleias_aptos
  add column if not exists email_entregue_em timestamptz,
  add column if not exists email_clique_humano_em timestamptz,
  add column if not exists email_clique_robo_em timestamptz,
  add column if not exists email_rejeicao text;

comment on column public.voto_assembleias_aptos.email_entregue_em is 'Brevo: quando o aviso com o link pessoal foi entregue ao servidor do destinatário (último envio). [lgpd:identificacao]';
comment on column public.voto_assembleias_aptos.email_clique_humano_em is 'Brevo: primeiro clique no aviso com o link pessoal mais de 2 min depois da entrega — gente, não o robô de segurança. [lgpd:identificacao]';
comment on column public.voto_assembleias_aptos.email_clique_robo_em is 'Brevo: clique no aviso até 2 min depois da entrega — típico do robô de segurança da empresa, que abre todos os links. [lgpd:identificacao]';
comment on column public.voto_assembleias_aptos.email_rejeicao is 'Brevo: rejeição definitiva do aviso (hard_bounce, invalid_email, blocked, spam) com o motivo curto; o apto passa a contar como sem link. [lgpd:identificacao]';
