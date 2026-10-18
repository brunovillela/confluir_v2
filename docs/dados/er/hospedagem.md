<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Hospedagem

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/hospedagem.md).

```mermaid
erDiagram
  fil_reemb_hospedagem {
    uuid id PK
  }
  hospedagem_acomodacoes {
    uuid id PK
    uuid hotel_id FK
  }
  hospedagem_alocacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid hotel_id FK
  }
  hospedagem_avaliacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid cupom_id FK
    uuid hotel_id FK
    uuid filiado_id FK
    uuid tratada_por_id FK
    uuid ocultada_por_id FK
  }
  hospedagem_beneficiarios {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid incluido_por FK
  }
  hospedagem_coletiva {
    uuid id PK
    uuid acomodacao_id FK
  }
  hospedagem_condicoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizada_por FK
  }
  hospedagem_cupom {
    uuid id PK
    uuid servico_id FK
    uuid filiado_id FK
    uuid hotel_id FK
    uuid emergencial_por_id FK
  }
  hospedagem_espera {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid hotel_id FK
    uuid filiado_id FK
  }
  hospedagem_fatura {
    uuid id PK
    uuid hotel_id FK
    uuid ordem_pagamento_id FK
  }
  hospedagem_hotel {
    uuid id PK
    uuid empresa_id FK
    uuid contrato_id FK
    uuid emp_proprietaria_id FK
  }
  hospedagem_hotel_contas {
    uuid id PK
    uuid hotel_id FK
    uuid emp_proprietaria_id FK
  }
  hospedagem_hotel_usuarios {
    uuid id PK
    uuid hotel_id FK
    uuid emp_proprietaria_id FK
  }
  hospedagem_penalidade_liberacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid liberado_por FK
  }
  hospedagem_quartos_noite {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid hotel_id FK
  }
  hospedagem_reembolso {
    uuid id PK
    uuid ordem_pagamento_id FK
  }
  hospedagem_servico {
    uuid id PK
    uuid hotel_id FK
    uuid fatura_id FK
    uuid emp_proprietaria_id FK
    uuid acomodacao_id FK
  }
  hospedagem_tarifas {
    uuid id PK
    uuid hotel_id FK
  }
  hospedagem_acomodacoes }o--o| hospedagem_hotel : "hotel_id"
  hospedagem_alocacoes }o--o| hospedagem_hotel : "hotel_id"
  hospedagem_avaliacoes }o--o| filiacoes : "filiado_id"
  hospedagem_avaliacoes }o--o| usuarios : "ocultada_por_id"
  hospedagem_avaliacoes }o--o| usuarios : "tratada_por_id"
  hospedagem_avaliacoes }o--|| hospedagem_cupom : "cupom_id"
  hospedagem_avaliacoes }o--|| hospedagem_hotel : "hotel_id"
  hospedagem_beneficiarios }o--o| usuarios : "incluido_por"
  hospedagem_coletiva }o--o| hospedagem_acomodacoes : "acomodacao_id"
  hospedagem_condicoes }o--o| usuarios : "atualizada_por"
  hospedagem_cupom }o--o| filiacoes : "filiado_id"
  hospedagem_cupom }o--o| hospedagem_hotel : "hotel_id"
  hospedagem_cupom }o--o| hospedagem_hotel_usuarios : "emergencial_por_id"
  hospedagem_cupom }o--o| hospedagem_servico : "servico_id"
  hospedagem_espera }o--o| filiacoes : "filiado_id"
  hospedagem_espera }o--o| hospedagem_hotel : "hotel_id"
  hospedagem_fatura }o--o| hospedagem_hotel : "hotel_id"
  hospedagem_fatura }o--o| ordens_pagamento : "ordem_pagamento_id"
  hospedagem_hotel }o--o| contratos : "contrato_id"
  hospedagem_hotel }o--o| empresa : "empresa_id"
  hospedagem_hotel_contas }o--|| hospedagem_hotel : "hotel_id"
  hospedagem_hotel_usuarios }o--|| hospedagem_hotel : "hotel_id"
  hospedagem_penalidade_liberacoes }o--o| usuarios : "liberado_por"
  hospedagem_quartos_noite }o--o| hospedagem_hotel : "hotel_id"
  hospedagem_reembolso }o--o| ordens_pagamento : "ordem_pagamento_id"
  hospedagem_servico }o--o| hospedagem_acomodacoes : "acomodacao_id"
  hospedagem_servico }o--o| hospedagem_fatura : "fatura_id"
  hospedagem_servico }o--o| hospedagem_hotel : "hotel_id"
  hospedagem_tarifas }o--o| hospedagem_hotel : "hotel_id"
```
