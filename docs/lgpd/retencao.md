# Retenção e descarte de dados pessoais

> **Onda B4** (`docs/plano-documentacao.md`), 18/10/2026. **Proposta técnica**: os prazos e fundamentos abaixo precisam ser validados pelo jurídico e aprovados pela entidade, que é a controladora e pode adotar prazos próprios por estatuto ou política interna. O inventário do que já existe foi conferido no código.

## 1. Regras gerais

1. **O dado só fica enquanto há finalidade ou obrigação** (LGPD art. 15). Terminado o tratamento, ele é **eliminado**, salvo as exceções do art. 16: obrigação legal, estudo anonimizado, transferência a terceiro ou uso exclusivo do controlador **anonimizado**.
2. **Anonimizar é preferível a apagar** quando o registro sustenta estatística, contabilidade ou integridade referencial: some a pessoa, fica o fato. A ferramenta existe: `anonimizar_filiacao`.
3. **O prazo começa no fim da relação**: desfiliação, desligamento, encerramento do processo, apuração da votação ou fim do exercício fiscal. Nunca na data da criação.
4. **Prazo legal mínimo não é teto**: guardar além do mínimo exige justificativa (ex.: processo judicial em curso suspende o descarte, como *legal hold*).
5. **Saúde tem regime próprio**: o acervo fica retido e identificado pelo prazo da NR-07, separado do cadastro administrativo (desenho já implementado em `src/lib/db/lgpd.ts`).
6. **Credencial (tokens, códigos, hashes)** vale só enquanto é usada e nunca entra em backup lógico, exportação ou cópia.

## 2. Tabela de prazos

Coluna "Hoje": **Auto** = rotina automática no sistema; **Manual** = existe ação, mas alguém precisa disparar; **Não** = não há mecanismo.

