-- Confluir — Correção de CASCADE das Atribuições/SST (2026-08-30)
--
-- Rodar DEPOIS de pessoal-atribuicoes-sst.sql. As tabelas-stub que já tinham
-- `atividade_id` vieram com FK SEM "on delete cascade", então excluir uma tarefa
-- com executores/perigos falhava. Aqui removemos qualquer FK de atividade_id e
-- recriamos com o comportamento certo. Sem funções auxiliares. Idempotente.

do $$
declare r record;
begin
  for r in
    select tc.table_name, tc.constraint_name
    from information_schema.table_constraints tc
    join information_schema.key_column_usage kcu
      on tc.constraint_name = kcu.constraint_name
     and tc.table_schema = kcu.table_schema
    where tc.constraint_type = 'FOREIGN KEY'
      and tc.table_schema = 'public'
      and kcu.column_name = 'atividade_id'
      and tc.table_name in (
        'pessoal_atividades_executores','pessoal_atividades_perigos',
        'pessoal_atividades_ferramentas','pessoal_atividades_riscos',
        'pessoal_atividade_medidas_seguranca','pessoal_atribuicoes_cargo')
  loop
    execute format('alter table %I drop constraint %I', r.table_name, r.constraint_name);
  end loop;
end $$;

alter table pessoal_atividades_executores
  add constraint pessoal_atividades_executores_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atividades_perigos
  add constraint pessoal_atividades_perigos_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atividades_ferramentas
  add constraint pessoal_atividades_ferramentas_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atividades_riscos
  add constraint pessoal_atividades_riscos_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atividade_medidas_seguranca
  add constraint pessoal_atividade_medidas_seguranca_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete cascade;
alter table pessoal_atribuicoes_cargo
  add constraint pessoal_atribuicoes_cargo_atividade_id_fkey
  foreign key (atividade_id) references pessoal_atividades(id) on delete set null;
