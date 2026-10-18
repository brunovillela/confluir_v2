-- Confluir — Ajudas institucionais + Entidades apoiadas (2026-08-01)
--
-- As "ajudas institucionais" são linhas de `contratos` com apoio_institucional=true
-- (226 já existentes). Elas saem do módulo Compras e passam a ser geridas no módulo
-- Institucional. O checkbox deixa de ser marcável: quem cria em Contratos grava
-- false; quem cria em Ajudas grava true.
--
-- As "entidades apoiadas" são linhas de `empresa` (mesma lógica dos fornecedores)
-- marcadas com a flag nova `entidade_apoiada`. O favorecido da ajuda continua sendo
-- `contratos.fornecedor_id` → `empresa`, então o pipeline de ordens não muda.
--
-- IMPORTANTE: as colunas de permissão DEVEM existir ANTES do catálogo entrar em
-- produção — `atualizarAcesso` grava TODAS as chaves no update e quebraria sem elas.

-- 1) Permissão dedicada da área (ver + editar) ------------------------------------
alter table public.permissoes
  add column if not exists apoio_institucional boolean default false;
alter table public.permissoes
  add column if not exists apoio_institucional_edicao boolean default false;

-- Concede aos administradores já existentes (linhas com usuario_id — hoje só o Bruno).
update public.permissoes
  set apoio_institucional = true, apoio_institucional_edicao = true
  where usuario_id is not null;

-- 2) Flag da entidade apoiada em `empresa` ---------------------------------------
alter table public.empresa
  add column if not exists entidade_apoiada boolean default false;
create index if not exists idx_empresa_entidade_apoiada
  on public.empresa (entidade_apoiada) where entidade_apoiada = true;

-- 3) Backfill: as empresas beneficiárias das ajudas já viram entidades apoiadas ---
update public.empresa e
  set entidade_apoiada = true
  from public.contratos c
  where c.fornecedor_id = e.id
    and c.apoio_institucional = true
    and c.deletado is not true;
