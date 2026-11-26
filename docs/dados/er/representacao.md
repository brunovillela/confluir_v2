<!-- GERADO por scripts/gerar-dicionario.mjs a partir do banco. Não editar à mão: mude o comentário no banco (migração) e rode `npm run db:dicionario`. -->

# Diagrama — Representação, acordos e negociações

Só chaves (PK e FK). Tabelas de outros módulos aparecem sem atributos. Colunas e descrições: [dicionário](../dicionario/representacao.md).

```mermaid
erDiagram
  acordo_clausulas {
    uuid id PK
    uuid acordo_id FK
    uuid emp_proprietaria_id FK
  }
  acordo_coletivo {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid clausulas_revisadas_por_id FK
    uuid negociacao_id FK
  }
  acordo_comparacao_pares {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid comparacao_id FK
    uuid clausula_a_id FK
    uuid clausula_b_id FK
  }
  acordo_comparacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid acordo_a_id FK
    uuid acordo_b_id FK
    uuid criado_por_id FK
  }
  acordo_fontes {
    uuid id PK
    uuid acordo_id FK
    uuid empresa_id FK
    uuid emp_proprietaria_id FK
  }
  agenda {
    uuid id PK
    uuid sede_id FK
    uuid emp_proprietaria_id FK
    uuid departamento_id FK
    uuid filiacao_id FK
    uuid assembleia_id FK
    uuid evento_id FK
    uuid criado_por FK
  }
  agenda_representantes {
    uuid agenda_id PK,FK
    uuid usuario_id PK,FK
  }
  ato_eventos {
    uuid id PK
    uuid emp_contratante_id FK
  }
  ato_eventos_participantes {
    uuid evento_id PK,FK
    uuid usuario_id PK,FK
  }
  congresso_apontamentos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid grupo_id FK
    uuid proposta_id FK
  }
  congresso_apreciacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid grupo_id FK
    uuid proposta_id FK
  }
  congresso_certificados {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid participante_id FK
  }
  congresso_chapa_membros {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid chapa_id FK
    uuid participante_id FK
    uuid unidade_id FK
  }
  congresso_chapas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
  }
  congresso_config_versoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid autor_id FK
  }
  congresso_crachas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid participante_id FK
    uuid emitido_por FK
  }
  congresso_criancas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid participante_id FK
  }
  congresso_eixos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
  }
  congresso_falas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid sessao_id FK
    uuid participante_id FK
  }
  congresso_grupo_funcoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid grupo_id FK
    uuid participante_id FK
  }
  congresso_grupos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid eixo_id FK
  }
  congresso_mocao_assinaturas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid mocao_id FK
    uuid participante_id FK
    uuid unidade_id FK
    uuid registrado_por FK
  }
  congresso_mocao_eventos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid mocao_id FK
  }
  congresso_mocoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid unidade_id FK
    uuid proponente_id FK
    uuid decidida_por FK
  }
  congresso_papeis {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
  }
  congresso_participante_historico {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid participante_id FK
    uuid autor_id FK
  }
  congresso_participantes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid filiacao_id FK
    uuid usuario_id FK
    uuid papel_id FK
    uuid unidade_id FK
    uuid grupo_id FK
    uuid titular_id FK
    uuid credenciado_por FK
  }
  congresso_plenaria_estado {
    uuid congresso_id PK,FK
    uuid emp_proprietaria_id FK
    uuid sessao_id FK
  }
  congresso_presencas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid sessao_id FK
    uuid participante_id FK
    uuid registrado_por FK
  }
  congresso_proposta_origens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid proposta_id FK
    uuid origem_id FK
  }
  congresso_proposta_versoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid proposta_id FK
  }
  congresso_propostas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid eixo_id FK
    uuid grupo_id FK
    uuid fundida_em FK
    uuid origem_proposta_id FK
  }
  congresso_resolucao_eventos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid resolucao_id FK
  }
  congresso_resolucoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid proposta_id FK
    uuid mocao_id FK
    uuid eixo_id FK
    uuid negociacao_id FK
    uuid oficio_id FK
  }
  congresso_sessoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid grupo_id FK
    uuid eixo_id FK
  }
  congresso_substituicoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid titular_id FK
    uuid suplente_id FK
    uuid registrado_por FK
    uuid desfeita_por FK
  }
  congresso_sugestoes_ia {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid grupo_id FK
    uuid mocao_id FK
  }
  congresso_unidades {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
  }
  congresso_votacao_itens {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid votacao_id FK
    uuid proposta_id FK
    uuid mocao_id FK
  }
  congresso_votacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid sessao_id FK
    uuid registrado_por FK
    uuid desfeita_por FK
  }
  congresso_votacoes_vivo {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid sessao_id FK
    uuid votacao_id FK
  }
  congresso_voto_participacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid votacao_vivo_id FK
    uuid participante_id FK
  }
  congresso_votos_vivo {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid congresso_id FK
    uuid votacao_vivo_id FK
    uuid participante_id FK
  }
  congressos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid evento_id FK
    uuid etapa_anterior_id FK
    uuid etapa_seguinte_id FK
    uuid criado_por FK
  }
  negociacao_empresas {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid negociacao_id FK
    uuid empresa_id FK
  }
  negociacao_eventos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid negociacao_id FK
    uuid criado_por_id FK
  }
  negociacoes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid acordo_vigente_id FK
    uuid acordo_final_id FK
    uuid campanha_id FK
    uuid criado_por_id FK
  }
  representacao_documentos {
    uuid id PK
    uuid empresa_id FK
    uuid emp_proprietaria_id FK
  }
  representacao_reuniao_participantes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid reuniao_id FK
    uuid usuario_id FK
  }
  representacao_reunioes {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid empresa_id FK
    uuid criado_por_id FK
  }
  reuniao_ata {
    uuid id PK
    uuid mandato_id FK
    uuid emp_proprietaria_id FK
  }
  reuniao_deliberacao {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid ata_id FK
    uuid responsavel_id FK
  }
  reuniao_deliberacao_eventos {
    uuid id PK
    uuid emp_proprietaria_id FK
    uuid deliberacao_id FK
    uuid ata_id FK
  }
  acordo_clausulas }o--o| acordo_coletivo : "acordo_id"
  acordo_coletivo }o--o| negociacoes : "negociacao_id"
  acordo_coletivo }o--o| usuarios : "clausulas_revisadas_por_id"
  acordo_comparacao_pares }o--o| acordo_clausulas : "clausula_a_id"
  acordo_comparacao_pares }o--o| acordo_clausulas : "clausula_b_id"
  acordo_comparacao_pares }o--o| acordo_comparacoes : "comparacao_id"
  acordo_comparacoes }o--o| acordo_coletivo : "acordo_a_id"
  acordo_comparacoes }o--o| acordo_coletivo : "acordo_b_id"
  acordo_comparacoes }o--o| usuarios : "criado_por_id"
  acordo_fontes }o--o| acordo_coletivo : "acordo_id"
  acordo_fontes }o--o| empresa : "empresa_id"
  agenda }o--o| empresa_departamentos : "departamento_id"
  agenda }o--o| empresa_sede : "sede_id"
  agenda }o--o| eventos : "evento_id"
  agenda }o--o| filiacoes : "filiacao_id"
  agenda }o--o| usuarios : "criado_por"
  agenda }o--o| voto_assembleias : "assembleia_id"
  agenda_representantes }o--|| agenda : "agenda_id"
  agenda_representantes }o--|| usuarios : "usuario_id"
  ato_eventos }o--o| empresa : "emp_contratante_id"
  ato_eventos_participantes }o--|| ato_eventos : "evento_id"
  ato_eventos_participantes }o--|| usuarios : "usuario_id"
  congresso_apontamentos }o--o| congresso_grupos : "grupo_id"
  congresso_apontamentos }o--o| congresso_propostas : "proposta_id"
  congresso_apontamentos }o--|| congressos : "congresso_id"
  congresso_apreciacoes }o--|| congresso_grupos : "grupo_id"
  congresso_apreciacoes }o--|| congresso_propostas : "proposta_id"
  congresso_apreciacoes }o--|| congressos : "congresso_id"
  congresso_certificados }o--|| congresso_participantes : "participante_id"
  congresso_certificados }o--|| congressos : "congresso_id"
  congresso_chapa_membros }o--o| congresso_unidades : "unidade_id"
  congresso_chapa_membros }o--|| congresso_chapas : "chapa_id"
  congresso_chapa_membros }o--|| congresso_participantes : "participante_id"
  congresso_chapa_membros }o--|| congressos : "congresso_id"
  congresso_chapas }o--|| congressos : "congresso_id"
  congresso_config_versoes }o--o| usuarios : "autor_id"
  congresso_config_versoes }o--|| congressos : "congresso_id"
  congresso_crachas }o--o| usuarios : "emitido_por"
  congresso_crachas }o--|| congresso_participantes : "participante_id"
  congresso_crachas }o--|| congressos : "congresso_id"
  congresso_criancas }o--|| congresso_participantes : "participante_id"
  congresso_criancas }o--|| congressos : "congresso_id"
  congresso_eixos }o--|| congressos : "congresso_id"
  congresso_falas }o--o| congresso_participantes : "participante_id"
  congresso_falas }o--o| congresso_sessoes : "sessao_id"
  congresso_falas }o--|| congressos : "congresso_id"
  congresso_grupo_funcoes }o--|| congresso_grupos : "grupo_id"
  congresso_grupo_funcoes }o--|| congresso_participantes : "participante_id"
  congresso_grupo_funcoes }o--|| congressos : "congresso_id"
  congresso_grupos }o--o| congresso_eixos : "eixo_id"
  congresso_grupos }o--|| congressos : "congresso_id"
  congresso_mocao_assinaturas }o--o| congresso_unidades : "unidade_id"
  congresso_mocao_assinaturas }o--o| usuarios : "registrado_por"
  congresso_mocao_assinaturas }o--|| congresso_mocoes : "mocao_id"
  congresso_mocao_assinaturas }o--|| congresso_participantes : "participante_id"
  congresso_mocao_assinaturas }o--|| congressos : "congresso_id"
  congresso_mocao_eventos }o--|| congresso_mocoes : "mocao_id"
  congresso_mocao_eventos }o--|| congressos : "congresso_id"
  congresso_mocoes }o--o| congresso_participantes : "proponente_id"
  congresso_mocoes }o--o| congresso_unidades : "unidade_id"
  congresso_mocoes }o--o| usuarios : "decidida_por"
  congresso_mocoes }o--|| congressos : "congresso_id"
  congresso_papeis }o--|| congressos : "congresso_id"
  congresso_participante_historico }o--o| congresso_participantes : "participante_id"
  congresso_participante_historico }o--o| usuarios : "autor_id"
  congresso_participante_historico }o--|| congressos : "congresso_id"
  congresso_participantes }o--o| congresso_grupos : "grupo_id"
  congresso_participantes }o--o| congresso_papeis : "papel_id"
  congresso_participantes }o--o| congresso_participantes : "titular_id"
  congresso_participantes }o--o| congresso_unidades : "unidade_id"
  congresso_participantes }o--o| filiacoes : "filiacao_id"
  congresso_participantes }o--o| usuarios : "credenciado_por"
  congresso_participantes }o--o| usuarios : "usuario_id"
  congresso_participantes }o--|| congressos : "congresso_id"
  congresso_plenaria_estado }o--o| congresso_sessoes : "sessao_id"
  congresso_plenaria_estado }o--|| congressos : "congresso_id"
  congresso_presencas }o--o| usuarios : "registrado_por"
  congresso_presencas }o--|| congresso_participantes : "participante_id"
  congresso_presencas }o--|| congresso_sessoes : "sessao_id"
  congresso_presencas }o--|| congressos : "congresso_id"
  congresso_proposta_origens }o--|| congresso_propostas : "origem_id"
  congresso_proposta_origens }o--|| congresso_propostas : "proposta_id"
  congresso_proposta_origens }o--|| congressos : "congresso_id"
  congresso_proposta_versoes }o--|| congresso_propostas : "proposta_id"
  congresso_proposta_versoes }o--|| congressos : "congresso_id"
  congresso_propostas }o--o| congresso_eixos : "eixo_id"
  congresso_propostas }o--o| congresso_grupos : "grupo_id"
  congresso_propostas }o--o| congresso_propostas : "fundida_em"
  congresso_propostas }o--o| congresso_propostas : "origem_proposta_id"
  congresso_propostas }o--|| congressos : "congresso_id"
  congresso_resolucao_eventos }o--|| congresso_resolucoes : "resolucao_id"
  congresso_resolucao_eventos }o--|| congressos : "congresso_id"
  congresso_resolucoes }o--o| congresso_eixos : "eixo_id"
  congresso_resolucoes }o--o| congresso_mocoes : "mocao_id"
  congresso_resolucoes }o--o| congresso_propostas : "proposta_id"
  congresso_resolucoes }o--o| negociacoes : "negociacao_id"
  congresso_resolucoes }o--o| oficios : "oficio_id"
  congresso_resolucoes }o--|| congressos : "congresso_id"
  congresso_sessoes }o--o| congresso_eixos : "eixo_id"
  congresso_sessoes }o--o| congresso_grupos : "grupo_id"
  congresso_sessoes }o--|| congressos : "congresso_id"
  congresso_substituicoes }o--o| usuarios : "desfeita_por"
  congresso_substituicoes }o--o| usuarios : "registrado_por"
  congresso_substituicoes }o--|| congresso_participantes : "suplente_id"
  congresso_substituicoes }o--|| congresso_participantes : "titular_id"
  congresso_substituicoes }o--|| congressos : "congresso_id"
  congresso_sugestoes_ia }o--o| congresso_grupos : "grupo_id"
  congresso_sugestoes_ia }o--o| congresso_mocoes : "mocao_id"
  congresso_sugestoes_ia }o--|| congressos : "congresso_id"
  congresso_unidades }o--|| congressos : "congresso_id"
  congresso_votacao_itens }o--o| congresso_mocoes : "mocao_id"
  congresso_votacao_itens }o--o| congresso_propostas : "proposta_id"
  congresso_votacao_itens }o--|| congresso_votacoes : "votacao_id"
  congresso_votacao_itens }o--|| congressos : "congresso_id"
  congresso_votacoes }o--o| congresso_sessoes : "sessao_id"
  congresso_votacoes }o--o| usuarios : "desfeita_por"
  congresso_votacoes }o--o| usuarios : "registrado_por"
  congresso_votacoes }o--|| congressos : "congresso_id"
  congresso_votacoes_vivo }o--o| congresso_sessoes : "sessao_id"
  congresso_votacoes_vivo }o--o| congresso_votacoes : "votacao_id"
  congresso_votacoes_vivo }o--|| congressos : "congresso_id"
  congresso_voto_participacoes }o--|| congresso_participantes : "participante_id"
  congresso_voto_participacoes }o--|| congresso_votacoes_vivo : "votacao_vivo_id"
  congresso_voto_participacoes }o--|| congressos : "congresso_id"
  congresso_votos_vivo }o--o| congresso_participantes : "participante_id"
  congresso_votos_vivo }o--|| congresso_votacoes_vivo : "votacao_vivo_id"
  congresso_votos_vivo }o--|| congressos : "congresso_id"
  congressos }o--o| congressos : "etapa_anterior_id"
  congressos }o--o| congressos : "etapa_seguinte_id"
  congressos }o--o| eventos : "evento_id"
  congressos }o--o| usuarios : "criado_por"
  negociacao_empresas }o--o| empresa : "empresa_id"
  negociacao_empresas }o--o| negociacoes : "negociacao_id"
  negociacao_eventos }o--o| negociacoes : "negociacao_id"
  negociacao_eventos }o--o| usuarios : "criado_por_id"
  negociacoes }o--o| acordo_coletivo : "acordo_final_id"
  negociacoes }o--o| acordo_coletivo : "acordo_vigente_id"
  negociacoes }o--o| usuarios : "criado_por_id"
  negociacoes }o--o| voto_campanha : "campanha_id"
  representacao_documentos }o--o| empresa : "empresa_id"
  representacao_reuniao_participantes }o--o| representacao_reunioes : "reuniao_id"
  representacao_reuniao_participantes }o--o| usuarios : "usuario_id"
  representacao_reunioes }o--o| empresa : "empresa_id"
  representacao_reunioes }o--o| usuarios : "criado_por_id"
  reuniao_ata }o--o| diretoria_mandatos : "mandato_id"
  reuniao_deliberacao }o--o| usuarios : "responsavel_id"
  reuniao_deliberacao }o--|| reuniao_ata : "ata_id"
  reuniao_deliberacao_eventos }o--o| reuniao_ata : "ata_id"
  reuniao_deliberacao_eventos }o--o| reuniao_deliberacao : "deliberacao_id"
```
