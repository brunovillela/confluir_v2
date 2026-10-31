<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Pessoal (RH da entidade)

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/pessoal.md).

```mermaid
erDiagram
  aso {
    uuid id PK
    uuid funcionario_id FK
  }
  pes_atestados_medicos {
    uuid id PK
    uuid funcionario_id FK
  }
  pessoal_anuenio {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid nivel_atual_id FK
    uuid proximo_nivel_id FK
  }
  pessoal_anuenio_base {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid sindicato_id FK
  }
  pessoal_atividade_medidas_seguranca {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atividade_id FK
    uuid treinamento_id FK
    uuid risco_id FK
  }
  pessoal_atividades {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_atividades_executores {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid atividade_id FK
    uuid fornecedor_id FK
  }
  pessoal_atividades_ferramentas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atividades_id FK
    uuid atividade_id FK
  }
  pessoal_atividades_perigos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atividade_id FK
  }
  pessoal_atividades_riscos {
    uuid id PK
    uuid perigo_id FK
    uuid emp_proprietaria_id FK
    uuid atividade_id FK
    uuid executor_id FK
  }
  pessoal_atribuicoes_cargo {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid cargo_id FK
    uuid funcao_id FK
    uuid atividade_id FK
  }
  pessoal_ausencias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid atestado_id FK
    uuid ferias_id FK
    uuid falta_id FK
  }
  pessoal_cargo {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid sindicato_id FK
  }
  pessoal_contracheque_importacao_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid importacao_id FK
    uuid funcionario_id FK
    uuid contracheque_id FK
    uuid aplicado_por FK
  }
  pessoal_contracheque_importacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid remessa_id FK
    uuid criado_por FK
  }
  pessoal_contracheques {
    uuid id PK
    uuid funcionario_id FK
    uuid remessa_id FK
    uuid ordem_pagamento_id FK
  }
  pessoal_contracheques_config {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid centro_custo_despesa_id FK
    uuid departamento_id FK
    uuid atualizada_por FK
  }
  pessoal_contracheques_remessas {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_dependentes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
  }
  pessoal_diarias_centros_custo {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid departamento_id FK
    uuid despesa_tipo_id FK
    uuid centro_custo_id FK
  }
  pessoal_diarias_descontos {
    uuid id PK
    uuid diaria_solicitacao_id FK
    uuid infracao_id FK
  }
  pessoal_diarias_despesa_tipos {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_diarias_despesas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid lancamento_id FK
    uuid beneficiario_id FK
  }
  pessoal_diarias_lancamentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid remessa_id FK
    uuid beneficiario_id FK
    uuid tipo_id FK
  }
  pessoal_diarias_remessas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid beneficiario_id FK
    uuid departamento_id FK
    uuid avaliador_id FK
    uuid ordem_pagamento_id FK
    uuid enviado_por FK
    uuid devolvida_por FK
    uuid enviada_avaliacao_por FK
  }
  pessoal_diarias_solicitacao_despesas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid solicitacao_id FK
    uuid tipo_id FK
  }
  pessoal_diarias_solicitacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid diaria_id FK
    uuid avaliador_id FK
    uuid ordem_pagamento_id FK
    uuid departamento_id FK
    uuid solicitante_id FK
    uuid remessa_id FK
    uuid complemento_de FK
  }
  pessoal_faltas_config {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizado_por_id FK
  }
  pessoal_faltas_justificadas {
    uuid id PK
    uuid autorizador_id FK
    uuid funcionario_id FK
    uuid emp_proprietaria_id FK
    uuid periodo_id FK
    uuid solicitado_por_id FK
  }
  pessoal_faltas_justificadas_periodo {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_ferias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid trabalhador_id FK
    uuid empregador_id FK
  }
  pessoal_ferias_gozo {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid autorizador_id FK
    uuid empregador_id FK
    uuid ferias_periodo_id FK
  }
  pessoal_folha_competencias {
    uuid id PK
    uuid enviada_por FK
    uuid recebida_por FK
  }
  pessoal_folha_config {
    uuid emp_proprietaria_id PK,FK
    uuid marco_definido_por FK
  }
  pessoal_funcionario_funcao {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid funcao_id FK
  }
  pessoal_funcionario_jornada {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
  }
  pessoal_funcoes {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_ghe {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_ghe_membros {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid ghe_id FK
    uuid funcionario_id FK
  }
  pessoal_informes_rendimentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid remessa_id FK
  }
  pessoal_informes_rendimentos_remessas {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_nivel_salarial {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid nivel_atual_id FK
    uuid proximo_nivel_id FK
  }
  pessoal_nivel_salarial_base {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid cargo_id FK
    uuid sindicato_id FK
  }
  pessoal_plano_saude {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid titular_id FK
    uuid dependente_id FK
  }
  pessoal_ponto_importacao_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid importacao_id FK
    uuid funcionario_id FK
    uuid registro_id FK
    uuid aplicado_por FK
  }
  pessoal_ponto_importacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid remessa_id FK
    uuid criado_por FK
  }
  pessoal_ponto_isencoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid registrado_por FK
    uuid encerrado_por FK
  }
  pessoal_ponto_resenhas {
    uuid id PK
    uuid gerada_por FK
  }
  pessoal_reembolsos_act {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid funcionario_id FK
    uuid tipo_id FK
    uuid avaliador_id FK
  }
  pessoal_reembolsos_act_tipos {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_registro_ponto {
    uuid id PK
    uuid funcionario_id FK
    uuid remessa_id FK
  }
  pessoal_registro_ponto_remessas {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_telegram_arquivos {
    text chat_id PK
    uuid emp_proprietaria_id FK
    uuid usuario_id FK
  }
  pessoal_treinamentos {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  pessoal_treinamentos_alunos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid aluno_id FK
    uuid treinamento_id FK
  }
  prestadores_servico {
    uuid id PK
    uuid fornecedor_id FK
  }
  prestcont_remessa {
    uuid id PK
    uuid beneficiario_id FK
    uuid ordem_pagamento_id FK
  }
  aso }o--o| usuarios : "funcionario_id"
  pes_atestados_medicos }o--o| usuarios : "funcionario_id"
  pessoal_anuenio }o--o| pessoal_anuenio_base : "nivel_atual_id"
  pessoal_anuenio }o--o| pessoal_anuenio_base : "proximo_nivel_id"
  pessoal_anuenio }o--o| usuarios : "funcionario_id"
  pessoal_anuenio_base }o--o| empresa : "sindicato_id"
  pessoal_atividade_medidas_seguranca }o--o| pessoal_atividades : "atividade_id"
  pessoal_atividade_medidas_seguranca }o--o| pessoal_atividades_riscos : "risco_id"
  pessoal_atividade_medidas_seguranca }o--o| pessoal_treinamentos : "treinamento_id"
  pessoal_atividades_executores }o--o| empresa : "fornecedor_id"
  pessoal_atividades_executores }o--o| pessoal_atividades : "atividade_id"
  pessoal_atividades_executores }o--o| usuarios : "funcionario_id"
  pessoal_atividades_ferramentas }o--o| pessoal_atividades : "atividade_id"
  pessoal_atividades_ferramentas }o--o| pessoal_atividades : "atividades_id"
  pessoal_atividades_perigos }o--o| pessoal_atividades : "atividade_id"
  pessoal_atividades_riscos }o--o| pessoal_atividades : "atividade_id"
  pessoal_atividades_riscos }o--o| pessoal_atividades_executores : "executor_id"
  pessoal_atividades_riscos }o--o| pessoal_atividades_perigos : "perigo_id"
  pessoal_atribuicoes_cargo }o--o| pessoal_atividades : "atividade_id"
  pessoal_atribuicoes_cargo }o--o| pessoal_cargo : "cargo_id"
  pessoal_atribuicoes_cargo }o--o| pessoal_funcoes : "funcao_id"
  pessoal_ausencias }o--o| pes_atestados_medicos : "atestado_id"
  pessoal_ausencias }o--o| pessoal_faltas_justificadas : "falta_id"
  pessoal_ausencias }o--o| pessoal_ferias_gozo : "ferias_id"
  pessoal_ausencias }o--o| usuarios : "funcionario_id"
  pessoal_cargo }o--o| empresa : "sindicato_id"
  pessoal_contracheque_importacao_itens }o--o| pessoal_contracheques : "contracheque_id"
  pessoal_contracheque_importacao_itens }o--o| usuarios : "aplicado_por"
  pessoal_contracheque_importacao_itens }o--o| usuarios : "funcionario_id"
  pessoal_contracheque_importacao_itens }o--|| pessoal_contracheque_importacoes : "importacao_id"
  pessoal_contracheque_importacoes }o--o| usuarios : "criado_por"
  pessoal_contracheque_importacoes }o--|| pessoal_contracheques_remessas : "remessa_id"
  pessoal_contracheques }o--o| ordens_pagamento : "ordem_pagamento_id"
  pessoal_contracheques }o--o| pessoal_contracheques_remessas : "remessa_id"
  pessoal_contracheques }o--o| usuarios : "funcionario_id"
  pessoal_contracheques_config }o--o| centros_de_custo : "centro_custo_despesa_id"
  pessoal_contracheques_config }o--o| empresa_departamentos : "departamento_id"
  pessoal_contracheques_config }o--o| usuarios : "atualizada_por"
  pessoal_dependentes }o--o| usuarios : "funcionario_id"
  pessoal_diarias_centros_custo }o--o| empresa_departamentos : "departamento_id"
  pessoal_diarias_centros_custo }o--o| pessoal_diarias_despesa_tipos : "despesa_tipo_id"
  pessoal_diarias_centros_custo }o--|| centros_de_custo : "centro_custo_id"
  pessoal_diarias_descontos }o--|| pessoal_diarias_solicitacoes : "diaria_solicitacao_id"
  pessoal_diarias_descontos }o--|| veiculos_infracoes : "infracao_id"
  pessoal_diarias_despesas }o--o| pessoal_diarias_lancamentos : "lancamento_id"
  pessoal_diarias_despesas }o--o| usuarios : "beneficiario_id"
  pessoal_diarias_lancamentos }o--o| financeiro_diarias : "tipo_id"
  pessoal_diarias_lancamentos }o--o| pessoal_diarias_remessas : "remessa_id"
  pessoal_diarias_lancamentos }o--o| usuarios : "beneficiario_id"
  pessoal_diarias_remessas }o--o| empresa_departamentos : "departamento_id"
  pessoal_diarias_remessas }o--o| ordens_pagamento : "ordem_pagamento_id"
  pessoal_diarias_remessas }o--o| usuarios : "avaliador_id"
  pessoal_diarias_remessas }o--o| usuarios : "beneficiario_id"
  pessoal_diarias_remessas }o--o| usuarios : "devolvida_por"
  pessoal_diarias_remessas }o--o| usuarios : "enviada_avaliacao_por"
  pessoal_diarias_remessas }o--o| usuarios : "enviado_por"
  pessoal_diarias_solicitacao_despesas }o--o| pessoal_diarias_despesa_tipos : "tipo_id"
  pessoal_diarias_solicitacao_despesas }o--|| pessoal_diarias_solicitacoes : "solicitacao_id"
  pessoal_diarias_solicitacoes }o--o| empresa_departamentos : "departamento_id"
  pessoal_diarias_solicitacoes }o--o| ordens_pagamento : "ordem_pagamento_id"
  pessoal_diarias_solicitacoes }o--o| pessoal_diarias_remessas : "remessa_id"
  pessoal_diarias_solicitacoes }o--o| pessoal_diarias_solicitacoes : "complemento_de"
  pessoal_diarias_solicitacoes }o--o| usuarios : "avaliador_id"
  pessoal_diarias_solicitacoes }o--o| usuarios : "solicitante_id"
  pessoal_diarias_solicitacoes }o--|| financeiro_diarias : "diaria_id"
  pessoal_diarias_solicitacoes }o--|| usuarios : "funcionario_id"
  pessoal_faltas_config }o--o| usuarios : "atualizado_por_id"
  pessoal_faltas_justificadas }o--o| pessoal_faltas_justificadas_periodo : "periodo_id"
  pessoal_faltas_justificadas }o--o| usuarios : "autorizador_id"
  pessoal_faltas_justificadas }o--o| usuarios : "funcionario_id"
  pessoal_faltas_justificadas }o--o| usuarios : "solicitado_por_id"
  pessoal_ferias }o--o| empresa : "empregador_id"
  pessoal_ferias }o--o| usuarios : "trabalhador_id"
  pessoal_ferias_gozo }o--o| empresa : "empregador_id"
  pessoal_ferias_gozo }o--o| pessoal_ferias : "ferias_periodo_id"
  pessoal_ferias_gozo }o--o| usuarios : "autorizador_id"
  pessoal_ferias_gozo }o--o| usuarios : "funcionario_id"
  pessoal_folha_competencias }o--o| usuarios : "enviada_por"
  pessoal_folha_competencias }o--o| usuarios : "recebida_por"
  pessoal_folha_config }o--o| usuarios : "marco_definido_por"
  pessoal_funcionario_funcao }o--o| pessoal_funcoes : "funcao_id"
  pessoal_funcionario_funcao }o--o| usuarios : "funcionario_id"
  pessoal_funcionario_jornada }o--o| usuarios : "funcionario_id"
  pessoal_ghe_membros }o--o| pessoal_ghe : "ghe_id"
  pessoal_ghe_membros }o--o| usuarios : "funcionario_id"
  pessoal_informes_rendimentos }o--o| pessoal_informes_rendimentos_remessas : "remessa_id"
  pessoal_informes_rendimentos }o--o| usuarios : "funcionario_id"
  pessoal_nivel_salarial }o--o| pessoal_nivel_salarial_base : "nivel_atual_id"
  pessoal_nivel_salarial }o--o| pessoal_nivel_salarial_base : "proximo_nivel_id"
  pessoal_nivel_salarial }o--o| usuarios : "funcionario_id"
  pessoal_nivel_salarial_base }o--o| empresa : "sindicato_id"
  pessoal_nivel_salarial_base }o--o| pessoal_cargo : "cargo_id"
  pessoal_plano_saude }o--o| pessoal_dependentes : "dependente_id"
  pessoal_plano_saude }o--|| usuarios : "titular_id"
  pessoal_ponto_importacao_itens }o--o| pessoal_registro_ponto : "registro_id"
  pessoal_ponto_importacao_itens }o--o| usuarios : "aplicado_por"
  pessoal_ponto_importacao_itens }o--o| usuarios : "funcionario_id"
  pessoal_ponto_importacao_itens }o--|| pessoal_ponto_importacoes : "importacao_id"
  pessoal_ponto_importacoes }o--o| usuarios : "criado_por"
  pessoal_ponto_importacoes }o--|| pessoal_registro_ponto_remessas : "remessa_id"
  pessoal_ponto_isencoes }o--o| usuarios : "encerrado_por"
  pessoal_ponto_isencoes }o--o| usuarios : "registrado_por"
  pessoal_ponto_isencoes }o--|| usuarios : "funcionario_id"
  pessoal_ponto_resenhas }o--o| usuarios : "gerada_por"
  pessoal_reembolsos_act }o--o| usuarios : "avaliador_id"
  pessoal_reembolsos_act }o--|| pessoal_reembolsos_act_tipos : "tipo_id"
  pessoal_reembolsos_act }o--|| usuarios : "funcionario_id"
  pessoal_registro_ponto }o--o| pessoal_registro_ponto_remessas : "remessa_id"
  pessoal_registro_ponto }o--o| usuarios : "funcionario_id"
  pessoal_telegram_arquivos }o--|| usuarios : "usuario_id"
  pessoal_treinamentos_alunos }o--o| pessoal_treinamentos : "treinamento_id"
  pessoal_treinamentos_alunos }o--o| usuarios : "aluno_id"
  prestadores_servico }o--o| empresa : "fornecedor_id"
  prestcont_remessa }o--o| ordens_pagamento : "ordem_pagamento_id"
  prestcont_remessa }o--o| usuarios : "beneficiario_id"
```
