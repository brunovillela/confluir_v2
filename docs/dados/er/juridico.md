<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Jurídico

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/juridico.md).

```mermaid
erDiagram
  juridico_configuracoes {
    uuid id PK
    uuid centro_custo_id FK
  }
  juridico_homologacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid filiado_id FK
    uuid fonte_pg_id FK
    uuid sindicato_id FK
    uuid registrado_por_id FK
  }
  juridico_processos {
    uuid id PK
    uuid assessoria_id FK
    uuid emp_proprietaria_id FK
    uuid responsavel_id FK
    uuid registrado_por_id FK
  }
  juridico_processos_filiados {
    uuid processo_id PK,FK
    uuid filiado_id PK,FK
  }
  juridico_reembolsos {
    uuid id PK
    uuid processo_id FK
    uuid ordem_pagamento_id FK
    uuid emp_proprietaria_id FK
    uuid solicitante_id FK
    uuid avaliador_id FK
  }
  juridico_configuracoes }o--o| centros_de_custo : "centro_custo_id"
  juridico_homologacoes }o--o| empresa : "fonte_pg_id"
  juridico_homologacoes }o--o| empresa : "sindicato_id"
  juridico_homologacoes }o--o| filiacoes : "filiado_id"
  juridico_homologacoes }o--o| usuarios : "registrado_por_id"
  juridico_processos }o--o| empresa : "assessoria_id"
  juridico_processos }o--o| usuarios : "registrado_por_id"
  juridico_processos }o--o| usuarios : "responsavel_id"
  juridico_processos_filiados }o--|| filiacoes : "filiado_id"
  juridico_processos_filiados }o--|| juridico_processos : "processo_id"
  juridico_reembolsos }o--o| juridico_processos : "processo_id"
  juridico_reembolsos }o--o| ordens_pagamento : "ordem_pagamento_id"
  juridico_reembolsos }o--o| usuarios : "avaliador_id"
  juridico_reembolsos }o--o| usuarios : "solicitante_id"
```
