-- Confluir — Veículos: uso dedicado ou coletivo do contrato de locação (29/10/2026)
--
-- POR QUÊ: o carro alugado tem dois usos, e a entidade precisa justificar
-- cada um. DEDICADO: fica com um condutor só (ex.: o diretor que roda o estado
-- todo) — não pode ser oferecido a quem pede um carro na recepção. COLETIVO:
-- sem dono fixo, entra na escala como os da frota, mas em lista própria na
-- página de Veículos. Em ambos, a justificativa da necessidade é obrigatória.
--
-- COMO: três colunas em `veiculo_contratos_aluguel` — `uso` (dedicado |
-- coletivo; nulo nos contratos antigos do Bubble), `uso_justificativa` e
-- `condutor_dedicado_id` (→ usuarios, só no dedicado). A troca de condutor vai
-- para a trilha do contrato (`veiculos_contratos_historico`). Com o condutor,
-- a tabela passa a ter dado pessoal: a etiqueta LGPD da tabela muda e ela
-- entra no processo P14 (Frota) de docs/lgpd/processos.mjs.
-- Idempotente.

alter table public.veiculo_contratos_aluguel
  add column if not exists uso text check (uso in ('dedicado', 'coletivo')),
  add column if not exists uso_justificativa text,
  add column if not exists condutor_dedicado_id uuid references public.usuarios(id);

create index if not exists idx_veiculo_contratos_aluguel_condutor
  on public.veiculo_contratos_aluguel (condutor_dedicado_id)
  where condutor_dedicado_id is not null;

comment on table public.veiculo_contratos_aluguel is 'Contrato de locação de veículos: locadora, vigência, valor mensal, uso (dedicado a um condutor ou coletivo) e a justificativa. Migrado do Bubble ("Veículos Contratos de aluguel"); tela Veículos › Contratos de aluguel. [lgpd:identificacao|titulares:condutores]';
comment on column public.veiculo_contratos_aluguel.uso is 'dedicado (um condutor fixo; fora das opções da recepção) ou coletivo (sem vínculo fixo; lista própria na página de Veículos). Nulo nos contratos antigos. [lgpd:nenhum]';
comment on column public.veiculo_contratos_aluguel.uso_justificativa is 'Por que a entidade precisa do carro nesse uso (obrigatória nos contratos novos). [lgpd:nenhum]';
comment on column public.veiculo_contratos_aluguel.condutor_dedicado_id is 'Condutor a quem o carro do contrato dedicado fica vinculado; a troca fica no histórico do contrato. [lgpd:identificacao]';
