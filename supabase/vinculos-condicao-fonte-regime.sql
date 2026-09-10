-- ============================================================================
-- Vínculo de filiação: condição na fonte pagadora + regime de trabalho
-- (2026-09-10, pedido do Bruno). Idempotente — rodar no SQL Editor.
--
-- • condicao_na_fonte: a condição do filiado NAQUELA fonte (diferente da
--   condição sindical, que é junto ao sindicato). Valores: 'Trabalhador(a) da
--   ativa' | 'Beneficiário(a) aposentado(a)' | 'Beneficiário(a) pensionista'
--   — os mesmos que o Bubble guardava no cadastro (FILIAÇÃO CONDIÇÃO FONTE).
--   Padrão: vínculo com EMPRESA → ativa; com FUNDO DE PENSÃO → aposentado.
-- • regime_trabalho (coluna já existia): 'Administrativo' | 'Ininterrupto de
--   revezamento' | 'Ininterrupto de revezamento offshore' | 'Misto'. O legado
--   trazia 'Administrativo' e 'Offshore' — este último vira o de revezamento
--   offshore.
-- ============================================================================

alter table filiacao_vinculos add column if not exists condicao_na_fonte text;
comment on column filiacao_vinculos.condicao_na_fonte is
  'Condição do filiado nesta fonte pagadora: Trabalhador(a) da ativa | Beneficiário(a) aposentado(a) | Beneficiário(a) pensionista.';

-- Carga inicial: usa a condição que o Bubble guardava no CADASTRO quando ela
-- combina com o tipo da fonte; senão, o padrão do tipo.
-- (No UPDATE ... FROM do Postgres, a tabela alvo não pode entrar num JOIN
-- do FROM — por isso o cadastro vem por subconsulta.)
update filiacao_vinculos v
set condicao_na_fonte = case
  when e.fundo_pensao = true then
    case
      when (select f.condicao_na_fonte from filiacoes f where f.id = v.filiado_id)
           in ('Beneficiário(a) aposentado(a)', 'Beneficiário(a) pensionista')
        then (select f.condicao_na_fonte from filiacoes f where f.id = v.filiado_id)
      else 'Beneficiário(a) aposentado(a)'
    end
  else 'Trabalhador(a) da ativa'
end
from empresa e
where e.id = v.fonte_pagadora_id
  and v.condicao_na_fonte is null;

-- Regime: normaliza o valor legado.
update filiacao_vinculos
set regime_trabalho = 'Ininterrupto de revezamento offshore'
where regime_trabalho = 'Offshore';

create index if not exists idx_filiacao_vinculos_condicao_fonte
  on filiacao_vinculos (fonte_pagadora_id, condicao_na_fonte);

-- ── Complemento 10/09 (já aplicado no banco via API; fica aqui para reprodução) ──
-- Regime vazio vira Administrativo (Bruno: pouco impacto, evita advertência).
update filiacao_vinculos
set regime_trabalho = 'Administrativo'
where regime_trabalho is null;

-- Condição vazia: fundo de pensão → aposentado; qualquer outra fonte, ou sem
-- fonte, → trabalhador da ativa.
update filiacao_vinculos v
set condicao_na_fonte = 'Beneficiário(a) aposentado(a)'
from empresa e
where e.id = v.fonte_pagadora_id and e.fundo_pensao = true
  and v.condicao_na_fonte is null;
update filiacao_vinculos
set condicao_na_fonte = 'Trabalhador(a) da ativa'
where condicao_na_fonte is null;
