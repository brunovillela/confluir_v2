-- Confluir — Bucket `pessoal` aceita foto (JPG, PNG, WebP) além de PDF (14/11/2026)
--
-- POR QUÊ: o bucket nasceu só com application/pdf (linha de base), mas várias
-- telas aceitam foto e sobem com o tipo da imagem, e o Storage recusava com
-- "mime type image/png is not supported". Fluxos atingidos:
--   - Meu perfil › Reembolsos (comprovante)          perfil/reembolsos/actions.ts
--   - Comprovação de faltas                           lib/db/faltas.ts
--   - Bot do Telegram: reembolso e atestado por foto  lib/telegram-arquivo.ts
--   - Pessoal › ASO e Atestados (gestão)              pessoal/aso, pessoal/atestados
--   - Pessoal › Treinamentos (certificado)            pessoal/treinamentos
-- Todos já validam o tipo (PDF/JPG/PNG/WebP) e o tamanho (≤5 MB) no código.
--
-- COMO: amplia allowed_mime_types para os quatro tipos que o código aceita;
-- mantém o limite de 5 MB e o bucket privado. Idempotente (só reescreve a
-- lista). Converter a foto em PDF antes de subir foi descartado: exigiria
-- mexer em seis fluxos e o código já foi escrito para guardar a imagem.

update storage.buckets
   set allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
 where id = 'pessoal';
