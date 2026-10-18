-- Votação online — fase 4 do plano de adequação (docs/plano-votacao-online-adequacao.md).
--
-- Por onde cada pessoa entrou para votar, gravado no APTO (a participação),
-- nunca no voto — que continua anônimo em voto_online. Valores
-- (src/lib/votacao-canais.ts):
--
--   link_pessoal         link pessoal do e-mail de aviso (ou mandado por WhatsApp)
--   link_unico_email     link geral (/votar) com código no e-mail pessoal
--   link_unico_telegram  link geral (/votar) confirmado pelo Telegram
--   codigo_email         código por e-mail na página da votação
--   portal               área do filiado (portal)
--
-- Urna presencial não precisa: o comprovante_canal já diz urna digital/física.
-- Votos anteriores ficam nulos ("não registrado").
--
-- Idempotente: pode rodar mais de uma vez.

alter table public.voto_assembleias_aptos
  add column if not exists acesso_canal text;

notify pgrst, 'reload schema';
