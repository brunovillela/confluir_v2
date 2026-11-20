-- POR QUÊ: Gestão › Inteligência Artificial (20/11/2026). Um único modelo valia
--   para todas as chamadas de IA da entidade. A maior alavanca de custo é usar
--   um modelo barato nos processos simples (redigir texto curto) e o mais
--   forte só onde precisa (ler PDF, CAT, contracheque). Com modelos
--   diferentes, o custo estimado precisa do preço de cada modelo.
-- COMO: duas colunas jsonb em ia_config:
--   - modelos_processo: { "<chave do processo>": "<modelo>" } — processo sem
--     entrada usa o modelo geral (ia_config.modelo) ou o padrão da plataforma;
--   - precos_modelos: { "<modelo>": { "entrada": n, "cache": n, "saida": n } }
--     em US$ por 1 milhão de tokens — modelo sem entrada usa os preços gerais
--     só se for o modelo geral; senão o custo da chamada fica sem estimativa.
--   Idempotente.

alter table public.ia_config
  add column if not exists modelos_processo jsonb not null default '{}'::jsonb,
  add column if not exists precos_modelos jsonb not null default '{}'::jsonb;

comment on column public.ia_config.modelos_processo is 'Modelo de IA por processo: {"<chave do processo de lib/ia-processos.ts>": "<modelo>"}. Processo ausente usa o modelo geral. [lgpd:nenhum]';
comment on column public.ia_config.precos_modelos is 'Preços por modelo, em US$ por 1 milhão de tokens: {"<modelo>": {"entrada": n, "cache": n, "saida": n}}, para estimar o custo das chamadas que usam modelos além do geral. [lgpd:nenhum]';
