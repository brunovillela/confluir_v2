<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Votações e assembleias

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/votacao.md).

```mermaid
erDiagram
  votacao_email_verificado {
    uuid id PK
  }
  votacao_expurgo_contatos {
    uuid id PK
    uuid rod_assembleia_id FK
  }
  votacao_telegram_confirmacoes {
    uuid id PK
  }
  voto_apuracao_contagem {
    uuid id PK
    uuid apuracao_urna_id FK
    uuid pergunta_id FK
    uuid opcao_id FK
  }
  voto_apuracao_eventos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid assembleia_id FK
  }
  voto_apuracao_urna {
    uuid id PK
    uuid urna_id FK
    uuid apurador_id FK
  }
  voto_apuradores {
    uuid id PK
    uuid rod_assembleia_id FK
  }
  voto_assembleia_resultados {
    uuid id PK
    uuid assembleia_id FK
  }
  voto_assembleias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid empresa_id FK
    uuid rod_assembleia_id FK
  }
  voto_assembleias_aptos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid assembleia_id FK
    uuid rod_assembleia_id FK
    uuid eleitor_id FK
    uuid presenca_mesario_id FK
    uuid presenca_urna_id FK
  }
  voto_assembleias_empresas {
    uuid assembleia_id PK,FK
    uuid empresa_id PK,FK
  }
  voto_assembleias_perguntas {
    uuid id PK
    uuid assembleia_id FK
    uuid rod_assembleia_id FK
    uuid emp_proprietaria_id FK
  }
  voto_aviso_acoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid rodada_id FK
  }
  voto_campanha {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid empresa_id FK
  }
  voto_campanha_fontes {
    uuid id PK
    uuid campanha_id FK
    uuid empresa_id FK
  }
  voto_em_separado {
    uuid id PK
    uuid assembleia_id FK
    uuid rod_assembleia_id FK
    uuid urna_id FK
    uuid mesario_id FK
  }
  voto_entrega_dominios {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid rodada_id FK
  }
  voto_mesario {
    uuid id PK
    uuid mesario_id FK
    uuid urna_id FK
    uuid emp_proprietaria_id FK
  }
  voto_mesarios {
    uuid id PK
    uuid rod_assembleia_id FK
  }
  voto_online {
    uuid id PK
    uuid eleitor_id FK
    uuid urna_id FK
    uuid mesario_id FK
    uuid resposta_id FK
    uuid pergunta_id FK
    uuid assembleia_id FK
    uuid rod_assembleia_id FK
    uuid emp_proprietaria_id FK
    uuid em_separado_id FK
  }
  voto_opcoes_resposta {
    uuid id PK
    uuid pergunta_id FK
    uuid emp_proprietaria_id FK
  }
  voto_participacao_legado {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid rod_assembleia_id FK
    uuid assembleia_id FK
    uuid eleitor_id FK
  }
  voto_resultado_final {
    uuid id PK
    uuid assembleia_id FK
    uuid pergunta_id FK
    uuid opcao_id FK
  }
  voto_resultado_presencial {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid assembleia_id FK
    uuid pergunta_id FK
    uuid opcao_resposta_id FK
    uuid rod_assembleia_id FK
  }
  voto_rod_assembleias {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid campanha_id FK
    uuid empresa_id FK
  }
  voto_unidades_presenciais {
    uuid id PK
    uuid empresa_id FK
    uuid rod_assembleia_id FK
    uuid votacao_id FK
    uuid emp_proprietaria_id FK
  }
  voto_urna {
    uuid id PK
    uuid assembleia_id FK
    uuid emp_proprietaria_id FK
  }
  voto_urna_disponibilidade {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid urna_id FK
  }
  voto_urna_eventos {
    uuid id PK
    uuid urna_id FK
    uuid mesario_id FK
    uuid apurador_id FK
  }
  voto_urna_lacres {
    uuid id PK
    uuid urna_id FK
  }
  voto_urna_terminais {
    uuid id PK
    uuid urna_id FK
    uuid apto_liberado_id FK
    uuid em_separado_liberado_id FK
  }
  voto_urnas {
    uuid id PK
    uuid assembleia_id FK
    uuid rod_assembleia_id FK
    uuid apurador_id FK
  }
  voto_votacao_respostas {
    uuid id PK
    uuid eleitor_id FK
    uuid pergunta_id FK
    uuid assembleia_id FK
    uuid rod_assembleia_id FK
    uuid emp_proprietaria_id FK
  }
  votacao_expurgo_contatos }o--|| voto_rod_assembleias : "rod_assembleia_id"
  voto_apuracao_contagem }o--o| voto_opcoes_resposta : "opcao_id"
  voto_apuracao_contagem }o--|| voto_apuracao_urna : "apuracao_urna_id"
  voto_apuracao_contagem }o--|| voto_assembleias_perguntas : "pergunta_id"
  voto_apuracao_eventos }o--|| voto_assembleias : "assembleia_id"
  voto_apuracao_urna }o--o| voto_apuradores : "apurador_id"
  voto_apuracao_urna }o--|| voto_urnas : "urna_id"
  voto_apuradores }o--|| voto_rod_assembleias : "rod_assembleia_id"
  voto_assembleia_resultados }o--o| voto_assembleias : "assembleia_id"
  voto_assembleias }o--o| empresa : "empresa_id"
  voto_assembleias }o--o| voto_rod_assembleias : "rod_assembleia_id"
  voto_assembleias_aptos }o--o| usuarios : "eleitor_id"
  voto_assembleias_aptos }o--o| voto_assembleias : "assembleia_id"
  voto_assembleias_aptos }o--o| voto_mesarios : "presenca_mesario_id"
  voto_assembleias_aptos }o--o| voto_rod_assembleias : "rod_assembleia_id"
  voto_assembleias_aptos }o--o| voto_urnas : "presenca_urna_id"
  voto_assembleias_empresas }o--|| empresa : "empresa_id"
  voto_assembleias_empresas }o--|| voto_assembleias : "assembleia_id"
  voto_assembleias_perguntas }o--o| voto_assembleias : "assembleia_id"
  voto_assembleias_perguntas }o--o| voto_rod_assembleias : "rod_assembleia_id"
  voto_aviso_acoes }o--|| voto_rod_assembleias : "rodada_id"
  voto_campanha }o--o| empresa : "empresa_id"
  voto_campanha_fontes }o--|| empresa : "empresa_id"
  voto_campanha_fontes }o--|| voto_campanha : "campanha_id"
  voto_em_separado }o--o| voto_mesarios : "mesario_id"
  voto_em_separado }o--o| voto_rod_assembleias : "rod_assembleia_id"
  voto_em_separado }o--o| voto_urnas : "urna_id"
  voto_em_separado }o--|| voto_assembleias : "assembleia_id"
  voto_entrega_dominios }o--o| voto_rod_assembleias : "rodada_id"
  voto_mesario }o--o| usuarios : "mesario_id"
  voto_mesario }o--o| voto_urna : "urna_id"
  voto_mesarios }o--|| voto_rod_assembleias : "rod_assembleia_id"
  voto_online }o--o| usuarios : "eleitor_id"
  voto_online }o--o| voto_assembleias : "assembleia_id"
  voto_online }o--o| voto_assembleias_perguntas : "pergunta_id"
  voto_online }o--o| voto_em_separado : "em_separado_id"
  voto_online }o--o| voto_mesarios : "mesario_id"
  voto_online }o--o| voto_opcoes_resposta : "resposta_id"
  voto_online }o--o| voto_rod_assembleias : "rod_assembleia_id"
  voto_online }o--o| voto_urna : "urna_id"
  voto_opcoes_resposta }o--o| voto_assembleias_perguntas : "pergunta_id"
  voto_participacao_legado }o--o| voto_assembleias : "assembleia_id"
  voto_participacao_legado }o--o| voto_rod_assembleias : "rod_assembleia_id"
  voto_participacao_legado }o--|| usuarios : "eleitor_id"
  voto_resultado_final }o--o| voto_opcoes_resposta : "opcao_id"
  voto_resultado_final }o--|| voto_assembleias : "assembleia_id"
  voto_resultado_final }o--|| voto_assembleias_perguntas : "pergunta_id"
  voto_resultado_presencial }o--o| voto_assembleias : "assembleia_id"
  voto_resultado_presencial }o--o| voto_assembleias_perguntas : "pergunta_id"
  voto_resultado_presencial }o--o| voto_opcoes_resposta : "opcao_resposta_id"
  voto_resultado_presencial }o--o| voto_rod_assembleias : "rod_assembleia_id"
  voto_rod_assembleias }o--o| empresa : "empresa_id"
  voto_rod_assembleias }o--o| voto_campanha : "campanha_id"
  voto_unidades_presenciais }o--o| empresa : "empresa_id"
  voto_unidades_presenciais }o--o| voto_assembleia_resultados : "votacao_id"
  voto_unidades_presenciais }o--o| voto_assembleias : "rod_assembleia_id"
  voto_urna }o--o| voto_assembleias : "assembleia_id"
  voto_urna_disponibilidade }o--o| voto_urna : "urna_id"
  voto_urna_eventos }o--o| voto_apuradores : "apurador_id"
  voto_urna_eventos }o--o| voto_mesarios : "mesario_id"
  voto_urna_eventos }o--|| voto_urnas : "urna_id"
  voto_urna_lacres }o--|| voto_urnas : "urna_id"
  voto_urna_terminais }o--o| voto_assembleias_aptos : "apto_liberado_id"
  voto_urna_terminais }o--o| voto_em_separado : "em_separado_liberado_id"
  voto_urna_terminais }o--o| voto_urnas : "urna_id"
  voto_urnas }o--o| voto_apuradores : "apurador_id"
  voto_urnas }o--o| voto_rod_assembleias : "rod_assembleia_id"
  voto_urnas }o--|| voto_assembleias : "assembleia_id"
  voto_votacao_respostas }o--o| usuarios : "eleitor_id"
  voto_votacao_respostas }o--o| voto_assembleias : "assembleia_id"
  voto_votacao_respostas }o--o| voto_assembleias_perguntas : "pergunta_id"
  voto_votacao_respostas }o--o| voto_rod_assembleias : "rod_assembleia_id"
```
