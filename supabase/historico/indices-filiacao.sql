-- Confluir — índices das tabelas de filiação (medido em 2026-07-14)
-- Executar UMA VEZ no SQL Editor do Supabase, junto com setup-fase-3a.sql.
-- Script idempotente.
--
-- Por que: as FKs que apontam para `filiacoes` e `empresa` não têm índice
-- no snapshot migrado do Bubble. Consequências observadas em produção:
--   • DELETE em `empresa` e `filiacoes` estoura statement timeout (a
--     checagem de FK varre filiacao_recebe, 609k linhas, sequencialmente);
--   • contagens por fonte na página da fonte pagadora ocasionalmente
--     estouram timeout (o app trata, mas exibe "—");
--   • o perfil do filiado consulta contribuições por filiado_id a cada
--     visita.

-- filiacao_vinculos (10,8k linhas) — perfil, filtro por fonte, importação
create index if not exists filiacao_vinculos_filiado_idx
  on public.filiacao_vinculos (filiado_id);

create index if not exists filiacao_vinculos_fonte_idx
  on public.filiacao_vinculos (fonte_pagadora_id)
  where fonte_pagadora_id is not null;

-- filiacao_recebe (609k linhas) — contribuições do perfil e da fonte
create index if not exists filiacao_recebe_filiado_idx
  on public.filiacao_recebe (filiado_id)
  where filiado_id is not null;

create index if not exists filiacao_recebe_fonte_idx
  on public.filiacao_recebe (fonte_pg_id)
  where fonte_pg_id is not null;

create index if not exists filiacao_recebe_remessa_idx
  on public.filiacao_recebe (remessa_id)
  where remessa_id is not null;

-- vinculos_trabalhistas — vínculos empregatícios do perfil e do módulo Pessoal
create index if not exists vinculos_trabalhistas_filiado_idx
  on public.vinculos_trabalhistas (filiado_id)
  where filiado_id is not null;

create index if not exists vinculos_trabalhistas_empregador_idx
  on public.vinculos_trabalhistas (empregador_id)
  where empregador_id is not null;

-- Receitas: índice COBRINDO da leitura por remessa (adicionado 2026-07-15,
-- v2 — rode de novo se já executou a v1). Sem ele, o primeiro acesso a uma
-- remessa com cache frio faz ~6k leituras aleatórias no heap e pode estourar
-- o statement timeout; com ele a leitura é index-only e instantânea.
create index if not exists filiacao_recebe_remessa_cobertura_idx
  on public.filiacao_recebe (remessa_id, id)
  include (filiado_id, fonte_pg_id, valor, cpf, fonte_pg_matricula)
  where remessa_id is not null;

-- filiacoes — listagem filtra por condição; dashboard conta por condição/sexo
create index if not exists filiacoes_condicao_idx
  on public.filiacoes (filiacao_condicao);

create index if not exists filiacoes_matricula_idx
  on public.filiacoes (matricula_sindical)
  where matricula_sindical is not null;
