<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Saúde do trabalhador

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/saude.md).

```mermaid
erDiagram
  saude_acompanhamento {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid tipo_id FK
    uuid assistido_id FK
  }
  saude_agenda_atendimentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid assistido_id FK
    uuid profissional_id FK
  }
  saude_assistidos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid filiado_id FK
    uuid empresa_id FK
  }
  saude_atendimentos {
    uuid id PK
    uuid atendente_id FK
    uuid assistido_id FK
    uuid emp_proprietaria_id FK
    uuid tipo_id FK
    uuid profissional_id FK
    uuid acompanhamento_id FK
  }
  saude_atendimentos_acessos {
    uuid id PK
    uuid atendimento_id FK
    uuid usuario_id FK
  }
  saude_atendimentos_relatorio {
    uuid atendimento_id PK,FK
    uuid autor_profissional_id FK
  }
  saude_atendimentos_tipos {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  saude_cat {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid empregador_id FK
    uuid filiado_id FK
    uuid cat_origem_id FK
    uuid duplicada_de_id FK
    uuid descartada_por FK
    uuid conferida_por FK
    uuid pendencia_por FK
  }
  saude_cat_duplicidades_ignoradas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid criado_por FK
  }
  saude_cat_import {
  }
  saude_cipa_agenda {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid empresa_id FK
    uuid unidade_id FK
  }
  saude_cipa_representantes {
    uuid id PK
    uuid reuniao_id FK
    uuid usuario_id FK
    uuid filiado_id FK
    uuid emp_proprietaria_id FK
  }
  saude_profissionais {
    uuid id PK
    uuid usuario_id FK
    uuid emp_proprietaria_id FK
    uuid tipo_id FK
  }
  saude_acompanhamento }o--o| saude_assistidos : "assistido_id"
  saude_acompanhamento }o--o| saude_atendimentos_tipos : "tipo_id"
  saude_agenda_atendimentos }o--o| saude_assistidos : "assistido_id"
  saude_agenda_atendimentos }o--o| saude_profissionais : "profissional_id"
  saude_assistidos }o--o| empresa : "empresa_id"
  saude_assistidos }o--o| filiacoes : "filiado_id"
  saude_atendimentos }o--o| saude_acompanhamento : "acompanhamento_id"
  saude_atendimentos }o--o| saude_assistidos : "assistido_id"
  saude_atendimentos }o--o| saude_atendimentos_tipos : "tipo_id"
  saude_atendimentos }o--o| saude_profissionais : "profissional_id"
  saude_atendimentos }o--o| usuarios : "atendente_id"
  saude_atendimentos_acessos }o--o| usuarios : "usuario_id"
  saude_atendimentos_acessos }o--|| saude_atendimentos : "atendimento_id"
  saude_atendimentos_relatorio }o--o| saude_profissionais : "autor_profissional_id"
  saude_atendimentos_relatorio }o--|| saude_atendimentos : "atendimento_id"
  saude_cat }o--o| empresa : "empregador_id"
  saude_cat }o--o| filiacoes : "filiado_id"
  saude_cat }o--o| saude_cat : "cat_origem_id"
  saude_cat }o--o| saude_cat : "duplicada_de_id"
  saude_cat }o--o| usuarios : "conferida_por"
  saude_cat }o--o| usuarios : "descartada_por"
  saude_cat }o--o| usuarios : "pendencia_por"
  saude_cat_duplicidades_ignoradas }o--o| usuarios : "criado_por"
  saude_cipa_agenda }o--o| empresa : "empresa_id"
  saude_cipa_agenda }o--o| voto_unidades_presenciais : "unidade_id"
  saude_cipa_representantes }o--o| filiacoes : "filiado_id"
  saude_cipa_representantes }o--o| usuarios : "usuario_id"
  saude_cipa_representantes }o--|| saude_cipa_agenda : "reuniao_id"
  saude_profissionais }o--o| saude_atendimentos_tipos : "tipo_id"
  saude_profissionais }o--|| usuarios : "usuario_id"
```
