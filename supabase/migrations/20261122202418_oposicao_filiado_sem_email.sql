-- Confluir — Oposição: filiado sem e-mail no cadastro (22/11/2026)
--
-- POR QUÊ: a entrada da oposição passou a começar pelo CPF, e o sistema
-- escolhe o caminho (filiado ativo com e-mail, filiado ativo sem e-mail ou
-- trabalhador). O filiado ativo sem e-mail informa nome, nascimento e um
-- e-mail novo, conferidos com a ficha. Mas 451 dos 1.186 filiados ativos sem
-- e-mail (SINDIPETRO-NF) não têm nascimento na ficha: a entidade decide —
-- num padrão e, se quiser, por campanha — o que fazer nesse caso.
--
-- COMO: nova decisão jurídica `filiado_sem_email`, como as outras:
--  - oposicao_regras.filiado_sem_email (padrão da entidade);
--  - oposicao_campanha.regra_filiado_sem_email (nulo = padrão da entidade).
-- Valores: 'nome_nascimento' (nome e nascimento; sem nascimento na ficha,
-- procurar o sindicato), 'nome_basta' (sem nascimento na ficha, basta o nome
-- e a equipe confere na avaliação), 'sindicato' (o filiado sem e-mail sempre
-- procura o sindicato). Nulo nos dois = 'nome_nascimento' (no código): a
-- decisão nova não tira do ar campanha já aberta.
-- Idempotente.

alter table public.oposicao_regras
  add column if not exists filiado_sem_email text;

alter table public.oposicao_campanha
  add column if not exists regra_filiado_sem_email text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'oposicao_regras_filiado_sem_email_check') then
    alter table public.oposicao_regras add constraint oposicao_regras_filiado_sem_email_check
      check (filiado_sem_email in ('nome_nascimento', 'nome_basta', 'sindicato'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'oposicao_campanha_regra_filiado_sem_email_check') then
    alter table public.oposicao_campanha add constraint oposicao_campanha_regra_filiado_sem_email_check
      check (regra_filiado_sem_email in ('nome_nascimento', 'nome_basta', 'sindicato'));
  end if;
end $$;

comment on column public.oposicao_regras.filiado_sem_email is
  'Filiado ativo sem e-mail no cadastro, na entrada da oposição: nome_nascimento (confere nome e nascimento; sem nascimento na ficha, procurar o sindicato), nome_basta (sem nascimento na ficha, basta o nome; a equipe confere na avaliação) ou sindicato (sempre procurar o sindicato). Nulo = nome_nascimento. [lgpd:nenhum]';
comment on column public.oposicao_campanha.regra_filiado_sem_email is
  'Decisão da campanha sobre o filiado ativo sem e-mail (ver oposicao_regras.filiado_sem_email); nula = padrão da entidade. [lgpd:nenhum]';
