-- Recebimentos com forma de recebimento (27/09/2026).
--
-- 1. filiacao_recebe.forma_recebimento: a forma escolhida para a lista
--    importada (consignado, pix ou boleto). null = lançamento antigo (todos
--    vieram por fonte pagadora; a tela os mostra como consignado).
-- 2. filiacoes.forma_recebimento_ordem: competência (ano*100+mês da remessa)
--    que definiu a forma atual do cadastro. Uma importação só troca a forma
--    do filiado se a remessa for igual ou mais nova — subir uma remessa
--    antiga não desfaz a forma atual. null = definida à mão ou nunca definida.
--
-- Pré-requisito: supabase/filiacao-forma-recebimento.sql. Idempotente.

alter table public.filiacao_recebe
  add column if not exists forma_recebimento text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'filiacao_recebe_forma_recebimento_check'
  ) then
    alter table public.filiacao_recebe
      add constraint filiacao_recebe_forma_recebimento_check
      check (forma_recebimento is null or forma_recebimento in ('consignado', 'pix', 'boleto'));
  end if;
end $$;

comment on column public.filiacao_recebe.forma_recebimento is
  'Forma de recebimento da lista importada: consignado, pix ou boleto. null = lançamento anterior a 27/09/2026 (via fonte).';

alter table public.filiacoes
  add column if not exists forma_recebimento_ordem integer;

comment on column public.filiacoes.forma_recebimento_ordem is
  'Competência (ano*100+mês) da remessa que definiu forma_recebimento. Importações mais antigas não sobrescrevem.';
