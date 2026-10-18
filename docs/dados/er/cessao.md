<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Cessão de espaços

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/cessao.md).

```mermaid
erDiagram
  cessao_custeio_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid solicitacao_id FK
  }
  cessao_espaco_bloqueios {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid espaco_id FK
    uuid encerrado_por_id FK
    uuid criado_por_id FK
  }
  cessao_espaco_exigencias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid espaco_id FK
  }
  cessao_espaco_janelas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid espaco_id FK
  }
  cessao_espaco_recintos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid espaco_id FK
    uuid recinto_id FK
  }
  cessao_espacos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid sede_id FK
    uuid responsavel_visita_id FK
    uuid criado_por_id FK
  }
  cessao_solicitacao_eventos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid solicitacao_id FK
    uuid usuario_id FK
  }
  cessao_solicitacao_exigencias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid solicitacao_id FK
  }
  cessao_solicitacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid espaco_id FK
    uuid filiacao_id FK
    uuid usuario_id FK
    uuid analista_id FK
    uuid visita_responsavel_id FK
    uuid autorizacao_por_id FK
    uuid confirmada_por_id FK
    uuid termo_gerado_por_id FK
  }
  cessao_termos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid criado_por_id FK
  }
  cessao_custeio_itens }o--o| cessao_solicitacoes : "solicitacao_id"
  cessao_espaco_bloqueios }o--o| cessao_espacos : "espaco_id"
  cessao_espaco_bloqueios }o--o| usuarios : "criado_por_id"
  cessao_espaco_bloqueios }o--o| usuarios : "encerrado_por_id"
  cessao_espaco_exigencias }o--o| cessao_espacos : "espaco_id"
  cessao_espaco_janelas }o--o| cessao_espacos : "espaco_id"
  cessao_espaco_recintos }o--o| cessao_espacos : "espaco_id"
  cessao_espaco_recintos }o--o| patrimonio_recinto : "recinto_id"
  cessao_espacos }o--o| empresa_sede : "sede_id"
  cessao_espacos }o--o| usuarios : "criado_por_id"
  cessao_espacos }o--o| usuarios : "responsavel_visita_id"
  cessao_solicitacao_eventos }o--o| cessao_solicitacoes : "solicitacao_id"
  cessao_solicitacao_eventos }o--o| usuarios : "usuario_id"
  cessao_solicitacao_exigencias }o--o| cessao_solicitacoes : "solicitacao_id"
  cessao_solicitacoes }o--o| cessao_espacos : "espaco_id"
  cessao_solicitacoes }o--o| filiacoes : "filiacao_id"
  cessao_solicitacoes }o--o| usuarios : "analista_id"
  cessao_solicitacoes }o--o| usuarios : "autorizacao_por_id"
  cessao_solicitacoes }o--o| usuarios : "confirmada_por_id"
  cessao_solicitacoes }o--o| usuarios : "termo_gerado_por_id"
  cessao_solicitacoes }o--o| usuarios : "usuario_id"
  cessao_solicitacoes }o--o| usuarios : "visita_responsavel_id"
  cessao_termos }o--o| usuarios : "criado_por_id"
```
