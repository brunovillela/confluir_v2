-- Confluir — Link único de votação + sala da assembleia virtual (2026-10-07)
--
-- 1) LINK ÚNICO (/votar): uma página com todas as votações online em
--    andamento e futuras. Quem não recebe o e-mail corporativo confirma um
--    e-mail que recebe (de preferência pessoal) e se vincula ao seu registro
--    na lista de aptos pelos dados (nome, e-mail da empresa, CPF e
--    nascimento). O vínculo fica no apto:
--      • email_contato  — o e-mail confirmado (recebe o comprovante);
--      • cadastro_canal — 'link_unico' (a comissão revisa esses cadastros);
--      • cadastro_em    — quando o vínculo foi feito.
--
-- 2) SALA VIRTUAL: link, data e hora da reunião online da assembleia. Vai no
--    e-mail de aviso aos aptos e na página do link único.
--
-- O código tolera as colunas ausentes. Executar UMA VEZ no SQL Editor do
-- Supabase. Idempotente.

alter table public.voto_assembleias_aptos add column if not exists email_contato text;
alter table public.voto_assembleias_aptos add column if not exists cadastro_canal text;
alter table public.voto_assembleias_aptos add column if not exists cadastro_em timestamptz;

create index if not exists voto_assembleias_aptos_email_contato_idx
  on public.voto_assembleias_aptos (emp_proprietaria_id, email_contato)
  where email_contato is not null;

comment on column public.voto_assembleias_aptos.email_contato is
  'E-mail confirmado pelo eleitor no link único de votação (minúsculas). Recebe o comprovante.';
comment on column public.voto_assembleias_aptos.cadastro_canal is
  'Por onde o eleitor se identificou: link_unico (página /votar).';

alter table public.voto_assembleias add column if not exists sala_link text;
alter table public.voto_assembleias add column if not exists sala_data date;
alter table public.voto_assembleias add column if not exists sala_hora time;

comment on column public.voto_assembleias.sala_link is
  'Link da sala da assembleia virtual (https). Vai no e-mail de aviso aos aptos.';
comment on column public.voto_assembleias.sala_data is 'Data da reunião na sala virtual.';
comment on column public.voto_assembleias.sala_hora is 'Hora da reunião na sala virtual (horário de Brasília).';
