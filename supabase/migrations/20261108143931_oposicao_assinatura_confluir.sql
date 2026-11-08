-- Confluir — Oposição: carta assinada pelo próprio Confluir (08/11/2026)
--
-- POR QUÊ: pedido do usuário. Baixar a carta, assinar no gov.br e reenviar o
-- PDF é o passo em que o trabalhador mais trava (e a API de assinatura do
-- gov.br é só para órgãos públicos). A entidade passa a poder aceitar a
-- assinatura eletrônica do próprio Confluir — a mesma mecânica de ofícios,
-- férias e RPA: certificado público, resumo SHA-256 do conteúdo, trilha e
-- página /verificar — e torná-la o padrão. Trabalhador e sindicato ficam com
-- a prova de que a assinatura aconteceu.
--
-- COMO:
--  1. A decisão "assinaturas aceitas" ganha duas opções: `confluir` (só pelo
--     Confluir) e `confluir_ou_carta` (Confluir, ou a carta assinada no
--     gov.br/e-CPF, à escolha da pessoa). Vale no padrão da entidade
--     (oposicao_regras) e na campanha (oposicao_campanha.regra_*).
--  2. O envelope de assinatura (documento_assinaturas) aceita o tipo
--     `oposicao` (documento_id = oposicao_opositor.id). NOT VALID, como os
--     anteriores: não reconfere linhas antigas.
-- Idempotente.

-- ── 1. Novas opções da decisão ──────────────────────────────────────────────
do $$
declare
  r record;
begin
  for r in
    select con.conname, rel.relname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace n on n.oid = rel.relnamespace
     where n.nspname = 'public'
       and con.contype = 'c'
       and (
         (rel.relname = 'oposicao_regras' and pg_get_constraintdef(con.oid) like '%assinaturas_aceitas%')
         or (rel.relname = 'oposicao_campanha' and pg_get_constraintdef(con.oid) like '%regra_assinaturas_aceitas%')
       )
  loop
    execute format('alter table public.%I drop constraint %I', r.relname, r.conname);
  end loop;
end $$;

alter table public.oposicao_regras
  add constraint oposicao_regras_assinaturas_aceitas_check
  check (assinaturas_aceitas in ('confluir', 'confluir_ou_carta', 'govbr', 'govbr_icp'));

alter table public.oposicao_campanha
  add constraint oposicao_campanha_regra_assinaturas_aceitas_check
  check (regra_assinaturas_aceitas in ('confluir', 'confluir_ou_carta', 'govbr', 'govbr_icp'));

comment on column public.oposicao_regras.assinaturas_aceitas is
  'confluir: a carta é assinada no próprio Confluir (certificado + /verificar); confluir_ou_carta: Confluir ou carta assinada no gov.br/e-CPF, à escolha da pessoa; govbr: só a assinatura do Assinador gov.br; govbr_icp: gov.br ou certificado ICP-Brasil (e-CPF).';
comment on column public.oposicao_campanha.regra_assinaturas_aceitas is
  'Assinaturas que a campanha aceita na carta (confluir | confluir_ou_carta | govbr | govbr_icp); nula = padrão da entidade. [lgpd:nenhum]';

-- ── 2. Envelope de assinatura do tipo "oposicao" ────────────────────────────
alter table public.documento_assinaturas drop constraint if exists ck_doc_assinaturas_tipo;
alter table public.documento_assinaturas
  add constraint ck_doc_assinaturas_tipo check (
    documento_tipo is null
    or documento_tipo = any (array['oficio'::text, 'cessao'::text, 'minuta'::text, 'rpa'::text, 'ferias'::text, 'oposicao'::text])
  ) not valid;

comment on column public.documento_assinaturas.documento_tipo is
  'oficio | cessao | minuta | rpa | ferias | oposicao — define de onde sai o conteúdo assinado (documento_id) e o que acontece ao assinar. ferias: documento_id = pessoal_ferias_gozo.id (aviso de férias assinado pelo funcionário). oposicao: documento_id = oposicao_opositor.id (carta de oposição assinada pelo trabalhador no portal).';
