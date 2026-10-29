-- Confluir — atualização por lista: arquivo pelo armazenamento, leitura em
-- segundo plano, "saíram da empresa" e sugestão por nome + nascimento (29/10/2026)
--
-- POR QUÊ (frente 1 da revisão da funcionalidade):
--  - O arquivo passava pela server action, com teto de 4 MB — PDF escaneado
--    e foto de celular passam disso.
--  - A leitura de uma lista grande prendia a tela por minutos e podia
--    estourar o tempo da página.
--  - Quem a lista dá como desligado da empresa era só um aviso em texto.
--  - A sugestão pelo nome não usava o nascimento, que separa homônimos.
--
-- COMO:
--  1. Bucket privado `listas-trabalhadores` (até 25 MB; planilha, CSV/TXT,
--     PDF e imagem). O navegador sobe direto, por URL assinada; o arquivo é
--     apagado assim que a leitura termina (o lote guarda só o nome).
--  2. Lote ganha as situações 'lendo' e 'erro', o caminho do arquivo durante
--     a leitura, a mensagem de erro e o progresso (trechos lidos/total).
--  3. `sairam`: quem a lista dá como desligado, com o vínculo, para abrir
--     direto da tela.
--  4. Item ganha a via 'nome_nascimento' (nome exato e mesma data de
--     nascimento).
-- Idempotente.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'listas-trabalhadores',
  'listas-trabalhadores',
  false,
  26214400,
  array[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-excel',
    'application/vnd.oasis.opendocument.spreadsheet',
    'text/csv',
    'text/plain',
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/gif'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

alter table public.filiacao_atualizacoes_lote
  add column if not exists arquivo_caminho text,
  add column if not exists erro text,
  add column if not exists progresso jsonb,
  add column if not exists sairam jsonb not null default '[]';

alter table public.filiacao_atualizacoes_lote
  drop constraint if exists filiacao_atualizacoes_lote_situacao_check;
alter table public.filiacao_atualizacoes_lote
  add constraint filiacao_atualizacoes_lote_situacao_check
  check (situacao in ('lendo', 'erro', 'rascunho', 'aplicado', 'desfeito'));

alter table public.filiacao_atualizacoes_lote_itens
  drop constraint if exists filiacao_atualizacoes_lote_itens_via_check;
alter table public.filiacao_atualizacoes_lote_itens
  add constraint filiacao_atualizacoes_lote_itens_via_check
  check (via in ('cpf', 'matricula', 'nome_nascimento', 'nome'));

comment on column public.filiacao_atualizacoes_lote.situacao is 'lendo (a IA está lendo o arquivo), erro, rascunho (prévia), aplicado ou desfeito. [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote.arquivo_caminho is 'Caminho do arquivo no bucket listas-trabalhadores enquanto é lido; volta a null quando o arquivo é apagado, ao fim da leitura. [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote.erro is 'Por que a leitura falhou (situação erro). [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote.progresso is 'Trechos da lista já lidos pela IA: {lidos, total}. [lgpd:nenhum]';
comment on column public.filiacao_atualizacoes_lote.sairam is 'Pessoas encontradas a quem a lista dá data de saída da empresa, com o vínculo na fonte, para avaliar a desfiliação. [lgpd:identificacao,trabalhista]';
comment on column public.filiacao_atualizacoes_lote_itens.via is 'Como a linha foi ligada ao cadastro: cpf, matricula (na fonte), nome_nascimento (nome exato e mesma data de nascimento) ou nome (só sugestão). [lgpd:nenhum]';
