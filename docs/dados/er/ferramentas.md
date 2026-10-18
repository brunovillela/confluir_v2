<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Ferramentas administrativas

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/ferramentas.md).

```mermaid
erDiagram
  assinaturas {
    uuid id PK
    uuid assinador_id FK
    uuid emp_proprietaria_id FK
    uuid ata_id FK
  }
  demandas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid membro_responsavel_id FK
    uuid criado_por FK
  }
  demandas_check {
    uuid id PK
    uuid demanda_id FK
    uuid emp_proprietaria_id FK
  }
  demandas_check_tarefas {
    uuid id PK
    uuid demandante_id FK
    uuid demandado_id FK
    uuid checklist_id FK
    uuid emp_proprietaria_id FK
    uuid projeto_id FK
    uuid anomalia_id FK
    uuid demanda_id FK
  }
  demandas_comentarios {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid demanda_id FK
  }
  demandas_departamentos {
    uuid tarefa_id PK,FK
    uuid departamento_id PK,FK
  }
  ferramentas_anomalias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid responsavel_id FK
  }
  projeto {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid autorizacao_autoriza_id FK
    uuid centro_custo_id FK
  }
  assinaturas }o--o| diretoria_atas : "ata_id"
  assinaturas }o--o| usuarios : "assinador_id"
  demandas }o--o| usuarios : "criado_por"
  demandas }o--o| usuarios : "membro_responsavel_id"
  demandas_check }o--o| demandas : "demanda_id"
  demandas_check_tarefas }o--o| demandas : "demanda_id"
  demandas_check_tarefas }o--o| demandas_check : "checklist_id"
  demandas_check_tarefas }o--o| ferramentas_anomalias : "anomalia_id"
  demandas_check_tarefas }o--o| projeto : "projeto_id"
  demandas_check_tarefas }o--o| usuarios : "demandado_id"
  demandas_check_tarefas }o--o| usuarios : "demandante_id"
  demandas_comentarios }o--o| demandas : "demanda_id"
  demandas_departamentos }o--|| demandas_check_tarefas : "tarefa_id"
  demandas_departamentos }o--|| empresa_departamentos : "departamento_id"
  ferramentas_anomalias }o--o| usuarios : "responsavel_id"
  projeto }o--o| centros_de_custo : "centro_custo_id"
  projeto }o--o| usuarios : "autorizacao_autoriza_id"
```
