<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Institucional, diárias, viagens e patrimônio

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/institucional.md).

```mermaid
erDiagram
  estoque {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  institucional_custeio_convidados {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  institucional_custeio_finalidades {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid centro_custo_despesa_id FK
  }
  institucional_custeios {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid finalidade_id FK
    uuid diretoria_integrante_id FK
    uuid filiacao_id FK
    uuid convidado_id FK
    uuid centro_custo_despesa_id FK
    uuid criado_por_id FK
    uuid autorizador_id FK
    uuid caixa_conta_id FK
    uuid fornecedor_id FK
    uuid cancelado_por_id FK
  }
  institucional_ramais {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
  }
  linhas_institucionais {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
  }
  patrimonio_item {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid recinto_id FK
    uuid nota_fiscal_entrada_id FK
    uuid nota_fiscal_saida_id FK
    uuid responsavel_cautela_id FK
  }
  patrimonio_item_responsavel {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid item_id FK
    uuid responsavel_id FK
  }
  patrimonio_nota_fiscal {
    uuid id PK
    uuid fornecedor_id FK
    uuid emp_proprietaria_id FK
  }
  patrimonio_recinto {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  patrimonio_recinto_responsavel {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid recinto_id FK
    uuid funcionario_id FK
  }
  viagens_config {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid updated_by FK
  }
  viagens_faturas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid fornecedor_id FK
    uuid departamento_id FK
    uuid processo_compra_id FK
    uuid ordem_pagamento_id FK
    uuid criado_por FK
  }
  viagens_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid solicitacao_id FK
    uuid fornecedor_id FK
    uuid fatura_id FK
    uuid centro_custo_id FK
  }
  viagens_solicitacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid beneficiario_usuario_id FK
    uuid solicitante_id FK
    uuid departamento_id FK
    uuid evento_id FK
    uuid evento_inscricao_id FK
    uuid atendido_por FK
  }
  viagens_telegram_conversas {
    text chat_id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
  }
  institucional_custeio_finalidades }o--o| centros_de_custo : "centro_custo_despesa_id"
  institucional_custeios }o--o| caixa_contas : "caixa_conta_id"
  institucional_custeios }o--o| centros_de_custo : "centro_custo_despesa_id"
  institucional_custeios }o--o| diretoria_integrantes : "diretoria_integrante_id"
  institucional_custeios }o--o| empresa : "fornecedor_id"
  institucional_custeios }o--o| filiacoes : "filiacao_id"
  institucional_custeios }o--o| institucional_custeio_convidados : "convidado_id"
  institucional_custeios }o--o| institucional_custeio_finalidades : "finalidade_id"
  institucional_custeios }o--o| usuarios : "autorizador_id"
  institucional_custeios }o--o| usuarios : "cancelado_por_id"
  institucional_custeios }o--o| usuarios : "criado_por_id"
  institucional_ramais }o--o| usuarios : "usuario_id"
  linhas_institucionais }o--o| usuarios : "usuario_id"
  patrimonio_item }o--o| patrimonio_nota_fiscal : "nota_fiscal_entrada_id"
  patrimonio_item }o--o| patrimonio_nota_fiscal : "nota_fiscal_saida_id"
  patrimonio_item }o--o| patrimonio_recinto : "recinto_id"
  patrimonio_item }o--o| usuarios : "responsavel_cautela_id"
  patrimonio_item_responsavel }o--o| usuarios : "responsavel_id"
  patrimonio_item_responsavel }o--|| patrimonio_item : "item_id"
  patrimonio_nota_fiscal }o--o| empresa : "fornecedor_id"
  patrimonio_recinto_responsavel }o--o| usuarios : "funcionario_id"
  patrimonio_recinto_responsavel }o--|| patrimonio_recinto : "recinto_id"
  viagens_config }o--o| usuarios : "updated_by"
  viagens_faturas }o--o| compras_solicitacoes : "processo_compra_id"
  viagens_faturas }o--o| empresa_departamentos : "departamento_id"
  viagens_faturas }o--o| ordens_pagamento : "ordem_pagamento_id"
  viagens_faturas }o--o| usuarios : "criado_por"
  viagens_faturas }o--|| empresa : "fornecedor_id"
  viagens_itens }o--o| centros_de_custo : "centro_custo_id"
  viagens_itens }o--o| empresa : "fornecedor_id"
  viagens_itens }o--o| viagens_faturas : "fatura_id"
  viagens_itens }o--|| viagens_solicitacoes : "solicitacao_id"
  viagens_solicitacoes }o--o| empresa_departamentos : "departamento_id"
  viagens_solicitacoes }o--o| eventos : "evento_id"
  viagens_solicitacoes }o--o| eventos_inscricoes : "evento_inscricao_id"
  viagens_solicitacoes }o--o| usuarios : "atendido_por"
  viagens_solicitacoes }o--o| usuarios : "beneficiario_usuario_id"
  viagens_solicitacoes }o--o| usuarios : "solicitante_id"
  viagens_telegram_conversas }o--|| usuarios : "usuario_id"
```
