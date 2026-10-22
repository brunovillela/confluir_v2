-- Confluir — Controle de ponto: percentual das faixas de hora extra por entidade (22/10/2026)
--
-- POR QUÊ: o ponto guarda as horas extras em duas faixas (colunas *_70 e
-- *_100 de pessoal_registro_ponto, herdadas do Bubble do Sindipetro-NF, cujo
-- acordo paga 70% e 100%). Em outra entidade a faixa normal pode ser 50% (o
-- mínimo da CLT) ou outro percentual do acordo, e as telas não podem dizer
-- "70%" para todos.
--
-- COMO: dois percentuais em pessoal_folha_config (uma linha por entidade). As
-- colunas *_70 passam a ser a FAIXA 1 e as *_100 a FAIXA 2; as telas, a
-- planilha, o movimento da folha e a resenha da IA mostram o percentual da
-- entidade. Sem linha, valem 50% e 100%. O Sindipetro-NF fica com 70% e 100%.
-- Idempotente.

alter table public.pessoal_folha_config
  add column if not exists he_faixa1_percentual numeric(5,2) not null default 50,
  add column if not exists he_faixa2_percentual numeric(5,2) not null default 100;

comment on column public.pessoal_folha_config.he_faixa1_percentual is 'Percentual da faixa 1 de hora extra (colunas *_70 de pessoal_registro_ponto); padrão 50%, o mínimo da CLT.';
comment on column public.pessoal_folha_config.he_faixa2_percentual is 'Percentual da faixa 2 de hora extra (colunas *_100 de pessoal_registro_ponto: domingos, feriados e folgas); padrão 100%.';

-- Sindipetro-NF: o acordo paga 70% e 100%.
insert into public.pessoal_folha_config (emp_proprietaria_id, he_faixa1_percentual, he_faixa2_percentual)
select id, 70, 100 from public.empresa where id = 'c763cb99-edfd-4840-8453-ed3fcb66d4a1'
on conflict (emp_proprietaria_id) do update set he_faixa1_percentual = 70, he_faixa2_percentual = 100;
