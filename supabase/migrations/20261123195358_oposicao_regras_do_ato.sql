-- Oposição: as decisões jurídicas que valiam no ato (23/11/2026).
--
-- Vídeo, assinaturas aceitas e prova do não filiado podem mudar com a campanha
-- aberta (com confirmação de quem muda). A mudança vale dali em diante: cada
-- oposição guarda as decisões que valiam quando foi registrada, como já guarda
-- o modo e o prazo (modo_formalizacao_ato, prazo_fim_ato).

alter table public.oposicao_opositor
  add column if not exists regras_ato jsonb;

comment on column public.oposicao_opositor.regras_ato is
  'Decisões jurídicas que valiam no registro: {video_minimo, assinaturas_aceitas, prova_nao_filiado}. Nulo = as da campanha. [lgpd:nenhum]';

-- Até hoje essas decisões não mudavam depois da primeira oposição: as que
-- valem agora são as que valiam no registro de cada uma.
update public.oposicao_opositor o
set regras_ato = jsonb_build_object(
  'video_minimo', coalesce(c.regra_video_minimo, r.video_minimo),
  'assinaturas_aceitas', coalesce(c.regra_assinaturas_aceitas, r.assinaturas_aceitas),
  'prova_nao_filiado', coalesce(c.regra_prova_nao_filiado, r.prova_nao_filiado)
)
from public.oposicao_campanha c
left join public.oposicao_regras r on r.emp_proprietaria_id = c.emp_proprietaria_id
where c.id = o.campanha_id
  and o.regras_ato is null
  and o.confirmado_em is not null;