| # | Dado | Processo | Prazo proposto | Fundamento | Ao fim do prazo | Hoje |
|---|---|---|---|---|---|---|
| RT01 | Cadastro do filiado, vínculos, contatos, endereço, dados bancários | P01 | Enquanto filiado + **5 anos** após a desfiliação | CC art. 206 §5º, I (cobrança); CF art. 7º, XXIX (créditos trabalhistas) | Anonimizar (`anonimizar_filiacao`) | **Manual** (a pedido) |
| RT02 | Interessado que não concluiu a filiação (ficha pública) | P01 | **1 ano** após a última interação | Finalidade esgotada | Eliminar | **Não** |
| RT03 | Termos e aceites (LGPD, desconto) com versão, IP e navegador | P01 | Enquanto o tratamento existir + 5 anos | Prova do consentimento (art. 8º §2º) | Eliminar | **Não** |
| RT04 | Contribuições, relações das fontes pagadoras, cobranças | P02 | **5 anos** após o exercício | CTN arts. 173–174; CC art. 1.194 | Anonimizar o CPF e o nome; manter os valores agregados | **Não** |
| RT05 | Atendimentos do portal e anexos | P03 | **5 anos** após o encerramento | Prova de atendimento e prescrição | Eliminar | **Não** |
| RT06 | Assinaturas de push e preferências de aviso | P03, P15 | Até o cancelamento ou falha permanente de entrega | Finalidade | Eliminar | Parcial (falha de entrega) |
| RT07 | Oposição à contribuição | P04 | Vigência do instrumento coletivo + **5 anos** | Prova perante empregador e Justiça | Eliminar | **Não** |
| RT08 | Voto (`voto_online`, anônimo) e atas/resultados | P05 | **Permanente** | Memória institucional; já não é dado pessoal | Manter | n/a |
| RT09 | Participação nominal (quem votou, canal, comprovante) | P05 | **5 anos** após a assembleia | Prova de quórum e regularidade | Eliminar ou anonimizar | **Não** |
| RT10 | Contatos dos aptos (e-mail de contato, telefone, Telegram, nascimento informado) e verificações | P05 | **90 dias** após a apuração (configurável por rodada) | Prazo de impugnação | Eliminar | **Auto** (V4, `votacao_expurgar_contatos`) |
| RT11 | Voto em separado: vínculo voto–pessoa e contatos | P05 | **Até o encerramento da apuração** | Finalidade (decisão da comissão) | Desligar / eliminar | **Auto** (V1, trigger) |
| RT12 | Reuniões, atos e participantes | P06 | Atas: permanente; listas de participantes: **5 anos** | Memória institucional; prescrição | Eliminar as listas | **Não** |
| RT13 | Diretoria: composição e atos | P07 | **Permanente** | Registro sindical, estatuto | Manter | n/a |
| RT14 | Ficha do diretor (dados bancários, saúde, emergência) | P07 | Fim do mandato + **5 anos** | Prestação de contas | Eliminar a ficha; manter a composição | **Não** |
| RT15 | Acervo de saúde (atendimentos, relatórios, exposição) | P08 | **20 anos** após o fim da exposição ou do vínculo (40 para radiação ionizante) | NR-07; art. 16, I | Eliminar | Alerta (`retencao_ate`), **sem ação** |
| RT16 | CAT e seu PDF | P08 | **20 anos** após o acidente | NR-07 (por analogia); Lei 8.213/91 | Eliminar | **Não** (sem campo de prazo) |
| RT17 | Processos jurídicos e homologações | P09 | Fim do processo + **5 anos** | Prescrição; ação rescisória (2 anos) | Eliminar | **Não** |
| RT18 | Funcionários: cadastro, folha, contracheques, férias | P10 | **5 anos** após o desligamento (folha e contribuições: 10 anos se houver dúvida previdenciária) | CF art. 7º, XXIX; FGTS (STF ARE 709.212); SV 8 | Eliminar | **Não** |
| RT19 | Ponto (marcações, resenhas) | P10 | **5 anos** | CF art. 7º, XXIX | Eliminar | **Não** |
| RT20 | ASO, atestados, exposição e treinamentos de SST | P10 | **20 anos** após o desligamento | NR-07; PPP/LTCAT | Eliminar | **Não** |
| RT21 | Dependentes (inclusive menores) | P10 | Enquanto dependente + prazo do RT18 | Benefício e folha | Eliminar | **Não** |
| RT22 | Documentos financeiros e contábeis (ordens, caixa, CNAB, compras, contratos, RPA) | P11 | **10 anos** após o exercício | CC art. 1.194; prática contábil | Eliminar | **Não** |
| RT23 | Arquivos CNAB completos (`financeiro_remessas.conteudo`) | P11 | **5 anos**; depois só os totais | CTN; minimização | Eliminar o conteúdo | **Não** |
| RT24 | Custeios, viagens, diárias | P12 | Como RT22 | Prestação de contas | Eliminar | **Não** |
| RT25 | Hospedagem: cupons, alocação, avaliação; cessão de espaços | P13 | **5 anos** após a estada ou o uso; lista de espera: até o atendimento | Faturamento; finalidade | Eliminar | **Não** |
| RT26 | Condutores (CNH) | P14 | Enquanto habilitado no sistema + **5 anos** | Indicação de condutor | Eliminar | **Não** |
| RT27 | Infrações de trânsito | P14 | **5 anos** | Lei 9.873/99 (prescrição administrativa) | Eliminar | **Não** |
| RT28 | Envios de comunicação (`comunicacao_envios` copia nome, CPF, contato) | P15 | **2 anos** | Prova de envio; minimização | Eliminar | **Não** |
| RT29 | Inscrições em eventos | P15 | **1 ano** após o evento | Finalidade | Anonimizar | **Manual** (a pedido do titular) |
| RT30 | Foto do inscrito em evento | P15 | `retencao_foto_dias` do evento (padrão **30 dias**) | Consentimento | Eliminar | **Não** (configuração sem rotina) |
| RT31 | Registros de acesso (login, tentativas, códigos enviados) | P16 | **6 meses** | Marco Civil, art. 15 | Eliminar | **Não** |
| RT32 | Trilha de auditoria (`auditoria`) | P16 | **5 anos** | Prestação de contas; prescrição | Eliminar | **Não** |
| RT33 | Livro de exportações e log da API | P16 | **2 anos** | Prestação de contas | Eliminar | **Não** |
| RT34 | Pedidos de titulares (`lgpd_solicitacoes`) | P16 | **5 anos** após o atendimento | Prova de cumprimento (art. 18) | Eliminar | **Não** |
| RT35 | Contas de usuário inativas | P16 | Desativar ao fim do vínculo; eliminar **6 meses** depois | Segurança; finalidade | Eliminar | **Não** |

