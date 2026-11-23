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
    uuid projeto_id FK
    uuid formulario_id FK
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
    uuid recorrencia_proxima_id FK
    uuid procedimento_id FK
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
  demandas_etiquetas {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  demandas_filtros_salvos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
  }
  demandas_formularios {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid responsavel_id FK
    uuid modelo_id FK
  }
  demandas_modelo_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid modelo_id FK
    uuid procedimento_id FK
  }
  demandas_modelos {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  demandas_regras {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid demanda_id FK
    uuid pessoa_id FK
    uuid etiqueta_id FK
    uuid criada_por FK
  }
  demandas_regras_execucoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid regra_id FK
    uuid tarefa_id FK
  }
  demandas_seguidores {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
    uuid tarefa_id FK
    uuid demanda_id FK
  }
  demandas_tarefa_comentarios {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid tarefa_id FK
    uuid autor_id FK
  }
  demandas_tarefa_dependencias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid tarefa_id FK
    uuid depende_de_id FK
  }
  demandas_tarefa_etiquetas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid tarefa_id FK
    uuid etiqueta_id FK
  }
  demandas_tarefa_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid tarefa_id FK
  }
  ferramentas_anomalias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid responsavel_id FK
  }
  ferramentas_anomalias_sugestoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid anomalia_id FK
    uuid decidido_por FK
  }
  projeto {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid autorizacao_autoriza_id FK
    uuid centro_custo_id FK
  }
  projeto_marcos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid projeto_id FK
  }
  assinaturas }o--o| diretoria_atas : "ata_id"
  assinaturas }o--o| usuarios : "assinador_id"
  demandas }o--o| demandas_formularios : "formulario_id"
  demandas }o--o| projeto : "projeto_id"
  demandas }o--o| usuarios : "criado_por"
  demandas }o--o| usuarios : "membro_responsavel_id"
  demandas_check }o--o| demandas : "demanda_id"
  demandas_check_tarefas }o--o| demandas : "demanda_id"
  demandas_check_tarefas }o--o| demandas_check : "checklist_id"
  demandas_check_tarefas }o--o| demandas_check_tarefas : "recorrencia_proxima_id"
  demandas_check_tarefas }o--o| fa_documentos : "procedimento_id"
  demandas_check_tarefas }o--o| ferramentas_anomalias : "anomalia_id"
  demandas_check_tarefas }o--o| projeto : "projeto_id"
  demandas_check_tarefas }o--o| usuarios : "demandado_id"
  demandas_check_tarefas }o--o| usuarios : "demandante_id"
  demandas_comentarios }o--o| demandas : "demanda_id"
  demandas_departamentos }o--|| demandas_check_tarefas : "tarefa_id"
  demandas_departamentos }o--|| empresa_departamentos : "departamento_id"
  demandas_filtros_salvos }o--|| usuarios : "usuario_id"
  demandas_formularios }o--o| demandas_modelos : "modelo_id"
  demandas_formularios }o--o| usuarios : "responsavel_id"
  demandas_modelo_itens }o--o| fa_documentos : "procedimento_id"
  demandas_modelo_itens }o--|| demandas_modelos : "modelo_id"
  demandas_regras }o--o| demandas : "demanda_id"
  demandas_regras }o--o| demandas_etiquetas : "etiqueta_id"
  demandas_regras }o--o| usuarios : "criada_por"
  demandas_regras }o--o| usuarios : "pessoa_id"
  demandas_regras_execucoes }o--o| demandas_check_tarefas : "tarefa_id"
  demandas_regras_execucoes }o--|| demandas_regras : "regra_id"
  demandas_seguidores }o--o| demandas : "demanda_id"
  demandas_seguidores }o--o| demandas_check_tarefas : "tarefa_id"
  demandas_seguidores }o--|| usuarios : "usuario_id"
  demandas_tarefa_comentarios }o--o| usuarios : "autor_id"
  demandas_tarefa_comentarios }o--|| demandas_check_tarefas : "tarefa_id"
  demandas_tarefa_dependencias }o--|| demandas_check_tarefas : "depende_de_id"
  demandas_tarefa_dependencias }o--|| demandas_check_tarefas : "tarefa_id"
  demandas_tarefa_etiquetas }o--|| demandas_check_tarefas : "tarefa_id"
  demandas_tarefa_etiquetas }o--|| demandas_etiquetas : "etiqueta_id"
  demandas_tarefa_itens }o--|| demandas_check_tarefas : "tarefa_id"
  ferramentas_anomalias }o--o| usuarios : "responsavel_id"
  ferramentas_anomalias_sugestoes }o--o| ferramentas_anomalias : "anomalia_id"
  ferramentas_anomalias_sugestoes }o--o| usuarios : "decidido_por"
  projeto }o--o| centros_de_custo : "centro_custo_id"
  projeto }o--o| usuarios : "autorizacao_autoriza_id"
  projeto_marcos }o--|| projeto : "projeto_id"
```
