<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Diretoria e ofícios

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/diretoria.md).

```mermaid
erDiagram
  dir_liberacao_historico {
    uuid id PK
    uuid usuario_id FK
    uuid filiado_id FK
    uuid mandato_id FK
  }
  diretoria_atas {
    uuid id PK
    uuid mandato_id FK
  }
  diretoria_ficha {
    uuid id PK
    uuid integrante_id FK
    uuid empregador_id FK
    uuid emp_proprietaria_id FK
  }
  diretoria_grupos {
    uuid id PK
    uuid mandato_id FK
  }
  diretoria_instancia_assentos {
    uuid id PK
    uuid instancia_id FK
    uuid integrante_id FK
    uuid mandato_id FK
  }
  diretoria_instancias {
    uuid id PK
  }
  diretoria_integrantes {
    uuid id PK
    uuid mandato_id FK
    uuid usuario_id FK
    uuid grupo_id FK
  }
  diretoria_liberacoes {
    uuid id PK
    uuid integrante_id FK
    uuid empresa_id FK
    uuid mandato_id FK
    uuid filiacao_id FK
    uuid oficio_id FK
  }
  diretoria_mandatos {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  oficios {
    uuid id PK
    uuid sede_id FK
    uuid destinatario_empresa_id FK
    uuid assinante_integrante_id FK
    uuid departamento_id FK
    uuid redator_id FK
    uuid enviado_por_id FK
    uuid cancelado_por_id FK
  }
  oficios_filiados {
    uuid id PK
    uuid oficio_id FK
  }
  dir_liberacao_historico }o--o| diretoria_mandatos : "mandato_id"
  dir_liberacao_historico }o--o| filiacoes : "filiado_id"
  dir_liberacao_historico }o--o| usuarios : "usuario_id"
  diretoria_atas }o--o| diretoria_mandatos : "mandato_id"
  diretoria_ficha }o--o| empresa : "empregador_id"
  diretoria_ficha }o--|| diretoria_integrantes : "integrante_id"
  diretoria_grupos }o--|| diretoria_mandatos : "mandato_id"
  diretoria_instancia_assentos }o--o| diretoria_integrantes : "integrante_id"
  diretoria_instancia_assentos }o--o| diretoria_mandatos : "mandato_id"
  diretoria_instancia_assentos }o--|| diretoria_instancias : "instancia_id"
  diretoria_integrantes }o--o| diretoria_grupos : "grupo_id"
  diretoria_integrantes }o--o| usuarios : "usuario_id"
  diretoria_integrantes }o--|| diretoria_mandatos : "mandato_id"
  diretoria_liberacoes }o--o| diretoria_integrantes : "integrante_id"
  diretoria_liberacoes }o--o| diretoria_mandatos : "mandato_id"
  diretoria_liberacoes }o--o| empresa : "empresa_id"
  diretoria_liberacoes }o--o| filiacoes : "filiacao_id"
  diretoria_liberacoes }o--o| oficios : "oficio_id"
  oficios }o--o| diretoria_integrantes : "assinante_integrante_id"
  oficios }o--o| empresa : "destinatario_empresa_id"
  oficios }o--o| empresa_departamentos : "departamento_id"
  oficios }o--o| empresa_sede : "sede_id"
  oficios }o--o| usuarios : "cancelado_por_id"
  oficios }o--o| usuarios : "enviado_por_id"
  oficios }o--o| usuarios : "redator_id"
  oficios_filiados }o--|| oficios : "oficio_id"
```
