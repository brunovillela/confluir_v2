-- Confluir — Pedidos de saúde do portal: some a Demanda e o sino antigos
-- (RIPD de saúde, docs/lgpd/ripd-saude.md, risco R2)
--
-- POR QUÊ: até o R2, o pedido do portal com assunto "saude" virava uma
-- Demanda em Ferramentas → Demandas, com o título, o primeiro nome e o CPF
-- completo do filiado no nome/descrição, visível a quem tem
-- ferramentas_demandas/ferramentas_tarefas — equipe não clínica. O código
-- novo já não cria essa Demanda e só mostra o pedido à equipe de saúde; esta
-- migração limpa o que ficou de antes. Conferido em 18/10/2026: nenhum
-- pedido de saúde no banco (a migração é limpeza preventiva, idempotente).
--
-- COMO:
--   1. as Demandas ligadas a pedidos de saúde (portal_atendimentos.assunto =
--      'saude') saem com o que depende delas — checklists, tarefas e
--      comentários, que também podem trazer o caso; a FK de
--      portal_atendimentos.demanda_id é ON DELETE SET NULL. A conversa com
--      o filiado continua em portal_atendimentos_mensagens, onde só a equipe
--      de saúde lê;
--   2. as notificações do sino que apontam para um pedido de saúde
--      (texto com nome e título) são apagadas.
-- Não toca nos pedidos de outros assuntos nem nas Demandas criadas à mão.

drop table if exists r2_demandas_saude;
create temporary table r2_demandas_saude as
select a.demanda_id as id
  from public.portal_atendimentos a
 where a.assunto = 'saude'
   and a.demanda_id is not null;

delete from public.demandas_departamentos dd
 using public.demandas_check_tarefas t
 where dd.tarefa_id = t.id
   and (t.demanda_id in (select id from r2_demandas_saude)
        or t.checklist_id in (select c.id from public.demandas_check c where c.demanda_id in (select id from r2_demandas_saude)));

delete from public.demandas_check_tarefas t
 where t.demanda_id in (select id from r2_demandas_saude)
    or t.checklist_id in (select c.id from public.demandas_check c where c.demanda_id in (select id from r2_demandas_saude));

delete from public.demandas_check c
 where c.demanda_id in (select id from r2_demandas_saude);

delete from public.demandas_comentarios m
 where m.demanda_id in (select id from r2_demandas_saude);

delete from public.demandas d
 where d.id in (select id from r2_demandas_saude);

delete from public.notificacoes n
 using public.portal_atendimentos a
 where a.assunto = 'saude'
   and n.link = '/painel/filiados/atendimentos/' || a.id::text;

drop table r2_demandas_saude;
