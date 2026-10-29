<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Veículos e condutores

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/veiculos.md).

```mermaid
erDiagram
  cnh {
    uuid id PK
    uuid usuario_id FK
  }
  veiculo_contrato_aluguel_vinculo {
    uuid id PK
    uuid veiculo_id FK
    uuid contrato_id FK
    uuid emp_proprietaria_id FK
  }
  veiculo_contratos_aluguel {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid centro_custo_id FK
    uuid departamento_id FK
    uuid fornecedor_id FK
    uuid responsavel_id FK
  }
  veiculos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid contrato_aluguel_id FK
  }
  veiculos_abastecimentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
    uuid veiculo_id FK
    uuid lote_id FK
  }
  veiculos_abastecimentos_lotes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid importado_por_id FK
  }
  veiculos_agendamentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid condutor_id FK
    uuid veiculo_id FK
    uuid empresa_id FK
    uuid atendido_por_id FK
    uuid cancelado_por_id FK
    uuid solicitado_por_id FK
  }
  veiculos_checklist_apontamentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid veiculo_id FK
    uuid item_id FK
    uuid checklist_abertura_id FK
    uuid checklist_resolucao_id FK
    uuid resolvido_por FK
    uuid manutencao_id FK
  }
  veiculos_checklist_config {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizada_por FK
  }
  veiculos_checklist_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  veiculos_checklist_respostas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid checklist_id FK
    uuid item_id FK
  }
  veiculos_checklists {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid veiculo_id FK
    uuid inspetor_id FK
  }
  veiculos_condutores {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
    uuid autorizado_por_id FK
  }
  veiculos_condutores_cnh {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid condutor_id FK
    uuid usuario_origem_id FK
    uuid registrado_por_id FK
  }
  veiculos_condutores_unificacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid principal_usuario_id FK
    uuid secundario_usuario_id FK
    uuid feito_por_id FK
  }
  veiculos_contratos_historico {
    uuid id PK
    uuid contrato_id FK
    uuid usuario_id FK
    uuid emp_proprietaria_id FK
  }
  veiculos_disponibilidade {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid condutor_id FK
    uuid veiculo_id FK
    uuid agendamento_id FK
    uuid registrado_por_id FK
    uuid devolucao_registrada_por_id FK
  }
  veiculos_infracoes {
    uuid id PK
    uuid condutor_infrator_id FK
    uuid reembolso_avaliador_id FK
    uuid avaliacao_verificador_id FK
    uuid justificativa_avaliador_id FK
    uuid veiculo_id FK
    uuid ordem_pagamento_id FK
    uuid baixa_usuario_id FK
  }
  veiculos_infracoes_config {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizada_por FK
  }
  veiculos_infracoes_historico {
    uuid id PK
    uuid infracao_id FK
    uuid usuario_id FK
    uuid emp_proprietaria_id FK
  }
  veiculos_manutencao_planos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid veiculo_id FK
  }
  veiculos_manutencoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid veiculo_id FK
    uuid local_id FK
    uuid compra_id FK
    uuid plano_id FK
    uuid registrada_por FK
  }
  veiculos_verificacao {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid inspetor_id FK
    uuid veiculo_id FK
  }
  cnh }o--o| usuarios : "usuario_id"
  veiculo_contrato_aluguel_vinculo }o--o| veiculo_contratos_aluguel : "contrato_id"
  veiculo_contrato_aluguel_vinculo }o--o| veiculos : "veiculo_id"
  veiculo_contratos_aluguel }o--o| centros_de_custo : "centro_custo_id"
  veiculo_contratos_aluguel }o--o| empresa : "fornecedor_id"
  veiculo_contratos_aluguel }o--o| empresa_departamentos : "departamento_id"
  veiculo_contratos_aluguel }o--o| usuarios : "responsavel_id"
  veiculos }o--o| veiculo_contratos_aluguel : "contrato_aluguel_id"
  veiculos_abastecimentos }o--o| usuarios : "usuario_id"
  veiculos_abastecimentos }o--o| veiculos : "veiculo_id"
  veiculos_abastecimentos }o--o| veiculos_abastecimentos_lotes : "lote_id"
  veiculos_abastecimentos_lotes }o--o| usuarios : "importado_por_id"
  veiculos_agendamentos }o--o| empresa : "empresa_id"
  veiculos_agendamentos }o--o| usuarios : "atendido_por_id"
  veiculos_agendamentos }o--o| usuarios : "cancelado_por_id"
  veiculos_agendamentos }o--o| usuarios : "condutor_id"
  veiculos_agendamentos }o--o| usuarios : "solicitado_por_id"
  veiculos_agendamentos }o--o| veiculos : "veiculo_id"
  veiculos_checklist_apontamentos }o--o| usuarios : "resolvido_por"
  veiculos_checklist_apontamentos }o--o| veiculos_checklist_itens : "item_id"
  veiculos_checklist_apontamentos }o--o| veiculos_checklists : "checklist_abertura_id"
  veiculos_checklist_apontamentos }o--o| veiculos_checklists : "checklist_resolucao_id"
  veiculos_checklist_apontamentos }o--o| veiculos_manutencoes : "manutencao_id"
  veiculos_checklist_apontamentos }o--|| veiculos : "veiculo_id"
  veiculos_checklist_config }o--o| usuarios : "atualizada_por"
  veiculos_checklist_respostas }o--o| veiculos_checklist_itens : "item_id"
  veiculos_checklist_respostas }o--o| veiculos_checklists : "checklist_id"
  veiculos_checklists }o--o| usuarios : "inspetor_id"
  veiculos_checklists }o--o| veiculos : "veiculo_id"
  veiculos_condutores }o--o| usuarios : "autorizado_por_id"
  veiculos_condutores }o--|| usuarios : "usuario_id"
  veiculos_condutores_cnh }o--o| usuarios : "registrado_por_id"
  veiculos_condutores_cnh }o--o| usuarios : "usuario_origem_id"
  veiculos_condutores_cnh }o--o| veiculos_condutores : "condutor_id"
  veiculos_condutores_unificacoes }o--o| usuarios : "feito_por_id"
  veiculos_condutores_unificacoes }o--o| usuarios : "principal_usuario_id"
  veiculos_condutores_unificacoes }o--o| usuarios : "secundario_usuario_id"
  veiculos_contratos_historico }o--o| usuarios : "usuario_id"
  veiculos_contratos_historico }o--|| veiculo_contratos_aluguel : "contrato_id"
  veiculos_disponibilidade }o--o| usuarios : "condutor_id"
  veiculos_disponibilidade }o--o| usuarios : "devolucao_registrada_por_id"
  veiculos_disponibilidade }o--o| usuarios : "registrado_por_id"
  veiculos_disponibilidade }o--o| veiculos : "veiculo_id"
  veiculos_disponibilidade }o--o| veiculos_agendamentos : "agendamento_id"
  veiculos_infracoes }o--o| ordens_pagamento : "ordem_pagamento_id"
  veiculos_infracoes }o--o| usuarios : "avaliacao_verificador_id"
  veiculos_infracoes }o--o| usuarios : "baixa_usuario_id"
  veiculos_infracoes }o--o| usuarios : "condutor_infrator_id"
  veiculos_infracoes }o--o| usuarios : "justificativa_avaliador_id"
  veiculos_infracoes }o--o| usuarios : "reembolso_avaliador_id"
  veiculos_infracoes }o--o| veiculos : "veiculo_id"
  veiculos_infracoes_config }o--o| usuarios : "atualizada_por"
  veiculos_infracoes_historico }o--o| usuarios : "usuario_id"
  veiculos_infracoes_historico }o--|| veiculos_infracoes : "infracao_id"
  veiculos_manutencao_planos }o--o| veiculos : "veiculo_id"
  veiculos_manutencoes }o--o| compras_solicitacoes : "compra_id"
  veiculos_manutencoes }o--o| empresa : "local_id"
  veiculos_manutencoes }o--o| usuarios : "registrada_por"
  veiculos_manutencoes }o--o| veiculos : "veiculo_id"
  veiculos_manutencoes }o--o| veiculos_manutencao_planos : "plano_id"
  veiculos_verificacao }o--o| usuarios : "inspetor_id"
  veiculos_verificacao }o--o| veiculos : "veiculo_id"
```
