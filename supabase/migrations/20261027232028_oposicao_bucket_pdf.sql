-- Confluir — Oposição, onda 3: bucket `oposicao` só com PDF e com tamanho máximo (27/10/2026)
--
-- POR QUÊ: o bucket aceitava qualquer tipo e qualquer tamanho (achado M3 de
-- docs/avaliacao-oposicao-2026-10.md). O código já confere os bytes (%PDF-)
-- e o tamanho antes de subir; o bucket passa a recusar por conta própria o
-- que não for PDF, como segunda barreira.
--
-- COMO: só PDF (a carta assinada e o documento-modelo, os dois únicos
-- arquivos que vão para ele) e até 10 MB — folga sobre os 3,8 MB que a tela
-- aceita, para o documento-modelo. Idempotente.

update storage.buckets
   set allowed_mime_types = array['application/pdf'],
       file_size_limit = 10485760
 where id = 'oposicao';
