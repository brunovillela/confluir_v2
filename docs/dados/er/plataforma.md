<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Plataforma, acesso e auditoria

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/plataforma.md).

```mermaid
erDiagram
  analitica_atualizacoes {
    text fato PK
  }
  api_chaves {
    uuid id PK
  }
  api_requisicoes {
    bigint id PK
    uuid emp_proprietaria_id FK
    uuid chave_id FK
  }
  auditoria {
    bigint id PK
  }
  auditoria_regras {
    uuid id PK
    uuid atualizado_por FK
  }
  auth_codigos_envios {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  auth_identidades {
    uuid auth_user_id PK
    uuid emp_proprietaria_id PK,FK
  }
  auth_vinculos_pendentes {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  empresa {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid mesclado_em_id FK
    uuid mesclado_por FK
    uuid fonte_categoria_id FK
  }
  empresa_contatos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid empresa_id FK
  }
  empresa_departamentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid coordenador_id FK
    uuid organizacao_id FK
  }
  empresa_departamentos_integrantes {
    uuid departamento_id PK,FK
    uuid usuario_id PK,FK
  }
  empresa_sede {
    uuid id PK
    uuid emp_ref_id FK
    uuid emp_proprietaria_id FK
  }
  lgpd_bloqueios_litigio {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid criado_por FK
    uuid encerrado_por FK
  }
  lgpd_exportacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
  }
  lgpd_regras_retencao {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid ativada_por FK
  }
  lgpd_retencao_execucoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid regra_id FK
    uuid usuario_id FK
  }
  lgpd_solicitacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid filiacao_id FK
    uuid usuario_id FK
    uuid executado_por_id FK
    uuid inscricao_id FK
    uuid acesso_removido_por FK
  }
  login_tentativas {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  perfil_permissoes {
    uuid id PK
    uuid perfil_id FK
    uuid emp_proprietaria_id FK
  }
  perfis {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  permissoes {
    uuid id PK
    uuid usuario_id FK
  }
  permissoes_compras_depto {
    uuid permissao_id PK,FK
    uuid departamento_id PK,FK
  }
  plataforma_admins {
    uuid id PK
  }
  tenants {
    uuid id PK
    uuid empresa_id FK
  }
  usuario_perfis {
    uuid id PK
    uuid usuario_id FK
    uuid perfil_id FK
    uuid emp_proprietaria_id FK
  }
  usuarios {
    uuid id PK
    uuid sindicato_id FK
    uuid emp_proprietaria_id FK
    uuid unificado_em_id FK
  }
  usuarios_ocupacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid conta_id FK
    uuid pessoa_id FK
    uuid registrado_por_id FK
  }
  usuarios_unificacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid principal_usuario_id FK
    uuid secundario_usuario_id FK
    uuid feito_por_id FK
  }
  webhooks {
    uuid id PK
  }
  webhooks_entregas {
    uuid id PK
    uuid webhook_id FK
  }
  api_requisicoes }o--o| api_chaves : "chave_id"
  auditoria_regras }o--o| usuarios : "atualizado_por"
  empresa }o--o| empresa : "mesclado_em_id"
  empresa }o--o| fonte_categorias : "fonte_categoria_id"
  empresa }o--o| usuarios : "mesclado_por"
  empresa_contatos }o--o| empresa : "empresa_id"
  empresa_departamentos }o--o| empresa : "organizacao_id"
  empresa_departamentos }o--o| usuarios : "coordenador_id"
  empresa_departamentos_integrantes }o--|| empresa_departamentos : "departamento_id"
  empresa_departamentos_integrantes }o--|| usuarios : "usuario_id"
  empresa_sede }o--o| empresa : "emp_ref_id"
  lgpd_bloqueios_litigio }o--o| usuarios : "criado_por"
  lgpd_bloqueios_litigio }o--o| usuarios : "encerrado_por"
  lgpd_exportacoes }o--o| usuarios : "usuario_id"
  lgpd_regras_retencao }o--o| usuarios : "ativada_por"
  lgpd_retencao_execucoes }o--o| lgpd_regras_retencao : "regra_id"
  lgpd_retencao_execucoes }o--o| usuarios : "usuario_id"
  lgpd_solicitacoes }o--o| eventos_inscricoes : "inscricao_id"
  lgpd_solicitacoes }o--o| filiacoes : "filiacao_id"
  lgpd_solicitacoes }o--o| usuarios : "acesso_removido_por"
  lgpd_solicitacoes }o--o| usuarios : "executado_por_id"
  lgpd_solicitacoes }o--o| usuarios : "usuario_id"
  perfil_permissoes }o--|| perfis : "perfil_id"
  permissoes }o--o| usuarios : "usuario_id"
  permissoes_compras_depto }o--|| empresa_departamentos : "departamento_id"
  permissoes_compras_depto }o--|| permissoes : "permissao_id"
  tenants }o--|| empresa : "empresa_id"
  usuario_perfis }o--|| perfis : "perfil_id"
  usuario_perfis }o--|| usuarios : "usuario_id"
  usuarios }o--o| empresa : "sindicato_id"
  usuarios }o--o| usuarios : "unificado_em_id"
  usuarios_ocupacoes }o--o| usuarios : "registrado_por_id"
  usuarios_ocupacoes }o--|| usuarios : "conta_id"
  usuarios_ocupacoes }o--|| usuarios : "pessoa_id"
  usuarios_unificacoes }o--o| usuarios : "feito_por_id"
  usuarios_unificacoes }o--o| usuarios : "principal_usuario_id"
  usuarios_unificacoes }o--o| usuarios : "secundario_usuario_id"
  webhooks_entregas }o--|| webhooks : "webhook_id"
```
