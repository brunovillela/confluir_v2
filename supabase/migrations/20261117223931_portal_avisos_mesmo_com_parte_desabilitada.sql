-- Confluir — Aviso do portal que sai mesmo com a parte desabilitada
--
-- POR QUÊ: com uma parte do portal desabilitada (Filiados › Área do
-- associado), os avisos que levam a ela não saem e os já gravados somem do
-- sino, da lista e do Início. Alguns avisos, porém, são consequência de algo
-- que a pessoa já fez e precisam chegar assim mesmo — a falta numa reserva
-- confirmada, que conta para a regra de punição, ou a vaga cancelada pelo
-- sindicato. Eles eram gravados (avisarFiliado com mesmoComParteDesabilitada),
-- mas os leitores os escondiam pela regra da parte: quem desligou o e-mail de
-- Hospedagem não ficava sabendo da falta. Análise de 16/11/2026.
--
-- COMO: uma marca no próprio aviso, gravada só quando a exceção vale; os
-- leitores do sino, da lista e do Início não aplicam a regra da parte
-- desabilitada às linhas marcadas. Idempotente.

alter table public.portal_avisos
  add column if not exists mesmo_com_parte_desabilitada boolean not null default false;

comment on column public.portal_avisos.mesmo_com_parte_desabilitada is 'O aviso aparece no sino, na lista e no Início mesmo com a parte do portal desabilitada (consequência de algo que a pessoa já fez, ex.: falta numa reserva). [lgpd:nenhum]';
