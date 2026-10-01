-- Confluir — Comunicação › Slides para TV: slide de VÍDEO (2026-10-01)
--
-- Além da imagem, o slide pode ter um vídeo (MP4 H.264 ou WebM, até 50 MB).
-- Um slide tem imagem OU vídeo. O navegador do painel envia o arquivo direto
-- ao Storage com URL assinada (a server action corta em 4 MB), no mesmo
-- bucket público `comunicacao`, em slides/<emp>/<uuid>.mp4.
--
-- Sem duração própria, o slide de vídeo dura o vídeo inteiro (a duração é
-- lida no navegador ao escolher o arquivo e gravada aqui, em segundos
-- inteiros, arredondada para cima), até 10 minutos. "Tocar com som" tenta o
-- som na TV e cai para mudo quando o navegador bloqueia o autoplay com som.
--
-- O código degrada sem estas colunas (lê com as colunas antigas e recusa
-- só o slide de vídeo), então a ordem deploy × SQL não derruba a TV.
--
-- Padrão da casa: idempotente. Executar UMA VEZ no SQL Editor do Supabase,
-- depois de supabase/comunicacao-slides-tv.sql.

alter table comunicacao_slides add column if not exists video_caminho text;           -- caminho no bucket `comunicacao`
alter table comunicacao_slides add column if not exists video_url text;               -- URL pública
alter table comunicacao_slides add column if not exists video_duracao_segundos integer; -- lida no navegador; null = não deu para medir
alter table comunicacao_slides add column if not exists video_som boolean not null default false;

do $$ begin
  alter table comunicacao_slides add constraint ck_slides_video_duracao
    check (video_duracao_segundos is null or video_duracao_segundos > 0);
exception when duplicate_object then null; end $$;

-- O PostgREST precisa enxergar as colunas novas sem esperar o recarregamento.
notify pgrst, 'reload schema';
