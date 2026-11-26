-- Confluir — Ordem de contrato: parcela ou pagamento avulso
--
-- POR QUÊ: o contrato tem dois tipos de pagamento — as PARCELAS previstas
-- (pagamentos ordinários, numerados: parcela 1, 2, 3…) e os pagamentos
-- AVULSOS (extraordinário ou sob demanda). Nada na ordem dizia qual era: a
-- "parcela X/N" só ia na descrição e era contada por geração (gerar um mês
-- por vez dava ordens sem número), e o pagamento extraordinário era só a
-- periodicidade "única". Em produção, 180 das 435 ordens de contrato geradas
-- no sistema novo saíram como avulsas — muitas delas mensalidades (água,
-- telefone, rádio) geradas uma a uma — e quem opera não via a diferença.
--
-- COMO: coluna contrato_pagamento ('parcela' | 'avulso'). O número da
-- parcela não é gravado: a tela conta as parcelas não canceladas do contrato
-- por vencimento. Backfill das ordens de contrato do sistema novo (sem
-- bubble_id): parcela quando a descrição traz "parcela X/N", a autorização é
-- a da parcela recorrente, a ordem espera o documento fiscal, ou o evento de
-- criação diz que nasceu autorizada pelo contrato / aguarda o documento; as
-- demais (inclusive RPA) são avulsas. Ordens do sistema anterior ficam nulas
-- ("do sistema anterior"). Idempotente: só preenche o que está nulo.

alter table public.ordens_pagamento
  add column if not exists contrato_pagamento text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'ordens_pagamento_contrato_pagamento_check'
  ) then
    alter table public.ordens_pagamento
      add constraint ordens_pagamento_contrato_pagamento_check
      check (contrato_pagamento is null or contrato_pagamento in ('parcela', 'avulso'));
  end if;
end $$;

comment on column public.ordens_pagamento.contrato_pagamento is 'Ordem de contrato: parcela prevista (numerada na tela pela ordem dos vencimentos) ou pagamento avulso (extraordinário ou sob demanda). Nulo: não é de contrato ou veio do sistema anterior. [lgpd:nenhum]';

update public.ordens_pagamento o
set contrato_pagamento = case
  when coalesce(o.tipo, '') <> 'RPA' and (
    o.descricao ~* 'parcela [0-9]+/[0-9]+'
    or o.autorizacao_observacao ilike 'Parcela recorrente%'
    or o.situacao = 'Aguardando documento fiscal'
    or exists (
      select 1 from public.ordens_pagamento_eventos e
      where e.ordem_id = o.id
        and e.tipo = 'criada'
        and (e.descricao ilike '%Nasceu autorizada%' or e.descricao ilike '%aguarda o documento fiscal%')
    )
  ) then 'parcela'
  else 'avulso'
end
where o.contrato_id is not null
  and o.bubble_id is null
  and o.contrato_pagamento is null;
