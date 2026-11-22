-- POR QUÊ: Gestão (22/11/2026), arremates da IA e dos acessos:
--   1. O custo e o teto da IA estão em dólar; com uma cotação informada pela
--      entidade, aparecem também em reais (tela, avisos e planilha).
--   2. Quem está em mais de um departamento contava, na IA e na revisão de
--      acessos, pelo primeiro que o banco devolvia — arbitrário. A Gestão passa
--      a poder marcar o departamento PRINCIPAL da pessoa.
-- COMO:
--   - ia_config.cotacao_usd_brl: R$ por US$ 1, informado na Gestão (nulo =
--     só dólar).
--   - empresa_departamentos_integrantes.principal: no máximo um por pessoa
--     (a aplicação desmarca os outros da mesma entidade ao marcar).
--   Idempotente.

alter table public.ia_config
  add column if not exists cotacao_usd_brl numeric(10,4);
comment on column public.ia_config.cotacao_usd_brl is 'Cotação informada pela Gestão (R$ por US$ 1) para mostrar o custo da IA também em reais. Nulo = só dólar. [lgpd:nenhum]';

alter table public.empresa_departamentos_integrantes
  add column if not exists principal boolean not null default false;
comment on column public.empresa_departamentos_integrantes.principal is 'Departamento principal da pessoa, quando ela está em mais de um: é por ele que conta o uso da IA (cota e relatório) e quem revisa o acesso dela. [lgpd:nenhum]';
