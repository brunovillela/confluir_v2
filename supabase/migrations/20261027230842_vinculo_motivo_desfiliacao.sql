-- Confluir — motivo da desfiliação por vínculo (filiacao_vinculos.desfiliacao_motivo)
--
-- POR QUÊ: o motivo ficava no cadastro (filiacoes.desfiliacao_motivo), um só
-- para a pessoa, mas a desfiliação acontece em cada vínculo: quem sai de uma
-- empresa por desligamento e continua filiado pelo fundo de pensão tem dois
-- vínculos e, mais tarde, dois motivos diferentes.
--
-- COMO: colunas novas no vínculo (mesma lista fechada de
-- lib/churn-constantes.ts), copiadas do cadastro para os vínculos já
-- encerrados (com data de desfiliação ou de saída). As colunas de filiacoes
-- ficam por ora, sem uso no código; saem numa migração futura.

alter table public.filiacao_vinculos
  add column if not exists desfiliacao_motivo text,
  add column if not exists desfiliacao_motivo_detalhe text;

update public.filiacao_vinculos v
   set desfiliacao_motivo = f.desfiliacao_motivo,
       desfiliacao_motivo_detalhe = f.desfiliacao_motivo_detalhe
  from public.filiacoes f
 where v.filiado_id = f.id
   and f.desfiliacao_motivo is not null
   and v.desfiliacao_motivo is null
   and (v.data_desfiliacao is not null or v.filiacao_data_saida is not null);

create index if not exists filiacao_vinculos_desfiliacao_motivo_idx
  on public.filiacao_vinculos (emp_proprietaria_id, desfiliacao_motivo)
  where desfiliacao_motivo is not null;

comment on column public.filiacao_vinculos.desfiliacao_motivo is 'Motivo da desfiliação neste vínculo, em lista fechada (lib/churn-constantes.ts). [lgpd:sensivel_sindical]';
comment on column public.filiacao_vinculos.desfiliacao_motivo_detalhe is 'Complemento livre do motivo da desfiliação neste vínculo. [lgpd:sensivel_sindical]';
comment on column public.filiacoes.desfiliacao_motivo is 'OBSOLETO desde 27/10/2026: o motivo mora em filiacao_vinculos.desfiliacao_motivo. [lgpd:sensivel_sindical]';
comment on column public.filiacoes.desfiliacao_motivo_detalhe is 'OBSOLETO desde 27/10/2026: ver filiacao_vinculos.desfiliacao_motivo_detalhe. [lgpd:sensivel_sindical]';
