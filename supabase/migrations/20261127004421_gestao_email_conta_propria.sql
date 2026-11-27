-- POR QUÊ: Gestão (27/11/2026), fase 4 da gestão do e-mail. Todo e-mail saía
--   pela conta Brevo da plataforma, com o remetente nao-responda@confluir.online.
--   A entidade que tem (ou quer ter) a própria conta no Brevo ou no Resend —
--   para pagar o próprio envio, ter o próprio limite e mandar com o próprio
--   domínio (ex.: comunicacao@sindicato.org.br) — não tinha como, como já tem
--   com a chave de IA.
-- COMO: colunas em email_config, como a chave de IA em ia_config:
--   - provedor ('brevo' ou 'resend') e a chave de API cifrada na aplicação
--     (AES-256-GCM, chave de cifra fora do banco; só os 4 últimos caracteres
--     ficam à vista), quem cadastrou e o último teste;
--   - remetente próprio (endereço de um domínio verificado na conta), nome de
--     exibição e endereço de resposta;
--   - o token do webhook da conta da entidade, só o hash (sha-256).
--   email_envios.conta registra de que conta o e-mail saiu.
--   Idempotente.

alter table public.email_config
  add column if not exists provedor text,
  add column if not exists chave_cifrada text,
  add column if not exists chave_versao integer,
  add column if not exists chave_final text,
  add column if not exists chave_definida_em timestamptz,
  add column if not exists chave_definida_por uuid references public.usuarios(id) on delete set null,
  add column if not exists chave_testada_em timestamptz,
  add column if not exists chave_teste_erro text,
  add column if not exists remetente_email text,
  add column if not exists remetente_nome text,
  add column if not exists responder_para text,
  add column if not exists webhook_token_hash text,
  add column if not exists webhook_token_final text;

alter table public.email_config drop constraint if exists email_config_provedor_valido;
alter table public.email_config add constraint email_config_provedor_valido check (provedor is null or provedor in ('brevo', 'resend'));

comment on column public.email_config.provedor is 'Provedor da conta própria da entidade: brevo ou resend; nulo = conta da plataforma.';
comment on column public.email_config.chave_cifrada is 'Chave de API da conta própria, cifrada na aplicação (src/lib/segredos.ts, AES-256-GCM, com a entidade como dado associado). Nunca volta para a tela. [lgpd:credencial]';
comment on column public.email_config.chave_versao is 'Versão da chave de cifra usada (0 = derivada, 1 = SEGREDOS_CHAVE).';
comment on column public.email_config.chave_final is 'Os 4 últimos caracteres da chave, para a Gestão reconhecer qual está cadastrada.';
comment on column public.email_config.chave_definida_em is 'Quando a chave foi cadastrada.';
comment on column public.email_config.chave_definida_por is 'Quem cadastrou a chave. [lgpd:identificacao]';
comment on column public.email_config.chave_testada_em is 'Último teste da chave (na hora de salvar, no botão Testar ou no teste diário).';
comment on column public.email_config.chave_teste_erro is 'Erro do último teste ou da última recusa do provedor; nulo = funcionou. [lgpd:nenhum]';
comment on column public.email_config.remetente_email is 'Remetente próprio (endereço de um domínio verificado na conta da entidade); nulo = remetente da plataforma.';
comment on column public.email_config.remetente_nome is 'Nome de exibição do remetente; nulo = "Confluir — <entidade>".';
comment on column public.email_config.responder_para is 'Endereço para onde vão as respostas; nulo = e-mail de contato da entidade (Organização).';
comment on column public.email_config.webhook_token_hash is 'sha-256 do token que o webhook da conta da entidade manda para /api/webhooks/brevo; o token em si só aparece uma vez, ao ser gerado. [lgpd:credencial]';
comment on column public.email_config.webhook_token_final is 'Os 4 últimos caracteres do token do webhook.';

alter table public.email_envios add column if not exists conta text;
alter table public.email_envios drop constraint if exists email_envios_conta_valida;
alter table public.email_envios add constraint email_envios_conta_valida check (conta is null or conta in ('entidade', 'plataforma'));
comment on column public.email_envios.conta is 'De que conta o e-mail saiu: entidade (chave própria, Gestão › E-mail) ou plataforma. Nulo nos envios anteriores a 27/11/2026 (todos da plataforma).';

comment on table public.email_config is 'Configuração do e-mail da entidade (Gestão › E-mail): controles (módulos desligados, teto mensal, cotas por departamento; 26/11/2026) e a conta própria no Brevo ou no Resend, com a chave cifrada pela aplicação, remetente, nome e endereço de resposta (27/11/2026). Envios essenciais nunca são barrados. [lgpd:credencial|titulares:funcionarios]';
