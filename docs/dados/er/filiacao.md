<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Filiação e portal do associado

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/filiacao.md).

```mermaid
erDiagram
  dados_bancarios {
    uuid id PK
    uuid fornecedor_id FK
    uuid usuario_id FK
    uuid filiado_id FK
  }
  emails {
    uuid id PK
    uuid usuario_id FK
    uuid emp_proprietaria_id FK
    uuid filiado_id FK
  }
  emails_institucionais {
    uuid id PK
    uuid usuario_id FK
    uuid emp_proprietaria_id FK
  }
  enderecos {
    uuid id PK
    uuid usuario_id FK
    uuid emp_proprietaria_id FK
    uuid filiado_id FK
    uuid empresa_id FK
  }
  filiacao_carencias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizada_por FK
  }
  filiacao_cobranca_config {
    uuid emp_proprietaria_id PK
  }
  filiacao_cobrancas {
    uuid id PK
    uuid filiacao_id FK
  }
  filiacao_coletiva {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid rod_assembleia_id FK
    uuid acordo_id FK
    uuid revertido_por FK
    uuid criado_por FK
  }
  filiacao_coletiva_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid coletiva_id FK
    uuid apto_id FK
    uuid filiacao_id FK
    uuid vinculo_id FK
  }
  filiacao_contatos_emergencia {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid filiado_id FK
    uuid atualizado_por FK
  }
  filiacao_convenios {
    uuid id PK
    uuid sindicato_id FK
    uuid conveniador_id FK
    uuid categoria_id FK
    uuid emp_proprietaria_id FK
  }
  filiacao_convenios_categorias {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  filiacao_convenios_unidades {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid convenio_id FK
    uuid endereco_id FK
  }
  filiacao_duplicidades_ignoradas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid criado_por FK
  }
  filiacao_inadimplencia_regras {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizada_por FK
  }
  filiacao_prontuario {
    uuid id PK
    uuid filiacao_id FK
    uuid diretor_funcionario_id FK
    uuid homologacao_id FK
    uuid hospedagem_id FK
    uuid atendimento_id FK
  }
  filiacao_recebe {
    uuid id PK
    uuid fonte_pg_id FK
    uuid filiado_id FK
    uuid remessa_id FK
    uuid grupo_empresarial_id FK
  }
  filiacao_recebe_comprovacao {
    uuid id PK
    uuid fonte_pg_id FK
    uuid remessa_id FK
  }
  filiacao_recebe_remessa {
    uuid id PK
    uuid emp_contratante_id FK
  }
  filiacao_reembolsos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid filiado_id FK
    uuid ordem_pagamento_id FK
    uuid projeto_id FK
    uuid prontuario_id FK
    uuid pagamento_indevido_id FK
    uuid criado_por FK
  }
  filiacao_reembolsos_config {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid centro_custo_id FK
    uuid atualizada_por FK
  }
  filiacao_registro {
    uuid id PK
    uuid sindicato_id FK
    uuid endereco_id FK
  }
  filiacao_solicitacao_eventos {
    uuid id PK
    uuid solicitacao_id FK
    uuid emp_proprietaria_id FK
  }
  filiacao_solicitacoes {
    uuid id PK
    uuid empregador_id FK
    uuid filiacao_id FK
    uuid avaliacao_avaliador_id FK
    uuid emp_proprietaria_id FK
    uuid tl_lgpd_id FK
    uuid tl_desconto_id FK
  }
  filiacao_suspensoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid concedida_por FK
    uuid revogada_por FK
  }
  filiacao_tl_aceites {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid filiacao_id FK
  }
  filiacao_tl_desconto {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  filiacao_tl_lgpd {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  filiacao_vinculos {
    uuid id PK
    uuid filiado_id FK
    uuid fonte_pagadora_id FK
    uuid filiacao_vinculada_id FK
    uuid emp_proprietaria_id FK
  }
  filiacoes {
    uuid id PK
    uuid usuario_id FK
    uuid sindicato_id FK
    uuid tl_desconto_id FK
    uuid emp_proprietaria_id FK
    uuid tl_lgpd_id FK
    uuid filiacao_coletiva_id FK
    uuid mesclado_em_id FK
    uuid mesclado_por FK
  }
  fonte_categorias {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  oposicao_campanha {
    uuid id PK
    uuid empresa_id FK
    uuid emp_proprietaria_id FK
  }
  oposicao_campanha_fontes {
    uuid id PK
    uuid campanha_id FK
    uuid empresa_id FK
    uuid emp_proprietaria_id FK
  }
  oposicao_eventos {
    uuid id PK
    uuid opositor_id FK
    uuid emp_proprietaria_id FK
  }
  oposicao_opositor {
    uuid id PK
    uuid avaliacao_avaliador_id FK
    uuid endereco_id FK
    uuid filiacao_id FK
    uuid empregador_id FK
    uuid emp_proprietaria_id FK
    uuid campanha_id FK
  }
  oposicao_perguntas {
    uuid id PK
    uuid campanha_id FK
    uuid emp_proprietaria_id FK
  }
  oposicao_resposta {
    uuid id PK
    uuid opositor_id FK
    uuid pergunta_id FK
    uuid emp_proprietaria_id FK
  }
  portal_atendimentos {
    uuid id PK
    uuid filiacao_id FK
    uuid demanda_id FK
  }
  portal_atendimentos_mensagens {
    uuid id PK
    uuid atendimento_id FK
  }
  portal_avisos {
    uuid id PK
  }
  portal_avisos_preferencias {
    uuid emp_proprietaria_id PK
    text cpf PK
  }
  portal_nao_filiado {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  portal_partes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid atualizada_por FK
  }
  portal_push_assinaturas {
    uuid id PK
  }
  registro_sindical {
    uuid id PK
    uuid emp_proprietaria_id FK
  }
  telefones {
    uuid id PK
    uuid usuario_id FK
    uuid emp_proprietaria_id FK
    uuid filiado_id FK
  }
  vinculos_trabalhistas {
    uuid id PK
    uuid trabalhador_id FK
    uuid empregador_id FK
    uuid filiado_id FK
    uuid endereco_id FK
    uuid emp_proprietaria_id FK
  }
  dados_bancarios }o--o| empresa : "fornecedor_id"
  dados_bancarios }o--o| filiacoes : "filiado_id"
  dados_bancarios }o--o| usuarios : "usuario_id"
  emails }o--o| filiacoes : "filiado_id"
  emails }o--o| usuarios : "usuario_id"
  emails_institucionais }o--o| usuarios : "usuario_id"
  enderecos }o--o| empresa : "empresa_id"
  enderecos }o--o| filiacoes : "filiado_id"
  enderecos }o--o| usuarios : "usuario_id"
  filiacao_carencias }o--o| usuarios : "atualizada_por"
  filiacao_cobrancas }o--|| filiacoes : "filiacao_id"
  filiacao_coletiva }o--o| acordo_coletivo : "acordo_id"
  filiacao_coletiva }o--o| usuarios : "criado_por"
  filiacao_coletiva }o--o| usuarios : "revertido_por"
  filiacao_coletiva }o--o| voto_rod_assembleias : "rod_assembleia_id"
  filiacao_coletiva_itens }o--o| filiacao_coletiva : "coletiva_id"
  filiacao_coletiva_itens }o--o| filiacao_vinculos : "vinculo_id"
  filiacao_coletiva_itens }o--o| filiacoes : "filiacao_id"
  filiacao_coletiva_itens }o--o| voto_assembleias_aptos : "apto_id"
  filiacao_contatos_emergencia }o--o| filiacoes : "filiado_id"
  filiacao_contatos_emergencia }o--o| usuarios : "atualizado_por"
  filiacao_convenios }o--o| empresa : "conveniador_id"
  filiacao_convenios }o--o| empresa : "sindicato_id"
  filiacao_convenios }o--o| filiacao_convenios_categorias : "categoria_id"
  filiacao_convenios_unidades }o--o| enderecos : "endereco_id"
  filiacao_convenios_unidades }o--o| filiacao_convenios : "convenio_id"
  filiacao_duplicidades_ignoradas }o--o| usuarios : "criado_por"
  filiacao_inadimplencia_regras }o--o| usuarios : "atualizada_por"
  filiacao_prontuario }o--o| filiacoes : "filiacao_id"
  filiacao_prontuario }o--o| hospedagem_cupom : "hospedagem_id"
  filiacao_prontuario }o--o| juridico_homologacoes : "homologacao_id"
  filiacao_prontuario }o--o| saude_atendimentos : "atendimento_id"
  filiacao_prontuario }o--o| usuarios : "diretor_funcionario_id"
  filiacao_recebe }o--o| empresa : "fonte_pg_id"
  filiacao_recebe }o--o| filiacao_recebe_remessa : "remessa_id"
  filiacao_recebe }o--o| filiacoes : "filiado_id"
  filiacao_recebe }o--o| grupos_empresariais : "grupo_empresarial_id"
  filiacao_recebe_comprovacao }o--o| empresa : "fonte_pg_id"
  filiacao_recebe_comprovacao }o--o| filiacao_recebe_remessa : "remessa_id"
  filiacao_recebe_remessa }o--o| empresa : "emp_contratante_id"
  filiacao_reembolsos }o--o| filiacao_prontuario : "prontuario_id"
  filiacao_reembolsos }o--o| filiacao_recebe : "pagamento_indevido_id"
  filiacao_reembolsos }o--o| filiacoes : "filiado_id"
  filiacao_reembolsos }o--o| ordens_pagamento : "ordem_pagamento_id"
  filiacao_reembolsos }o--o| projeto : "projeto_id"
  filiacao_reembolsos }o--o| usuarios : "criado_por"
  filiacao_reembolsos_config }o--o| centros_de_custo : "centro_custo_id"
  filiacao_reembolsos_config }o--o| usuarios : "atualizada_por"
  filiacao_registro }o--o| empresa : "sindicato_id"
  filiacao_registro }o--o| enderecos : "endereco_id"
  filiacao_solicitacao_eventos }o--o| filiacao_solicitacoes : "solicitacao_id"
  filiacao_solicitacoes }o--o| empresa : "empregador_id"
  filiacao_solicitacoes }o--o| filiacao_tl_desconto : "tl_desconto_id"
  filiacao_solicitacoes }o--o| filiacao_tl_lgpd : "tl_lgpd_id"
  filiacao_solicitacoes }o--o| filiacoes : "filiacao_id"
  filiacao_solicitacoes }o--o| usuarios : "avaliacao_avaliador_id"
  filiacao_suspensoes }o--o| usuarios : "concedida_por"
  filiacao_suspensoes }o--o| usuarios : "revogada_por"
  filiacao_tl_aceites }o--o| filiacoes : "filiacao_id"
  filiacao_vinculos }o--o| empresa : "fonte_pagadora_id"
  filiacao_vinculos }o--o| filiacoes : "filiacao_vinculada_id"
  filiacao_vinculos }o--o| filiacoes : "filiado_id"
  filiacoes }o--o| empresa : "sindicato_id"
  filiacoes }o--o| filiacao_coletiva : "filiacao_coletiva_id"
  filiacoes }o--o| filiacao_tl_desconto : "tl_desconto_id"
  filiacoes }o--o| filiacao_tl_lgpd : "tl_lgpd_id"
  filiacoes }o--o| filiacoes : "mesclado_em_id"
  filiacoes }o--o| usuarios : "mesclado_por"
  filiacoes }o--o| usuarios : "usuario_id"
  oposicao_campanha }o--o| empresa : "empresa_id"
  oposicao_campanha_fontes }o--o| empresa : "empresa_id"
  oposicao_campanha_fontes }o--o| oposicao_campanha : "campanha_id"
  oposicao_eventos }o--o| oposicao_opositor : "opositor_id"
  oposicao_opositor }o--o| empresa : "empregador_id"
  oposicao_opositor }o--o| enderecos : "endereco_id"
  oposicao_opositor }o--o| filiacoes : "filiacao_id"
  oposicao_opositor }o--o| oposicao_campanha : "campanha_id"
  oposicao_opositor }o--o| usuarios : "avaliacao_avaliador_id"
  oposicao_perguntas }o--o| oposicao_campanha : "campanha_id"
  oposicao_resposta }o--o| oposicao_opositor : "opositor_id"
  oposicao_resposta }o--o| oposicao_perguntas : "pergunta_id"
  portal_atendimentos }o--o| demandas : "demanda_id"
  portal_atendimentos }o--o| filiacoes : "filiacao_id"
  portal_atendimentos_mensagens }o--|| portal_atendimentos : "atendimento_id"
  portal_partes }o--o| usuarios : "atualizada_por"
  telefones }o--o| filiacoes : "filiado_id"
  telefones }o--o| usuarios : "usuario_id"
  vinculos_trabalhistas }o--o| empresa : "empregador_id"
  vinculos_trabalhistas }o--o| enderecos : "endereco_id"
  vinculos_trabalhistas }o--o| filiacoes : "filiado_id"
  vinculos_trabalhistas }o--o| usuarios : "trabalhador_id"
```
