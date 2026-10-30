-- Confluir — Oposição: instruções, aviso de privacidade e perguntas frequentes (30/10/2026)
--
-- POR QUÊ: antes da campanha grande, o pedido do Bruno: quem entra na
-- oposição lê as instruções da campanha (prazo, carta, decisões jurídicas) e
-- o aviso de privacidade e clica em "Li e quero prosseguir" — para ninguém
-- dizer depois que não foi avisado; e a campanha traz perguntas frequentes,
-- as do sistema e as que quem cadastrou escreveu para aquela campanha.
--
-- COMO:
--  1. `oposicao_campanha.perguntas_frequentes`: lista [{pergunta, resposta}]
--     escrita por quem cadastrou a campanha (as gerais vêm do sistema).
--  2. `oposicao_regras.aviso_privacidade`: o aviso de privacidade da oposição
--     da entidade; nulo = o texto padrão do sistema.
--  3. `oposicao_opositor.ciencia_*`: o que a pessoa leu e aceitou (instruções
--     + aviso, texto inteiro e hash) e quando — gravado no ato, como a
--     declaração.
-- Idempotente.

-- ── 1. Perguntas frequentes da campanha ─────────────────────────────────────
alter table public.oposicao_campanha
  add column if not exists perguntas_frequentes jsonb not null default '[]'::jsonb;

comment on column public.oposicao_campanha.perguntas_frequentes is 'Perguntas frequentes próprias da campanha, escritas por quem a cadastrou: lista de {pergunta, resposta}. As gerais vêm do sistema (lib/oposicao-orientacoes.ts). [lgpd:nenhum]';

-- ── 2. Aviso de privacidade da entidade ─────────────────────────────────────
alter table public.oposicao_regras
  add column if not exists aviso_privacidade text;

comment on column public.oposicao_regras.aviso_privacidade is 'Aviso de privacidade da oposição (o que é coletado, para quê, com quem é compartilhado, por quanto tempo); nulo = o texto padrão do sistema. [lgpd:nenhum]';

-- ── 3. Ciência registrada no ato ────────────────────────────────────────────
alter table public.oposicao_opositor
  add column if not exists ciencia_texto text,
  add column if not exists ciencia_hash text,
  add column if not exists ciencia_em timestamptz;

comment on column public.oposicao_opositor.ciencia_texto is 'Instruções da campanha e aviso de privacidade como a pessoa os leu antes de se opor (texto inteiro). [lgpd:identificacao]';
comment on column public.oposicao_opositor.ciencia_hash is 'sha256 do ciencia_texto. [lgpd:nenhum]';
comment on column public.oposicao_opositor.ciencia_em is 'Quando a pessoa clicou em "Li e quero prosseguir". [lgpd:identificacao]';
