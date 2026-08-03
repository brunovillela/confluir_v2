-- Confluir — RLS de isolamento por tenant, 2ª passada: tabelas GLOBAIS (2026-07-25)
--
-- As partes 1 e 2 cobriram as 109 tabelas que TÊM emp_proprietaria_id (leitura
-- e escrita). Faltavam as tabelas GLOBAIS — sem coluna emp, escopadas por FK a
-- um PAI que tem emp. Aqui elas ganham RLS `for all to authenticated` cuja
-- condição é: existe o PAI e ele é do tenant do JWT. Como o pai já é RLS/emp,
-- a checagem `p.emp_proprietaria_id = tenant` isola.
--
-- OR entre FKs alternativos: a linha aparece se QUALQUER um dos pais possíveis
-- for do tenant (ex.: cupom por hotel OU serviço OU filiado; dados bancários
-- por usuário OU fornecedor). Linhas com TODOS os FKs nulos (lixo migrado sem
-- dono: 3 contracheques, 1 ponto) ficam invisíveis — não aparecem em tela.
--
-- Também dá GRANT insert/update/delete ao `authenticated` (o WITH CHECK gateia:
-- só grava se o pai referenciado for do tenant), para a escrita poder ir pelo
-- cliente do tenant, igual às 109.
--
-- FORA desta passada (decisão consciente):
--  · centros_de_custo — referenciada em todo o app; 6 contas reais sem
--    departamento_id sumiriam; não é PII sensível (nomes/classificadores de
--    conta). Tratada como compartilhada, como antes.
--  · financeiro_diarias / noticias — sem FK de pai p/ escopar (e não sensíveis).
--  · juridico_configuracoes — escopa via centros_de_custo (global); config, 0 linhas.
--  · Tabelas ainda inexistentes (SQL pendente): pessoal_reembolsos_act,
--    pessoal_diarias_solicitacoes, veiculos_condutores, hospedagem_reservas,
--    veiculos_infracoes_historico, veiculos_abastecimentos_lotes — 3ª passada
--    quando o SQL delas rodar.
--
-- Idempotente. Executar UMA VEZ no SQL Editor do Supabase.

do $$
declare
  claim constant text := $q$(auth.jwt() ->> 'tenant_id')::uuid$q$;
  -- [tabela, [ [coluna_fk, tabela_pai, empresa_caso_especial], ... ]]
  spec constant jsonb := $json$[
    {"t":"notificacoes","fk":[["usuario_id","usuarios",false]]},
    {"t":"cnh","fk":[["usuario_id","usuarios",false]]},
    {"t":"dados_bancarios","fk":[["usuario_id","usuarios",false],["fornecedor_id","empresa",true]]},
    {"t":"aso","fk":[["funcionario_id","usuarios",false]]},
    {"t":"pes_atestados_medicos","fk":[["funcionario_id","usuarios",false]]},
    {"t":"pessoal_contracheques","fk":[["funcionario_id","usuarios",false],["remessa_id","pessoal_contracheques_remessas",false]]},
    {"t":"pessoal_registro_ponto","fk":[["funcionario_id","usuarios",false],["remessa_id","pessoal_registro_ponto_remessas",false]]},
    {"t":"veiculos_infracoes","fk":[["veiculo_id","veiculos",false]]},
    {"t":"hospedagem_cupom","fk":[["hotel_id","hospedagem_hotel",false],["servico_id","hospedagem_servico",false],["filiado_id","filiacoes",false]]},
    {"t":"hospedagem_tarifas","fk":[["hotel_id","hospedagem_hotel",false]]},
    {"t":"hospedagem_fatura","fk":[["hotel_id","hospedagem_hotel",false],["ordem_pagamento_id","ordens_pagamento",false]]},
    {"t":"voto_campanha_fontes","fk":[["campanha_id","voto_campanha",false]]},
    {"t":"fa_documentos_categorias_junction","fk":[["documento_id","fa_documentos",false]]},
    {"t":"juridico_processos_filiados","fk":[["processo_id","juridico_processos",false]]},
    {"t":"oficios_filiados","fk":[["oficio_id","oficios",false]]},
    {"t":"saude_atendimentos_acessos","fk":[["atendimento_id","saude_atendimentos",false]]},
    {"t":"saude_atendimentos_relatorio","fk":[["atendimento_id","saude_atendimentos",false]]}
  ]$json$::jsonb;
  ent jsonb;
  fk jsonb;
  tbl text;
  col text;
  parent text;
  especial boolean;
  empchk text;
  conds text[];
  cond text;
begin
  for ent in select * from jsonb_array_elements(spec) loop
    tbl := ent ->> 't';
    conds := array[]::text[];
    for fk in select * from jsonb_array_elements(ent -> 'fk') loop
      col := fk ->> 0;
      parent := fk ->> 1;
      especial := (fk ->> 2)::boolean;
      if especial then
        empchk := format('(p.emp_proprietaria_id = %s or p.id = %s)', claim, claim);
      else
        empchk := format('p.emp_proprietaria_id = %s', claim);
      end if;
      -- qualifica a coluna externa pelo nome da própria tabela (sem alias)
      conds := conds || format(
        'exists (select 1 from public.%I p where p.id = %I.%I and %s)',
        parent, tbl, col, empchk
      );
    end loop;
    cond := array_to_string(conds, ' or ');
    execute format('alter table public.%I enable row level security', tbl);
    execute format('drop policy if exists tenant_isolation_pai on public.%I', tbl);
    execute format(
      'create policy tenant_isolation_pai on public.%I for all to authenticated using (%s) with check (%s)',
      tbl, cond, cond
    );
    execute format('grant insert, update, delete on public.%I to authenticated', tbl);
  end loop;
end $$;
