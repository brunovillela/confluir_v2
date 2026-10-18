-- Forma de recebimento da contribuição do filiado (27/09/2026).
-- Fica na FILIAÇÃO (não no vínculo): Pix e boleto são da pessoa, não de uma
-- fonte pagadora. null = não informado. Valores em src/lib/filiacao.ts
-- (FORMAS_RECEBIMENTO). Idempotente.

alter table public.filiacoes
  add column if not exists forma_recebimento text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'filiacoes_forma_recebimento_check'
  ) then
    alter table public.filiacoes
      add constraint filiacoes_forma_recebimento_check
      check (forma_recebimento is null or forma_recebimento in ('consignado', 'pix', 'boleto'));
  end if;
end $$;

comment on column public.filiacoes.forma_recebimento is
  'Como a entidade recebe a contribuição: consignado (desconto em folha), pix ou boleto. null = não informado.';