## 3. Fora do banco

| Onde | O que fica | Prazo proposto | Situação |
|---|---|---|---|
| **Storage do Supabase** (21 buckets) | Documentos, comprovantes, anexos, fotos, PDFs de CAT | O mesmo do registro que aponta para o arquivo | Arquivos **não** são apagados com o registro; não há varredura de órfãos |
| **Backups do Supabase** | Cópia integral do banco | O ciclo do plano (conferir no painel: diário/PITR) | Dado eliminado no banco **persiste até o backup expirar**. Registrar isso na política de privacidade |
| **Sentry** | Erros filtrados | Retenção do plano (conferir) | Sem dado sensível por desenho |
| **Vercel** | Logs de execução e requisição (URLs com token) | Retenção do plano (conferir) | Tokens expiram |
| **Brevo/Resend** | Registro de envio e conteúdo do e-mail | Conferir no painel; reduzir ao mínimo | — |
| **Telegram** | Histórico das conversas com o bot | Fora do controle do Confluir | Não enviar dado sensível (regra do AGENTS.md) |
| **Bubble (legado)** | Todo o histórico anterior à virada | **Eliminar após o desligamento** | Pendente (ver `suboperadores.md`) |
| **Cópias locais** (`supabase/*backup*.json`, `.auditoria-bubble*/`) | Exportações de trabalho com dados pessoais | **Apagar após o uso** (no máximo 30 dias) | Pendente (usuário) |

## 4. Como implementar

Hoje, de 35 linhas, **2 são automáticas** (RT10 e RT11), **2 manuais** (RT01, RT29) e **1 só alerta** (RT15). O plano proposto:

1. **Motor de retenção único**, em vez de uma rotina por tabela:
   - Tabela de regras (`lgpd_regras_retencao`: código RTxx, tabela, coluna-âncora da data, prazo padrão, ação `eliminar`/`anonimizar`, ativa).
   - Prazo ajustável por entidade, dentro de um mínimo legal travado.
   - Um cron mensal executa as regras ativas.
   - Livro de execuções: o que foi apagado, quantas linhas, quando.
   - Rodada em **modo simulação** primeiro: lista o que sairia, sem apagar.
2. **Ordem de ativação** (do maior risco para o menor):
   - RT30 (foto de evento: a regra já existe na tela).
   - RT31 (logs de acesso).
   - RT02 (interessados).
   - RT28 (envios de comunicação).
   - RT23 (CNAB).
   - RT15/RT16 (saúde: transformar o alerta em ação, com aprovação da equipe de saúde).
   - RT01 (anonimização automática de ex-filiados após 5 anos).
   - Demais.
3. **Storage:** ao eliminar ou anonimizar um registro, apagar os arquivos ligados a ele; varredura mensal de órfãos.
4. **Bloqueio por litígio:** marcar pessoa ou registro como "em processo", o que suspende qualquer regra.
5. **Transparência:** a política de privacidade (B6) publica a tabela resumida, e o portal mostra ao titular os prazos que se aplicam a ele.

## 5. Decisões da entidade

- Aprovar ou ajustar cada prazo (especialmente RT01, RT09, RT12, RT18 e RT22).
- Definir quem aprova o descarte do acervo de saúde (RT15, RT16).
- Confirmar o ciclo de backup do plano do Supabase e se ele é aceitável como "prazo de expiração" das eliminações.
- Indicar o responsável pelos pedidos de titulares e pelos bloqueios por litígio.
