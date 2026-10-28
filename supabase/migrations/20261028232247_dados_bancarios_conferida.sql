-- Confluir — conta bancária "conferida" (dados_bancarios.conferida_*)
--
-- POR QUÊ: a tela Financeiro › Contas bancárias lista a conta de titular de
-- outra pessoa, a mesma conta em pessoas diferentes e a conta sem documento.
-- Muitas estão certas (conta do cônjuge, do MEI, de terceiro autorizado) e
-- ficavam na lista para sempre, com a auditoria alertando em toda ordem. Quem
-- paga ordens passa a poder marcar a conta como conferida, com observação.
--
-- COMO: quatro colunas opcionais. `conferida_titular` guarda o titular
-- (documento|nome) no momento da conferência: se alguém troca o titular da
-- conta depois, a conferência deixa de valer sozinha (o app compara). A
-- conferida sai da lista e cala o alerta da regra "Conta de outro titular" e
-- o aviso da remessa.

alter table public.dados_bancarios
  add column if not exists conferida_em timestamptz,
  add column if not exists conferida_por_usuario_id uuid references public.usuarios(id) on delete set null,
  add column if not exists conferida_obs text,
  add column if not exists conferida_titular text;

comment on column public.dados_bancarios.conferida_em is 'Quando a conta foi marcada como conferida em Financeiro › Contas bancárias (titular de outra pessoa, conta em pessoas diferentes ou sem documento aceitos). [lgpd:nenhum]';
comment on column public.dados_bancarios.conferida_por_usuario_id is 'Quem marcou a conta como conferida. [lgpd:identificacao]';
comment on column public.dados_bancarios.conferida_obs is 'Observação da conferência (ex.: conta do cônjuge, autorizada por e-mail). [lgpd:financeiro]';
comment on column public.dados_bancarios.conferida_titular is 'Titular da conta (documento|nome) na hora da conferência; se mudar, a conferência deixa de valer. [lgpd:financeiro]';
