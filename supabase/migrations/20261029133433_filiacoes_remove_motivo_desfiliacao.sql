-- Confluir — remove o motivo da desfiliação do cadastro (filiacoes)
--
-- POR QUÊ: desde 27/10/2026 (migração vinculo_motivo_desfiliacao) o motivo é
-- de cada vínculo (`filiacao_vinculos.desfiliacao_motivo`). As colunas do
-- cadastro ficaram marcadas como obsoletas e sem uso no código; o usuário
-- pediu a remoção.
--
-- COMO: repete a cópia para os vínculos encerrados (pega o que tenha sido
-- gravado no cadastro depois da primeira migração; não sobrescreve motivo já
-- registrado no vínculo) e então remove o índice e as duas colunas.
-- Idempotente.

do $$
begin
  if exists (
    select 1 from information_schema.columns
     where table_schema = 'public' and table_name = 'filiacoes' and column_name = 'desfiliacao_motivo'
  ) then
    update public.filiacao_vinculos v
       set desfiliacao_motivo = f.desfiliacao_motivo,
           desfiliacao_motivo_detalhe = f.desfiliacao_motivo_detalhe
      from public.filiacoes f
     where v.filiado_id = f.id
       and f.desfiliacao_motivo is not null
       and v.desfiliacao_motivo is null
       and (v.data_desfiliacao is not null or v.filiacao_data_saida is not null);
  end if;
end $$;

drop index if exists public.filiacoes_desfiliacao_motivo_idx;

alter table public.filiacoes
  drop column if exists desfiliacao_motivo,
  drop column if exists desfiliacao_motivo_detalhe;
