-- Configuração da SAÚDE DOS CADASTROS por categoria de fonte pagadora (09/10/2026).
-- Formato: { "<categoria>": { "<campo>": "pendencia" | "apontamento" | "normal" } }
--   categorias: empregador, fundo_pensao
--   campos: ver CAMPOS_SAUDE em src/lib/saude-cadastros.ts
-- null = padrão do sistema (tudo pendência, exceto cargo e lotação em fundo de
-- pensão). Configurado em Filiados › Saúde dos cadastros › ⚙. Idempotente.

alter table public.empresa
  add column if not exists filiacao_saude_config jsonb;

comment on column public.empresa.filiacao_saude_config is
  'Saúde dos cadastros: por categoria de fonte, o peso da falta de cada informação (pendencia, apontamento ou normal). null = padrão.';
