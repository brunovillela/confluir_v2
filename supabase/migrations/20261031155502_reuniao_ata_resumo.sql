-- Ata de reunião: o campo de deliberações vira o RESUMO da reunião.
--
-- POR QUÊ: desde 20261031153653_reuniao_deliberacoes as decisões são itens
-- próprios (`reuniao_deliberacao`), com situação e sigilo. Manter na ata um
-- segundo texto com as mesmas decisões duplicaria a informação — e o texto
-- da ata não tem sigilo por item. O campo passa a ser um breve resumo da
-- reunião: o que se discutiu e o tom, sem repetir as decisões (31/10/2026).
--
-- COMO: renomeia `reuniao_ata.deliberacoes` para `resumo` (o texto antigo
-- fica como resumo; as decisões dele já foram copiadas para os itens pela
-- migração anterior). Idempotente.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reuniao_ata' and column_name = 'deliberacoes'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'reuniao_ata' and column_name = 'resumo'
  ) then
    alter table public.reuniao_ata rename column deliberacoes to resumo;
  end if;
end $$;

comment on column public.reuniao_ata.resumo is 'Breve resumo da reunião (o que se discutiu). As decisões ficam em reuniao_deliberacao, com situação e sigilo. [lgpd:identificacao]';
comment on table public.reuniao_ata is 'Ata de reunião da diretoria, conselho fiscal ou assembleia, ligada ao mandato, com pauta, resumo, presentes e o PDF; as deliberações ficam em reuniao_deliberacao. [lgpd:identificacao,sensivel_sindical|titulares:diretores e participantes]';
