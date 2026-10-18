<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Comunicação, eventos e avisos

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/comunicacao.md).

```mermaid
erDiagram
  avisos_entregas {
    uuid id PK
  }
  comunicacao_aniversario_config {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizado_por FK
  }
  comunicacao_aniversario_modelos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizado_por FK
  }
  comunicacao_canais {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  comunicacao_envios {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid mensagem_id FK
    uuid filiacao_id FK
    uuid whatsapp_por FK
  }
  comunicacao_etiquetas_emissoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
  }
  comunicacao_fontes {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  comunicacao_links {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid criado_por FK
  }
  comunicacao_links_config {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  comunicacao_mensagens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid criado_por FK
    uuid atualizado_por FK
  }
  comunicacao_politica {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizada_por FK
  }
  comunicacao_qrcodes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid criado_por FK
  }
  comunicacao_resumo_config {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  comunicacao_resumos {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  comunicacao_slides {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid conjunto_id FK
    uuid criado_por FK
  }
  comunicacao_slides_conjuntos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid criado_por FK
  }
  comunicacao_textos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid canal_id FK
    uuid origem_id FK
    uuid solicitado_por FK
  }
  eventos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid agenda_id FK
    uuid criado_por FK
  }
  eventos_campos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid evento_id FK
  }
  eventos_config {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizada_por FK
  }
  eventos_dias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid evento_id FK
  }
  eventos_inscricao_respostas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid inscricao_id FK
    uuid campo_id FK
  }
  eventos_inscricoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid evento_id FK
    uuid titular_id FK
    uuid reservada_por FK
    uuid filiacao_id FK
    uuid termo_id FK
    uuid termo_foto_id FK
    uuid avaliada_por FK
  }
  eventos_presencas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid inscricao_id FK
    uuid dia_id FK
    uuid confirmada_por FK
  }
  eventos_termos {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  eventos_titular_sessao {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  noticias {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  notificacoes {
    uuid id PK
    uuid usuario_id FK
    uuid registro_ponto_id_fk FK
    uuid contracheque_id_fk FK
  }
  push_assinaturas {
    uuid id PK
    uuid usuario_id FK
  }
  comunicacao_aniversario_config }o--o| usuarios : "atualizado_por"
  comunicacao_aniversario_modelos }o--o| usuarios : "atualizado_por"
  comunicacao_envios }o--o| comunicacao_mensagens : "mensagem_id"
  comunicacao_envios }o--o| filiacoes : "filiacao_id"
  comunicacao_envios }o--o| usuarios : "whatsapp_por"
  comunicacao_etiquetas_emissoes }o--o| usuarios : "usuario_id"
  comunicacao_links }o--o| usuarios : "criado_por"
  comunicacao_mensagens }o--o| usuarios : "atualizado_por"
  comunicacao_mensagens }o--o| usuarios : "criado_por"
  comunicacao_politica }o--o| usuarios : "atualizada_por"
  comunicacao_qrcodes }o--o| usuarios : "criado_por"
  comunicacao_slides }o--o| comunicacao_slides_conjuntos : "conjunto_id"
  comunicacao_slides }o--o| usuarios : "criado_por"
  comunicacao_slides_conjuntos }o--o| usuarios : "criado_por"
  comunicacao_textos }o--o| comunicacao_canais : "canal_id"
  comunicacao_textos }o--o| comunicacao_textos : "origem_id"
  comunicacao_textos }o--o| usuarios : "solicitado_por"
  eventos }o--o| agenda : "agenda_id"
  eventos }o--o| usuarios : "criado_por"
  eventos_campos }o--o| eventos : "evento_id"
  eventos_config }o--o| usuarios : "atualizada_por"
  eventos_dias }o--o| eventos : "evento_id"
  eventos_inscricao_respostas }o--o| eventos_campos : "campo_id"
  eventos_inscricao_respostas }o--o| eventos_inscricoes : "inscricao_id"
  eventos_inscricoes }o--o| eventos : "evento_id"
  eventos_inscricoes }o--o| eventos_inscricoes : "titular_id"
  eventos_inscricoes }o--o| eventos_termos : "termo_foto_id"
  eventos_inscricoes }o--o| eventos_termos : "termo_id"
  eventos_inscricoes }o--o| filiacoes : "filiacao_id"
  eventos_inscricoes }o--o| usuarios : "avaliada_por"
  eventos_inscricoes }o--o| usuarios : "reservada_por"
  eventos_presencas }o--o| eventos_dias : "dia_id"
  eventos_presencas }o--o| eventos_inscricoes : "inscricao_id"
  eventos_presencas }o--o| usuarios : "confirmada_por"
  notificacoes }o--o| pessoal_contracheques : "contracheque_id_fk"
  notificacoes }o--o| pessoal_registro_ponto : "registro_ponto_id_fk"
  notificacoes }o--|| usuarios : "usuario_id"
  push_assinaturas }o--|| usuarios : "usuario_id"
```
