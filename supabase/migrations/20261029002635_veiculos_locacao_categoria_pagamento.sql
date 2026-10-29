-- Confluir — Veículos: categoria dos pagamentos do contrato de locação (29/10/2026)
--
-- POR QUÊ: o contrato de locação não paga só a mensalidade. Vêm também a TAG
-- (pedágio automático, "Sem parar"), as multas de trânsito, o seguro e outras
-- taxas. Até aqui tudo saía como "Locação de veículos - Mensalidade", o resumo
-- do contrato somava a TAG como se fosse aluguel e a auditoria acusava "valor
-- diferente do contratado" numa multa. O Bubble já distinguia isso no campo
-- Tipo da ordem, e as 389 ordens migradas guardam esse texto em `tipo`.
--
-- COMO:
--  1. `ordens_pagamento.categoria_locacao` (locacao | tag | infracao | seguro |
--     outras), só para ordens de contrato de locação. O `tipo` NÃO muda: é por
--     ele que o Financeiro reconhece a origem "locação" e aplica as regras.
--  2. Histórico do Bubble: categoria a partir do Tipo — Mensalidade e
--     Esporádico = locação; Pagamento automático (Sem parar) = TAG; Multa de
--     trânsito = infração; Manutenção / reparo = outras. Os 7 de Tipo vazio
--     (jun-jul/2023): acima de R$ 1.000 = locação (mensalidades de R$ 3,6 a 4,2
--     mil); os de R$ 125 e R$ 187 = outras. Seguro não existia no Bubble.
--  3. As 3 multas que entraram no Bubble depois da migração de setembro e
--     ficaram sem o contrato: ligadas pelo contrato a que o Bubble as
--     vinculou (ORDENS DE PAGTO).
-- Idempotente.

alter table public.ordens_pagamento
  add column if not exists categoria_locacao text
    check (categoria_locacao in ('locacao', 'tag', 'infracao', 'seguro', 'outras'));

comment on column public.ordens_pagamento.categoria_locacao is 'Categoria do pagamento de um contrato de locação de veículos: locacao (mensalidade/diárias), tag (pedágio automático), infracao (multa de trânsito), seguro, outras (taxas, reparos). Nulo fora da locação. [lgpd:nenhum]';

-- ── 3. Multas sem o contrato (Bubble: ordem → contrato) ─────────────────────
update public.ordens_pagamento o
set contrato_aluguel_id = c.id
from (values
  ('1781785146892x963477883406254100', '1781000742898x851962778506231800'),
  ('1784306438412x629399697973313500', '1782928098864x413506639119253500'),
  ('1784305960915x422007012011540500', '1782928098864x413506639119253500')
) as v(ordem_bubble, contrato_bubble)
join public.veiculo_contratos_aluguel c on c.bubble_id = v.contrato_bubble
where o.bubble_id = v.ordem_bubble
  and o.contrato_aluguel_id is null;

-- ── 2. Categoria das ordens de locação já existentes ────────────────────────
update public.ordens_pagamento
set categoria_locacao = case
  when tipo ilike '%sem parar%' or tipo ilike '%pagamento automático%' then 'tag'
  when tipo ilike '%multa%' then 'infracao'
  when tipo ilike '%seguro%' then 'seguro'
  when tipo ilike '%manuten%' or tipo ilike '%reparo%' then 'outras'
  when tipo ilike '%mensalidade%' or tipo ilike '%esporádico%' or tipo ilike '%esporadico%' then 'locacao'
  when coalesce(valor_inicial_cobranca, 0) >= 1000 then 'locacao'
  else 'outras'
end
where contrato_aluguel_id is not null
  and categoria_locacao is null;
