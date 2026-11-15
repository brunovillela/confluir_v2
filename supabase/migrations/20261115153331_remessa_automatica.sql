-- Confluir — remessa do mês criada sozinha (controle de envio das relações)
--
-- POR QUÊ: a remessa de cada competência × tipo era criada à mão em Receitas;
-- até alguém criá-la, o controle de envio não tinha onde lançar a relação
-- ("Criar a remessa" em vez de "Lançar a relação"). Com o controle ativado, o
-- Confluir passa a criar sozinho a remessa das competências que já deveriam
-- existir, nos tipos controlados.
--
-- COMO:
--  1. Índice único (entidade, competência, tipo) em filiacao_recebe_remessa:
--     a criação automática pode rodar em duas telas ao mesmo tempo e não pode
--     duplicar. Conferido em produção (15/11/2026): nenhuma duplicata.
--  2. filiacao_recebe_remessa.criada_automaticamente: marca as criadas pelo
--     controle (para a tela dizer de onde vieram).
--  3. empresa.filiacao_remessa_automatica: a entidade liga ou desliga (padrão
--     ligado; só age com o controle de envio ativado).
-- Idempotente.

create unique index if not exists filiacao_recebe_remessa_competencia_tipo
  on public.filiacao_recebe_remessa (emp_proprietaria_id, ordem, tipo)
  where ordem is not null and tipo is not null;

alter table public.filiacao_recebe_remessa
  add column if not exists criada_automaticamente boolean not null default false;

alter table public.empresa
  add column if not exists filiacao_remessa_automatica boolean not null default true;

comment on column public.filiacao_recebe_remessa.criada_automaticamente is 'Remessa criada sozinha pelo controle de envio das relações (15/11/2026), não por uma pessoa. [lgpd:nenhum]';
comment on column public.empresa.filiacao_remessa_automatica is 'O controle de envio cria sozinho a remessa das competências dos tipos controlados (só com o controle ativado). [lgpd:nenhum]';
