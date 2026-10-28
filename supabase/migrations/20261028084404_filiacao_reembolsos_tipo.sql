-- Confluir — Reembolsos a filiados: tipo do reembolso (28/10/2026)
--
-- POR QUÊ: o motivo vivia só no texto livre da justificativa, e não dava para
-- filtrar nem somar por natureza ("quanto devolvemos da greve"). Dos ~1.900
-- lançamentos, ~850 devolvem desconto salarial de greve e ~900 são despesas
-- em atividade sindical (alimentação, transporte, diárias, congressos, atos).
--
-- COMO: coluna `tipo` (texto com check) — desconto_greve, despesa_atividade,
-- cobranca_indevida, outro — default 'outro'. O histórico é classificado pelo
-- texto da justificativa (sem acento, minúsculo), na ordem: desconto de greve,
-- cobrança indevida, despesa em atividade; o resto fica 'outro'. Só
-- classifica quem ainda está em 'outro' (idempotente; não desfaz ajuste
-- manual).

alter table public.filiacao_reembolsos
  add column if not exists tipo text not null default 'outro';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'filiacao_reembolsos_tipo_check'
  ) then
    alter table public.filiacao_reembolsos
      add constraint filiacao_reembolsos_tipo_check
      check (tipo in ('desconto_greve', 'despesa_atividade', 'cobranca_indevida', 'outro'));
  end if;
end $$;

create index if not exists ix_filiacao_reembolsos_tipo
  on public.filiacao_reembolsos (emp_proprietaria_id, tipo);

with base as (
  select id,
         translate(lower(coalesce(justificativa, '')),
                   'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') as t
    from public.filiacao_reembolsos
   where tipo = 'outro'
),
classe as (
  select id,
         case
           when (t like '%desconto%' and t like '%greve%')
             or t ~ '^reembolsos? de greve'
             then 'desconto_greve'
           when t ~ '(indevid|duplicidade|contribuicao assistencial|mensalidade|cobranc|estorno)'
             then 'cobranca_indevida'
           when t ~ '(aliment|janta|almoco|lanche|transporte|uber|passage|diaria|despesa|deslocamento|hosped|combustivel|pedagio|estacionamento|congresso|seminario|audiencia|plenaria|vigilia|trancaco|reuniao|encontro|confup|ato |ato$|greve|plantao|visita|vinda|ida |gasolina|abastec|translad|taxi|hotel|carro|locacao|assembleia|atividade|viage|palestra|aeroporto|congre)'
             then 'despesa_atividade'
           else null
         end as tipo
    from base
)
update public.filiacao_reembolsos r
   set tipo = c.tipo
  from classe c
 where r.id = c.id
   and c.tipo is not null;

comment on table public.filiacao_reembolsos is 'Reembolsos pagos ao filiado — desconto salarial de greve, cobrança indevida, despesa em atividade sindical —, com tipo, justificativa, projeto e ordem de pagamento. Migrado do Bubble (histórico do ACT). [lgpd:financeiro,sensivel_sindical|titulares:filiados]';
comment on column public.filiacao_reembolsos.tipo is 'Natureza do reembolso: desconto_greve, despesa_atividade, cobranca_indevida ou outro; o histórico foi classificado pelo texto da justificativa. [lgpd:sensivel_sindical]';
