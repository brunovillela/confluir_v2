-- Confluir — Férias: regra de pagamento da entidade no aviso (06/11/2026)
--
-- POR QUÊ: o aviso de férias trazia uma regra fixa da CLT ("férias + 1/3,
-- pagas 2 dias corridos antes do início, art. 145"). O acordo coletivo do
-- Sindipetro-NF diz outra coisa (gratificação de 100% da remuneração, paga
-- até 2 dias ÚTEIS antes), e uma funcionária apontou a divergência antes de
-- assinar. O documento não pode depender de uma lei escrita no código: cada
-- entidade informa a própria regra.
--
-- COMO: quatro colunas em pessoal_folha_config (uma linha por entidade): o
-- prazo em dias, se são úteis ou corridos, o que é pago e o fundamento (ex.:
-- cláusula do ACT). Sem prazo informado, o aviso não mostra data de pagamento
-- nem cita lei. O formulário fica em Pessoal → Férias → Regras de férias;
-- ao salvar, os avisos ainda não assinados são reenviados com o texto novo.
-- Nada é preenchido aqui. Idempotente.

alter table public.pessoal_folha_config
  add column if not exists ferias_pagamento_dias smallint,
  add column if not exists ferias_pagamento_dias_uteis boolean not null default false,
  add column if not exists ferias_pagamento_descricao text,
  add column if not exists ferias_pagamento_fundamento text;

alter table public.pessoal_folha_config drop constraint if exists ck_folha_config_ferias_pagamento_dias;
alter table public.pessoal_folha_config
  add constraint ck_folha_config_ferias_pagamento_dias
  check (ferias_pagamento_dias is null or ferias_pagamento_dias between 0 and 60);

comment on column public.pessoal_folha_config.ferias_pagamento_dias is 'Prazo do pagamento das férias: quantos dias antes do início do gozo (úteis ou corridos, ver ferias_pagamento_dias_uteis). Nulo: o aviso de férias não mostra data de pagamento.';
comment on column public.pessoal_folha_config.ferias_pagamento_dias_uteis is 'Se o prazo do pagamento das férias conta dias úteis (pula sábado, domingo e feriados nacionais) ou corridos.';
comment on column public.pessoal_folha_config.ferias_pagamento_descricao is 'O que é pago nas férias, como aparece no aviso (ex.: gratificação de férias de 100% da remuneração).';
comment on column public.pessoal_folha_config.ferias_pagamento_fundamento is 'Fundamento da regra de pagamento citado no aviso (ex.: cláusula 3ª do ACT). Opcional.';
