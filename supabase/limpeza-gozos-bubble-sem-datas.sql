-- ============================================================================
-- Limpeza: 10 gozos de férias migrados do Bubble sem datas (06/10/2026).
-- Sem início, término nem período, já decididos no Bubble ("Não foi
-- estabelecido período de gozo"). Não aparecem em tela nenhuma e só inflavam a
-- caixa de entrada. Rodar no SQL Editor do Supabase.
--
-- As condições extras (tenant, sem início, não autorizado, com decisão, com
-- bubble_id) garantem que só esses registros saiam, mesmo que um id esteja
-- errado. Cópia dos registros antes da exclusão guardada fora do repositório.
--
-- Uma ausência do Bubble (motivo "Férias", também sem datas) aponta para um
-- desses gozos: o vínculo é desfeito antes e a ausência fica.
-- ============================================================================

begin;

update public.pessoal_ausencias
set ferias_id = null
where ferias_id = '17c6705f-8633-4e0c-89ff-a307acf1ed26'
  and emp_proprietaria_id = 'c763cb99-edfd-4840-8453-ed3fcb66d4a1';
-- Esperado: 1 linha (ausência 7c11eb2e-387b-4563-87dc-463dd9daa32a).

delete from public.pessoal_ferias_gozo
where id in (
  '17c6705f-8633-4e0c-89ff-a307acf1ed26',
  'd66b68e8-baea-4bc6-811f-d7b96e5a2261',
  '905fedde-70f8-4a08-b9ba-3502841669c5',
  'e8c8dc73-50f1-4b73-b438-3a6775aead6c',
  '73b26c62-30d1-43f1-aecb-e7171524f42d',
  '34c26953-1b37-412c-a335-38334dee7632',
  '6d97d6de-bacf-4874-8333-e9c027343214',
  '9c271ac1-454f-4f6a-9ae9-fbfd8594873c',
  '1bfb956e-be12-4579-a51f-15f9417f5d78',
  'acbe6d7a-2e86-43fa-b92a-c626b8a772af'
)
  and emp_proprietaria_id = 'c763cb99-edfd-4840-8453-ed3fcb66d4a1'
  and inicio is null
  and autorizado is not true
  and data_autorizacao is not null
  and bubble_id is not null
returning id;
-- Esperado: 10 linhas.

commit;
