-- Confluir — Aviso de férias assinado eletronicamente pelo funcionário (19/10/2026)
--
-- POR QUÊ: pedido do usuário. Para cada gozo de férias autorizado, o sistema
-- gera o Aviso de Férias (CLT art. 135), manda por e-mail ao funcionário e
-- colhe a assinatura eletrônica dele — a prova de que foi avisado. O envelope
-- de assinatura (documento_assinaturas) já atende ofício, cessão, minuta e
-- RPA; falta só aceitar o tipo "ferias".
--
-- COMO: o check do documento_tipo passa a incluir 'ferias' (documento_id =
-- pessoal_ferias_gozo.id). NOT VALID, como o original: não reconfere linhas
-- antigas. Nada mais muda no schema.

alter table public.documento_assinaturas drop constraint if exists ck_doc_assinaturas_tipo;
alter table public.documento_assinaturas
  add constraint ck_doc_assinaturas_tipo check (
    documento_tipo is null
    or documento_tipo = any (array['oficio'::text, 'cessao'::text, 'minuta'::text, 'rpa'::text, 'ferias'::text])
  ) not valid;

comment on column public.documento_assinaturas.documento_tipo is
  'oficio | cessao | minuta | rpa | ferias — define de onde sai o conteúdo assinado (documento_id) e o que acontece ao assinar. ferias: documento_id = pessoal_ferias_gozo.id (aviso de férias assinado pelo funcionário).';
