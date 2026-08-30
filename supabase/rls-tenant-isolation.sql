-- Confluir — RLS de isolamento por tenant (backstop de defesa em profundidade) (2026-07-24)
--
-- Fecha a classe de vazamento entre tenants NO BANCO: mesmo que uma query
-- esqueça o filtro emp_proprietaria_id, o Postgres barra. Vale para o papel
-- `authenticated` — o cliente do tenant (a implementar) assina um JWT com
-- role=authenticated e a claim `tenant_id`. O `service_role` IGNORA RLS de
-- propósito e segue sendo usado só por operações de PLATAFORMA/cross-tenant
-- (proxy, auth pré-tenant, controlador /admin).
--
-- O tenant vem da claim `tenant_id` do JWT: (auth.jwt() ->> 'tenant_id')::uuid.
--
-- SEGURO RODAR AGORA: o app usa service_role (ignora estas políticas) e os
-- usuários do portal/votação (authenticated) NÃO têm a claim tenant_id, então
-- a condição dá NULL e a política nega — nada muda até o cliente do tenant
-- entrar em uso.
--
-- 109 tabelas tenant-owned. `empresa` é caso especial: a própria organização
-- tem emp_proprietaria_id NULO e id = tenant, então a política também libera a
-- linha cujo id é o tenant. Exclui `tenants` e `plataforma_admins` (nível de
-- plataforma).
--
-- Executar UMA VEZ no SQL Editor do Supabase. Idempotente.

do $$
declare
  t text;
  claim constant text := $q$(auth.jwt() ->> 'tenant_id')::uuid$q$;
  cond text;
  tabelas constant text[] := array[
    'agenda',
    'assinaturas',
    'caixa_contas',
    'caixa_movimentacoes',
    'caixa_ocorrencias',
    'caixa_prestacoes',
    'compras_fornecimentos',
    'compras_itens',
    'compras_propostas',
    'compras_solicitacoes',
    'contratos',
    'contratos_categorias',
    'demandas',
    'demandas_check',
    'demandas_check_tarefas',
    'demandas_comentarios',
    'diretoria_grupos',
    'diretoria_instancia_assentos',
    'diretoria_instancias',
    'diretoria_integrantes',
    'diretoria_liberacoes',
    'diretoria_mandatos',
    'emails',
    'emails_institucionais',
    'empresa',
    'empresa_departamentos',
    'empresa_sede',
    'empresas_categorias',
    'enderecos',
    'estoque',
    'fa_documentos',
    'fa_documentos_categorias',
    'fa_documentos_versao',
    'ferramentas_anomalias',
    'filiacao_prontuario',
    'filiacao_recebe',
    'filiacao_recebe_comprovacao',
    'filiacao_recebe_remessa',
    'filiacao_vinculos',
    'filiacoes',
    'financeiro_caixa',
    'hospedagem_hotel',
    'hospedagem_hotel_usuarios',
    'hospedagem_servico',
    'juridico_homologacoes',
    'juridico_processos',
    'juridico_reembolsos',
    'lgpd_solicitacoes',
    'oficios',
    'ordens_pagamento',
    'patrimonio_recinto',
    'permissoes',
    'pessoal_anuenio',
    'pessoal_anuenio_base',
    'pessoal_atividade_medidas_seguranca',
    'pessoal_atividades',
    'pessoal_atividades_executores',
    'pessoal_atividades_ferramentas',
    'pessoal_atividades_perigos',
    'pessoal_atividades_riscos',
    'pessoal_atribuicoes_cargo',
    'pessoal_ausencias',
    'pessoal_cargo',
    'pessoal_contracheques_remessas',
    'pessoal_dependentes',
    'pessoal_faltas_justificadas',
    'pessoal_faltas_justificadas_periodo',
    'pessoal_ferias',
    'pessoal_ferias_gozo',
    'pessoal_informes_rendimentos',
    'pessoal_informes_rendimentos_remessas',
    'pessoal_nivel_salarial',
    'pessoal_nivel_salarial_base',
    'pessoal_plano_saude',
    'pessoal_registro_ponto_remessas',
    'pessoal_treinamentos',
    'pessoal_treinamentos_alunos',
    'projeto',
    'saude_acompanhamento',
    'saude_agenda_atendimentos',
    'saude_assistidos',
    'saude_atendimentos',
    'saude_atendimentos_tipos',
    'saude_cat',
    'saude_cipa_agenda',
    'saude_cipa_representantes',
    'saude_profissionais',
    'telefones',
    'usuarios',
    'veiculo_contratos_aluguel',
    'veiculos',
    'veiculos_abastecimentos',
    'veiculos_agendamentos',
    'veiculos_disponibilidade',
    'veiculos_verificacao',
    'vinculos_trabalhistas',
    'voto_assembleias',
    'voto_assembleias_aptos',
    'voto_assembleias_perguntas',
    'voto_campanha',
    'voto_em_separado',
    'voto_mesario',
    'voto_mesarios',
    'voto_online',
    'voto_opcoes_resposta',
    'voto_resultado_presencial',
    'voto_rod_assembleias',
    'voto_unidades_presenciais',
    'voto_urna',
    'voto_urna_disponibilidade',
    'voto_urna_lacres',
    'voto_urna_terminais',
    'voto_urnas',
    'voto_votacao_respostas'
  ];
begin
  foreach t in array tabelas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists tenant_isolation on public.%I', t);
    if t = 'empresa' then
      cond := format('(emp_proprietaria_id = %s or id = %s)', claim, claim);
    else
      cond := format('(emp_proprietaria_id = %s)', claim);
    end if;
    execute format(
      'create policy tenant_isolation on public.%I for all to authenticated using %s with check %s',
      t, cond, cond
    );
  end loop;
end $$;
