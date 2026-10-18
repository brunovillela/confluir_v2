<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Empregadores e grupos empresariais

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/empregadores.md).

```mermaid
erDiagram
  empresas_categorias {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  empresas_categorias_empresas {
    uuid categoria_id PK,FK
    uuid empresa_id PK,FK
  }
  grupo_empresarial_membros {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid grupo_id FK
    uuid empresa_id FK
  }
  grupos_empresariais {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid empresa_pagadora_id FK
  }
  empresas_categorias_empresas }o--|| empresa : "empresa_id"
  empresas_categorias_empresas }o--|| empresas_categorias : "categoria_id"
  grupo_empresarial_membros }o--o| empresa : "empresa_id"
  grupo_empresarial_membros }o--o| grupos_empresariais : "grupo_id"
  grupos_empresariais }o--o| empresa : "empresa_pagadora_id"
```
