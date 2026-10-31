-- Atas de reunião: permissão de CONSULTA separada da de edição.
--
-- POR QUÊ: a permissão `diretoria_reunioes` servia para ver, criar, editar e
-- excluir atas — não havia como deixar alguém consultar as deliberações sem
-- poder alterá-las (31/10/2026).
--
-- COMO: coluna `diretoria_atas_consulta` em `permissoes`. Quem tem
-- `diretoria_reunioes` continua fazendo tudo (editar inclui consultar); quem
-- tem só a consulta vê a lista e as atas, sem Nova ata, Editar ou Excluir.
-- Idempotente.

alter table public.permissoes
  add column if not exists diretoria_atas_consulta boolean default false;

comment on column public.permissoes.diretoria_atas_consulta is 'Atas de reunião: só consultar (lista, ata e PDF), sem criar, editar ou excluir — isso é diretoria_reunioes. [lgpd:nenhum]';
comment on column public.permissoes.diretoria_reunioes is 'Atas de reunião: criar, editar e excluir (inclui consultar). [lgpd:nenhum]';
