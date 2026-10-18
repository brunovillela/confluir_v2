-- CONTATO QUE RECEBE A ORDEM DE COMPRA (18/10/2026).
--
-- A ordem de compra só é enviada a contatos do fornecedor com e-mail e com
-- esta marcação. Sem nenhum, o botão "Enviar ao fornecedor" fica desabilitado.
--
-- Na primeira execução, o contato PRINCIPAL que tem e-mail já sai marcado
-- (era ele o sugerido no envio até aqui).
--
-- Idempotente: pode rodar mais de uma vez.

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'empresa_contatos' and column_name = 'recebe_ordem_compra'
  ) then
    alter table public.empresa_contatos add column recebe_ordem_compra boolean not null default false;
    update public.empresa_contatos
       set recebe_ordem_compra = true
     where principal and coalesce(trim(email), '') <> '';
  end if;
end $$;
