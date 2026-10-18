-- Confluir — Encarregado (DPO) e contato de privacidade por entidade
-- (Onda B6, docs/plano-documentacao.md)
--
-- POR QUÊ: a LGPD (art. 41, §1º) exige que a identidade e o contato do
-- encarregado sejam divulgados publicamente. Cada entidade é controladora dos
-- seus dados e tem o próprio encarregado. A política de privacidade pública
-- (/privacidade, por subdomínio) mostra esses campos; o cadastro da
-- organização (Institucional › Organização) permite preenchê-los.
--
-- COMO: três colunas opcionais em empresa (a linha da própria entidade).
-- Sem encarregado indicado, a política mostra o e-mail de contato da entidade.

alter table public.empresa
  add column if not exists lgpd_encarregado_nome text,
  add column if not exists lgpd_encarregado_email text,
  add column if not exists lgpd_politica_atualizada_em date;

comment on column public.empresa.lgpd_encarregado_nome is
  'Nome do encarregado pelo tratamento de dados pessoais (DPO) da entidade, divulgado na política de privacidade (LGPD art. 41). [lgpd:identificacao]';
comment on column public.empresa.lgpd_encarregado_email is
  'Canal de contato do encarregado, divulgado na política de privacidade e usado pelos titulares para exercer direitos. [lgpd:identificacao]';
comment on column public.empresa.lgpd_politica_atualizada_em is
  'Data da última revisão da política de privacidade da entidade, mostrada no topo de /privacidade.';
