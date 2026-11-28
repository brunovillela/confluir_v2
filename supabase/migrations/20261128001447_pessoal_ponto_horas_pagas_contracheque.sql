-- Ponto, Fase 2 (28/11/2026): horas extras PAGAS lidas do contracheque.
--
-- A remessa de ponto aponta para uma remessa de contracheques (em geral a do
-- mês seguinte); as linhas de hora extra de cada contracheque são achadas pelo
-- texto do PDF, no servidor, pelas rubricas configuradas pela entidade. A IA
-- só entra se a entidade deixar: para interpretar as linhas de hora extra
-- (sem nome nem CPF) ou, com opção própria e desligada por padrão, para ler o
-- contracheque escaneado inteiro.

-- Configuração por entidade (multitenant).
alter table public.pessoal_contracheques_config add column if not exists he_rubricas jsonb not null default '[]'::jsonb;
alter table public.pessoal_contracheques_config add column if not exists he_referencia text not null default 'decimal';
alter table public.pessoal_contracheques_config add column if not exists he_ia_linhas boolean not null default true;
alter table public.pessoal_contracheques_config add column if not exists he_ler_imagem boolean not null default false;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'pessoal_contracheques_config_he_referencia_check') then
    alter table public.pessoal_contracheques_config
      add constraint pessoal_contracheques_config_he_referencia_check check (he_referencia in ('decimal', 'hhmm'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'pessoal_contracheques_config_he_rubricas_check') then
    alter table public.pessoal_contracheques_config
      add constraint pessoal_contracheques_config_he_rubricas_check check (jsonb_typeof(he_rubricas) = 'array');
  end if;
end $$;

-- O que foi lido de cada contracheque (cache: reler só quando as rubricas mudam).
alter table public.pessoal_contracheques add column if not exists he_lidas jsonb;
alter table public.pessoal_contracheques add column if not exists he_lidas_em timestamptz;

-- Remessa de contracheques indicada na remessa de ponto.
alter table public.pessoal_registro_ponto_remessas add column if not exists contracheques_remessa_id uuid
  references public.pessoal_contracheques_remessas(id) on delete set null;

-- Valor pago e origem das horas pagas no registro de ponto.
alter table public.pessoal_registro_ponto add column if not exists valor_pago_70 numeric(12,2);
alter table public.pessoal_registro_ponto add column if not exists valor_pago_100 numeric(12,2);
alter table public.pessoal_registro_ponto add column if not exists pagas_contracheque_id uuid
  references public.pessoal_contracheques(id) on delete set null;
alter table public.pessoal_registro_ponto add column if not exists pagas_lidas_em timestamptz;

create index if not exists ix_pessoal_registro_ponto_pagas_cc on public.pessoal_registro_ponto (pagas_contracheque_id)
  where pagas_contracheque_id is not null;

comment on column public.pessoal_contracheques_config.he_rubricas is 'Rubricas de hora extra do contracheque da entidade: [{codigo, descricao, faixa (1|2), tipo (horas|valor)}]. "valor" soma só o valor (ex.: DSR sobre horas extras).';
comment on column public.pessoal_contracheques_config.he_referencia is 'Como a referência das horas vem impressa: decimal (10,50 = 10h30) ou hhmm (10,30 = 10h30). "10:30" vale nos dois.';
comment on column public.pessoal_contracheques_config.he_ia_linhas is 'Se a IA pode interpretar as linhas de hora extra que o texto não resolve. Vão só essas linhas, sem nome nem CPF.';
comment on column public.pessoal_contracheques_config.he_ler_imagem is 'Se a IA pode ler o contracheque escaneado (sem texto) inteiro: vai a página toda, com nome, CPF e todos os valores. Desligado por padrão.';
comment on column public.pessoal_contracheques.he_lidas is 'Linhas de hora extra lidas do contracheque: {chave, origem, linhas: [{rubrica, faixa, tipo, horas, valor, texto}]}. [lgpd:financeiro]';
comment on column public.pessoal_contracheques.he_lidas_em is 'Quando as linhas de hora extra foram lidas.';
comment on column public.pessoal_registro_ponto_remessas.contracheques_remessa_id is 'Remessa de contracheques de onde vieram as horas pagas (em geral a do mês seguinte).';
comment on column public.pessoal_registro_ponto.valor_pago_70 is 'Valor (R$) pago pelas horas extras da faixa 1, lido do contracheque. [lgpd:financeiro]';
comment on column public.pessoal_registro_ponto.valor_pago_100 is 'Valor (R$) pago pelas horas extras da faixa 2, lido do contracheque. [lgpd:financeiro]';
comment on column public.pessoal_registro_ponto.pagas_contracheque_id is 'Contracheque de onde as horas pagas foram lidas (null = digitadas).';
comment on column public.pessoal_registro_ponto.pagas_lidas_em is 'Quando as horas pagas foram preenchidas pelo contracheque.';
