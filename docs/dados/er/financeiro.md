<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Financeiro

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/financeiro.md).

```mermaid
erDiagram
  banco_extratos {
    uuid id PK
  }
  banco_lancamentos {
    uuid id PK
    uuid extrato_id FK
    uuid ordem_id FK
    uuid comprovacao_id FK
    uuid cobranca_id FK
  }
  caixa_contas {
    uuid id PK
    uuid responsavel_usuario_id FK
    uuid criada_por_usuario_id FK
  }
  caixa_movimentacoes {
    uuid id PK
    uuid conta_id FK
    uuid criada_por_usuario_id FK
    uuid ordem_pagamento_id FK
    uuid reconhecimento_por_usuario_id FK
    uuid transferida_de_mov_id FK
  }
  caixa_ocorrencias {
    uuid id PK
    uuid conta_id FK
    uuid relatada_por_usuario_id FK
    uuid resolvida_por_usuario_id FK
  }
  caixa_prestacoes {
    uuid id PK
    uuid conta_id FK
    uuid aberta_por_usuario_id FK
    uuid decidida_por_usuario_id FK
  }
  cartoes {
    uuid id PK
    uuid titular_usuario_id FK
    uuid criado_por_usuario_id FK
  }
  centros_de_custo {
    uuid id PK
    uuid departamento_id FK
    uuid emp_proprietaria_id FK
  }
  danfes_ordens {
    uuid danfe_id PK,FK
    uuid ordem_id PK,FK
  }
  danfes_recibos {
    uuid id PK
    uuid fornecedor_id FK
    uuid compra_id FK
    uuid contrato_id FK
  }
  despesas {
    uuid id PK
    uuid ordem_pagamento_id FK
  }
  financeiro_caixa {
    uuid id PK
    uuid dono_conta_id FK
    uuid transf_aportador_id FK
    uuid transf_recebedor_id FK
    uuid emp_proprietaria_id FK
    uuid ordem_pagamento_id FK
    uuid transferencia_origem_id FK
  }
  financeiro_cartao_faturas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid cartao_id FK
    uuid fechada_por_usuario_id FK
    uuid centro_diferenca_id FK
    uuid ordem_pagamento_id FK
  }
  financeiro_config {
    uuid emp_proprietaria_id PK
    uuid centro_custo_caixa_id FK
  }
  financeiro_contas_bancarias {
    uuid id PK
    uuid centro_custo_id FK
  }
  financeiro_despesas {
    uuid id PK
  }
  financeiro_diarias {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  financeiro_orcamentos {
    uuid id PK
    uuid centro_custo_id FK
  }
  financeiro_remessa_itens {
    uuid id PK
    uuid remessa_id FK
    uuid ordem_id FK
  }
  financeiro_remessas {
    uuid id PK
    uuid conta_bancaria_id FK
  }
  financeiro_tributos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid beneficiario_empresa_id FK
    uuid centro_custo_despesa_id FK
    uuid departamento_id FK
    uuid criado_por_usuario_id FK
  }
  financeiro_tributos_lancamentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid tributo_id FK
    uuid ordem_pagamento_id FK
    uuid criado_por_usuario_id FK
  }
  ordens_pagamento {
    uuid id PK
    uuid fornecedor_id FK
    uuid emp_proprietaria_id FK
    uuid beneficiario_fornecedor_id FK
    uuid beneficiario_usuario_id FK
    uuid autorizacao_autorizador_id FK
    uuid pagador_id FK
    uuid departamento_id FK
    uuid centro_custo_despesa_id FK
    uuid centro_custo_receita_id FK
    uuid processo_compra_id FK
    uuid contrato_id FK
    uuid contrato_aluguel_id FK
    uuid custeio_id FK
    uuid projeto_id FK
    uuid cartao_id FK
    uuid caixa_conta_id FK
    uuid dados_bancarios_id FK
    uuid cancelado_por_id FK
    uuid fornecimento_id FK
    uuid cartao_fatura_id FK
    uuid tributo_lancamento_id FK
  }
  ordens_pagamento_estornos {
    uuid id PK
    uuid ordem_id FK
    uuid registrado_por_id FK
    uuid responsavel_id FK
    uuid resolvido_por_id FK
  }
  ordens_pagamento_eventos {
    uuid id PK
    uuid ordem_id FK
    uuid usuario_id FK
  }
  ordens_pagamento_rateio {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid ordem_id FK
    uuid centro_custo_despesa_id FK
    uuid departamento_id FK
  }
  ordens_pagamento_verificacoes {
    uuid id PK
    uuid ordem_id FK
  }
  banco_lancamentos }o--o| filiacao_cobrancas : "cobranca_id"
  banco_lancamentos }o--o| filiacao_recebe_comprovacao : "comprovacao_id"
  banco_lancamentos }o--o| ordens_pagamento : "ordem_id"
  banco_lancamentos }o--|| banco_extratos : "extrato_id"
  caixa_contas }o--o| usuarios : "criada_por_usuario_id"
  caixa_contas }o--|| usuarios : "responsavel_usuario_id"
  caixa_movimentacoes }o--o| caixa_movimentacoes : "transferida_de_mov_id"
  caixa_movimentacoes }o--o| ordens_pagamento : "ordem_pagamento_id"
  caixa_movimentacoes }o--o| usuarios : "criada_por_usuario_id"
  caixa_movimentacoes }o--o| usuarios : "reconhecimento_por_usuario_id"
  caixa_movimentacoes }o--|| caixa_contas : "conta_id"
  caixa_ocorrencias }o--o| usuarios : "relatada_por_usuario_id"
  caixa_ocorrencias }o--o| usuarios : "resolvida_por_usuario_id"
  caixa_ocorrencias }o--|| caixa_contas : "conta_id"
  caixa_prestacoes }o--o| usuarios : "aberta_por_usuario_id"
  caixa_prestacoes }o--o| usuarios : "decidida_por_usuario_id"
  caixa_prestacoes }o--|| caixa_contas : "conta_id"
  cartoes }o--o| usuarios : "criado_por_usuario_id"
  cartoes }o--o| usuarios : "titular_usuario_id"
  centros_de_custo }o--o| empresa_departamentos : "departamento_id"
  danfes_ordens }o--|| danfes_recibos : "danfe_id"
  danfes_ordens }o--|| ordens_pagamento : "ordem_id"
  danfes_recibos }o--o| compras_solicitacao : "compra_id"
  danfes_recibos }o--o| contratos : "contrato_id"
  danfes_recibos }o--o| empresa : "fornecedor_id"
  despesas }o--o| ordens_pagamento : "ordem_pagamento_id"
  financeiro_caixa }o--o| financeiro_caixa : "transferencia_origem_id"
  financeiro_caixa }o--o| ordens_pagamento : "ordem_pagamento_id"
  financeiro_caixa }o--o| usuarios : "dono_conta_id"
  financeiro_caixa }o--o| usuarios : "transf_aportador_id"
  financeiro_caixa }o--o| usuarios : "transf_recebedor_id"
  financeiro_cartao_faturas }o--o| centros_de_custo : "centro_diferenca_id"
  financeiro_cartao_faturas }o--o| ordens_pagamento : "ordem_pagamento_id"
  financeiro_cartao_faturas }o--o| usuarios : "fechada_por_usuario_id"
  financeiro_cartao_faturas }o--|| cartoes : "cartao_id"
  financeiro_config }o--o| centros_de_custo : "centro_custo_caixa_id"
  financeiro_contas_bancarias }o--o| centros_de_custo : "centro_custo_id"
  financeiro_orcamentos }o--|| centros_de_custo : "centro_custo_id"
  financeiro_remessa_itens }o--|| financeiro_remessas : "remessa_id"
  financeiro_remessa_itens }o--|| ordens_pagamento : "ordem_id"
  financeiro_remessas }o--|| financeiro_contas_bancarias : "conta_bancaria_id"
  financeiro_tributos }o--o| centros_de_custo : "centro_custo_despesa_id"
  financeiro_tributos }o--o| empresa : "beneficiario_empresa_id"
  financeiro_tributos }o--o| empresa_departamentos : "departamento_id"
  financeiro_tributos }o--o| usuarios : "criado_por_usuario_id"
  financeiro_tributos_lancamentos }o--o| ordens_pagamento : "ordem_pagamento_id"
  financeiro_tributos_lancamentos }o--o| usuarios : "criado_por_usuario_id"
  financeiro_tributos_lancamentos }o--|| financeiro_tributos : "tributo_id"
  ordens_pagamento }o--o| caixa_contas : "caixa_conta_id"
  ordens_pagamento }o--o| cartoes : "cartao_id"
  ordens_pagamento }o--o| centros_de_custo : "centro_custo_despesa_id"
  ordens_pagamento }o--o| centros_de_custo : "centro_custo_receita_id"
  ordens_pagamento }o--o| compras_fornecimentos : "fornecimento_id"
  ordens_pagamento }o--o| compras_solicitacoes : "processo_compra_id"
  ordens_pagamento }o--o| contratos : "contrato_id"
  ordens_pagamento }o--o| dados_bancarios : "dados_bancarios_id"
  ordens_pagamento }o--o| empresa : "beneficiario_fornecedor_id"
  ordens_pagamento }o--o| empresa : "fornecedor_id"
  ordens_pagamento }o--o| empresa_departamentos : "departamento_id"
  ordens_pagamento }o--o| financeiro_cartao_faturas : "cartao_fatura_id"
  ordens_pagamento }o--o| financeiro_tributos_lancamentos : "tributo_lancamento_id"
  ordens_pagamento }o--o| institucional_custeios : "custeio_id"
  ordens_pagamento }o--o| projeto : "projeto_id"
  ordens_pagamento }o--o| usuarios : "autorizacao_autorizador_id"
  ordens_pagamento }o--o| usuarios : "beneficiario_usuario_id"
  ordens_pagamento }o--o| usuarios : "cancelado_por_id"
  ordens_pagamento }o--o| usuarios : "pagador_id"
  ordens_pagamento }o--o| veiculo_contratos_aluguel : "contrato_aluguel_id"
  ordens_pagamento_estornos }o--o| usuarios : "registrado_por_id"
  ordens_pagamento_estornos }o--o| usuarios : "resolvido_por_id"
  ordens_pagamento_estornos }o--o| usuarios : "responsavel_id"
  ordens_pagamento_estornos }o--|| ordens_pagamento : "ordem_id"
  ordens_pagamento_eventos }o--o| usuarios : "usuario_id"
  ordens_pagamento_eventos }o--|| ordens_pagamento : "ordem_id"
  ordens_pagamento_rateio }o--o| centros_de_custo : "centro_custo_despesa_id"
  ordens_pagamento_rateio }o--o| empresa_departamentos : "departamento_id"
  ordens_pagamento_rateio }o--|| ordens_pagamento : "ordem_id"
  ordens_pagamento_verificacoes }o--|| ordens_pagamento : "ordem_id"
```
