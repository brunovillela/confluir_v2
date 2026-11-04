# Auditoria do manual: novembro de 2026

Comparação de todos os artigos do manual com o código atual, feita em 04/11/2026. O texto corrigido está nos próprios artigos. Este documento guarda o que depende de outra pessoa ou de outra entrega: prints, defeitos do sistema e decisões de produto.

**Como foi feito:** leitura de código e histórico de commits. As telas não foram usadas uma a uma, e a maior parte dos prints existentes foi avaliada pelo texto alternativo e pela data, sem abrir a imagem. Rótulos de telas muito grandes foram conferidos por busca de texto, e o que não teve conferência campo a campo está nos relatórios por frente.

**Validação:** os 155 artigos compilam; prints, links internos e entradas no índice do manual estão resolvidos.

## Primeiros prints a fazer

Dos 40 prints P1, estes 12 têm maior risco de erro caro, sem volta ou com pessoa externa sem treino.

| # | Tela | Por quê | Arquivo |
|---|---|---|---|
| 1 | Portal: Primeiro acesso, no celular | Bloqueia o uso do portal e atinge a maioria dos associados | portal/primeiro-acesso.png |
| 2 | Portal: entrada com código por e-mail, no celular | Provável maior causa de chamado externo | portal/entrada-codigo.png |
| 3 | Votação pública: pré-cadastro em /votar, no celular | Fluxo mais perguntado por telefone | fluxos-publicos/votar-precadastro.png |
| 4 | Mesário: abertura da urna, no celular | Pessoa externa, sem treino, em campo | representacao/mesario-abertura-dia.png |
| 5 | Apuração: hash, conferência e livro com motivo | Prova do resultado, difícil de ler sem ver | representacao/apuracao-integridade.png |
| 6 | Assinatura eletrônica: ofício com aceite e código | Pessoa externa em ato com valor legal | fluxos-publicos/assinar-oficio.png |
| 7 | LGPD: regra com simulação e Execução real ligada | Apaga dados sem volta | institucional/lgpd-regra.png |
| 8 | Saúde: Profissionais e tipos | Define quem lê dado clínico | saude/profissionais-tipos.png |
| 9 | Ordem: Trocar situação para A pagar | Autoriza despesa sem a fila da alçada | financeiro/ordem-trocar-situacao.png |
| 10 | Caixa: decisão da prestação | Aprovar zera o saldo e fecha a conta | financeiro/caixa-prestacao-decisao.png |
| 11 | Cartão: fechamento de fatura com diferença | A fatura fechada não reabre | financeiro/fatura-fechamento.png |
| 12 | Termos: histórico com Editar este texto e Nova versão | A escolha errada tem efeito jurídico | filiados/termos-historico.png |

Os artigos só devem receber `<Print>` depois da captura: sem imagem, o usuário vê "Captura pendente".

## Resumo por frente

| Frente | Errado | Falta | Raso | Navegação |
|---|---|---|---|---|
| comunicacao-portal-hotel | 11 | 22 | 13 | 6 |
| filiados | 24 | 12 | 14 | 6 |
| financeiro-compras | 10 | 11 | 10 | 2 |
| institucional-ferramentas | 25 | 20 | 6 | 3 |
| introducao-transversais | 14 | 14 | 15 | 6 |
| operacoes | 23 | 7 | 16 | 2 |
| pessoal-saude | 20 | 17 | 29 | 1 |
| representacao-publicos | 19 | 16 | 9 | 2 |
| **Total** | **146** | **119** | **112** | **28** |

## Prints sugeridos P1 (40)

| Artigo › seção | Rota | O que precisa aparecer | Por que é crítico | Arquivo sugerido |
|---|---|---|---|---|
| portal/visao-geral › Como entrar | /portal | Celular, aba Código por e-mail no passo 2, com o quadro "Não chegou em 1 ou 2 minutos?" | Maior causa provável de chamado de pessoa externa | portal/entrada-codigo.png |
| portal/visao-geral › Primeiro acesso | /portal/primeiro-acesso | Celular, termo pendente e dados faltando, passos 1 e 2 | Bloqueia o uso do portal; atinge a maioria dos associados | portal/primeiro-acesso.png |
| portal/visao-geral › Quando uma parte está parada | /portal/hospedagem | Hospedagem suspensa, faixa "Pausa em Hospedagem" | Pessoa acha que é erro do sistema | portal/parte-suspensa.png |
| portal/carteirinha › O que você pode fazer | /portal/carteirinha | Celular, modo "Apresentar carteirinha" aberto | Usado em pé na portaria; o artigo não tem nenhum print | portal/carteirinha-apresentar.png |
| hotel/recepcao › Recepção | /hotel/recepcao | Hotel de demanda garantida, hóspede encontrado, caixa do documento visível | Obrigação de conferir documento; artigo novo sem imagem | hotel/recepcao.png |
| hotel/faturamento › Emitir | /hotel/faturamento/nova | Reservas faturáveis marcadas, forma de recebimento escolhida | Erro atrasa o pagamento do hotel | hotel/fatura-nova.png |
| perfil › Pedir os dados bancários | /dados-bancarios/[token] | Link aberto, no celular, com o nome da entidade e o CPF mascarado | Pessoa externa, sem treino, informando dado financeiro | filiados/dados-bancarios-publico.png |
| perfil › Pedir os dados bancários | /painel/filiados/[id] | Diálogo com E-mail, WhatsApp e Só gerar o link, com o link gerado; abaixo do botão, o pedido pendente | Três caminhos no mesmo diálogo; o botão Gerar não envia sozinho | filiados/pedir-dados-bancarios.png |
| termos › Versionamento | /painel/filiados/termos | Histórico aberto com Tornar vigente, lixeira e Editar este texto; Nova versão ao lado | Editar sobrescreve versão aceita, e Nova versão não; a escolha errada tem efeito jurídico | filiados/termos-historico.png |
| solicitacoes › Avaliar | /painel/filiados/solicitacoes/[id] | Ficha já aprovada, com o aviso Aprovada por e os botões ainda visíveis | Reprovar depois não apaga o cadastro | filiados/solicitacao-ja-aprovada.png |
| atualizar-por-lista › Cadastre os não encontrados | /painel/filiados/saude-cadastros/atualizar/[loteId] | Lote aplicado, com fonte, alguns marcados e a Condição dos novos cadastros aberta | Condição vem Ativo e a lista traz não filiados; dá para criar filiado por engano | filiados/atualizar-nao-encontrados.png |
| ordens › Trocar a situação | Ordem em autorização | Formulário aberto com A pagar escolhido e o texto "sem passar pela alçada" | Autoriza despesa sem a fila; erro caro | financeiro/ordem-trocar-situacao.png |
| ordens › Registrar o pagamento | Ordem paga | Detalhes do pagamento com Editar pagamento e Voltar para "A pagar", mais a confirmação | Confundem-se remover, editar e estornar | financeiro/ordem-paga-acoes.png |
| contratos › Autorizar o contrato | Contrato não autorizado | Aviso amarelo no topo com o botão Autorizar contrato | Sem ele a geração é recusada e o botão é fácil de perder | compras/contrato-autorizar.png |
| cartoes › Feche a fatura | Fatura aberta com diferença | Formulário com o valor diferente, centro da diferença e aviso de compra não autorizada | Fatura não reabre | financeiro/fatura-fechamento.png |
| caixa › Decidir a prestação | Conta com prestação aguardando | Cartão com saldo declarado, Aprovar e fechar a conta e Rejeitar | Aprovar zera o saldo e fecha a conta | financeiro/caixa-prestacao-decisao.png |
| caixa › Aporte | Meu caixa, aporte pendente | Confirmar recebimento e Recusar | O responsável costuma não ter treino; mexe em dinheiro | financeiro/meu-caixa-aporte.png |
| institucional/lgpd › Ligar uma regra | /painel/institucional/lgpd | Regra RT02 com simulação feita, caixa Execução real ligada visível | Apaga dados sem volta | institucional/lgpd-regra.png |
| institucional/usuarios › Convidar funcionários em lote | /painel/institucional/usuarios | Grupo aberto, com aptos e sem e-mail | Cria contas e dispara e-mails de uma vez | institucional/usuarios-lote.png |
| institucional/api › Chaves de API | /painel/institucional/api | Formulário com escopos, CPF dos filiados em destaque, tabela com uma chave | Expõe dado pessoal a sistema externo; a chave aparece uma vez | institucional/api-chave.png |
| telegram › Vincular a conta | /painel/perfil/avisos#telegram | Link gerado (botão Abrir no Telegram) e, em seguida, vinculado com o formulário de telefone | Fluxo de três passos, e o bot não responde até o último | introducao/telegram-vinculo.png |
| celular › Aprovar | /painel/aprovar, no celular | Uma ordem com apontamento e o campo de motivo aberto, um documento, uma remessa | Decisão de dinheiro no celular | introducao/aprovar-celular.png |
| seguranca › Ativar | /conta/seguranca | Depois de Ativar: QR, chave e campo do código (dados de demo) | Costuma gerar chamado, e errar deixa a pessoa fora | introducao/seguranca-qr.png |
| hospedagem/demanda-garantida › Configurar o hotel | /painel/hospedagem/hoteis/[id] | Tipo de convênio em Demanda garantida, com quartos por dia, distribuição, trava e prazos | Formulário longo; erro aqui muda a alocação de todos os hóspedes | hospedagem/garantida-config.png |
| hospedagem/demanda-garantida › Como a reserva acontece | /hospedagem/reserva/[token] (celular) | Reserva confirmada com QR Code | Pessoa externa, tela apresentada na recepção do hotel | hospedagem/reserva-publica-qr.png |
| hospedagem/demanda-garantida › Lista de espera | /hospedagem/oferta/[token] (celular) | Oferta válida com prazo e botão de confirmar | Pessoa externa; perder o prazo perde a vaga | hospedagem/oferta-vaga.png |
| veiculos/infracoes › Avaliação da gestão | /painel/veiculos/infracoes/[id] | Justificativa apresentada; Não sindical marcado, com forma e valor | Decisão que gera desconto para a pessoa | veiculos/infracao-avaliar.png |
| veiculos/condutores › Cadastrar e autorizar | /painel/veiculos/condutores | Linha nova com "Não autorizado" e botão Autorizar | Passo mais esquecido; gera chamado | veiculos/condutor-autorizar.png |
| saude/atendimentos › Quem pode ler | /painel/saude/atendimentos/[id] | Usuário sem acesso: alerta "Você não tem acesso ao relatório", sem formulário nem trilha | Evita chamado do gestor que acha que é erro | saude/atendimento-acesso-negado.png |
| saude/atendimentos › Profissionais e tipos | /painel/saude/profissionais | Tipos em uso, profissionais com "Lê relatórios de" e o formulário com Coordenação clínica e Inativo | Define quem lê dado clínico; marcar errado expõe relatório | saude/profissionais-tipos.png |
| saude/cat › Conferência em fila | /painel/saude/cat/conferir | CAT sem conferência: PDF à esquerda, bloco com "2 pedem atenção", aviso "Leitura da IA", campo "Não encontrado no documento" | Fluxo sem nenhum print hoje; número errado vai para relatório | saude/cat-conferencia-fila.png |
| saude/cat › Vários PDFs | /painel/saude/cat/nova/pdf | Lote lido com linhas Nova, Já lançada, Possível duplicidade, Gravada sem conferência | Registrar sem conferência grava direto; sem print hoje | saude/cat-lote-pdf.png |
| votacoes › Integridade do resultado | /painel/representacao/votacoes/assembleias/[id]?aba=apuracao | Apuração encerrada e depois reaberta e encerrada de novo: hash, conferência OK, livro com motivo | Prova do resultado; ninguém sabe ler sem ver | representacao/apuracao-integridade.png |
| votacoes › Encerrar e reabrir | mesma rota | Apuração encerrada, com Reabrir apuração aberto e motivo preenchido | Registro permanente, não se apaga | representacao/apuracao-reabrir.png |
| votacao-presencial › 4. O dia da votação | /mesario/urna/[id] | Urna física fechada, dentro do horário, formulário de abertura (celular) | Mesário externo, sem treino, em campo | representacao/mesario-abertura-dia.png |
| votacao-presencial › 5. Apuração | /apurador/urna/[id] | Urna física encerrada, lacres listados, antes de iniciar, com envelopes de voto em separado | Atestado e conclusão não têm volta | representacao/apurador-iniciar.png |
| fluxos-publicos/votacao › Caminho 3 | /votar | Sem login, só votações por abrir (pré-cadastro, Telegram em destaque), em celular | Fluxo mais perguntado por telefone | fluxos-publicos/votar-precadastro.png |
| fluxos-publicos/votacao › Caminho 3 | /votar | Logado, formulário Identifique-se preenchido | Conferência mais rígida gera a maioria das recusas | fluxos-publicos/votar-identifique-se.png |
| fluxos-publicos/assinatura › O passo a passo | /assinar/[token] | Ofício pendente com aceite marcado e código enviado | Pessoa externa, ato com valor legal | fluxos-publicos/assinar-oficio.png |
| filiacao-coletiva › Resolvendo as dúvidas | /painel/representacao/filiacao-coletiva/[id] | Rascunho com dúvidas, Aplicar a mesma decisão, APLICAR | Ação de massa que altera cadastros | representacao/coletiva-conciliacao.png |

## Prints sugeridos P2 (47)

| Artigo › seção | Rota | O que precisa aparecer | Por que é crítico | Arquivo sugerido |
|---|---|---|---|---|
| portal/visao-geral › Como se orientar | /portal/inicio | Celular, folha "Mais" aberta | A barra do celular esconde metade do menu | portal/barra-mais.png |
| portal/visao-geral › Quando uma parte está parada | /portal | Portal desabilitado, tela de entrada com a mensagem | Pessoa externa sem saber se é falha | portal/fora-do-ar.png |
| portal/contribuicao › O que cada situação | /portal/contribuicao | Situação "Com faltas recentes" com "Desconto não localizado" e "Avisar o sindicato" | Dúvida de dinheiro; artigo sem print | portal/contribuicao.png |
| portal/contribuicao › Paga por Pix? | /portal/contribuicao | Filiado por Pix com cobrança em aberto, QR e copia e cola | Fluxo de pagamento de pessoa sem treino | portal/contribuicao-pix.png |
| portal/avisos › Receber no celular | /portal/avisos/preferencias | Cartão "Receber no celular" e interruptores | Permissão do navegador confunde | portal/avisos-preferencias.png |
| hotel/recepcao › Hóspedes por quarto | /hotel/hospedes | Noite com quartos, hóspedes nas três situações | Tela principal do convênio garantido | hotel/hospedes.png |
| hotel/emergencial › Passo a passo | /hotel/emergencial | CPF apto, passo do motivo | Fluxo raro, sob pressão, com o hóspede no balcão | hotel/emergencial.png |
| noticias/mala-direta › Enviar ou agendar | /painel/comunicacao/mensagens/[id] | Rascunho com "Conferir destinatários" respondido e botões de envio | Envio em massa é irreversível; artigo sem print | noticias/mala-direta.png |
| noticias/etiquetas › Imprimir | /painel/comunicacao/etiquetas | Modelo Pimaco escolhido e prévia da folha | Erro gasta folha de etiqueta; artigo sem print | noticias/etiquetas.png |
| receitas › Contribuições não localizadas | /painel/filiados/receitas/[id] | Remessa Associativa conferida, com etiquetas a avisar e já avisados, e o botão Avisar | Avisa filiados em massa; conferir antes evita aviso indevido | filiados/receita-nao-localizadas.png |
| receitas › Editar, fechar e excluir | /painel/filiados/receitas/[id]/editar | Caixa Remessa aberta e o botão Excluir remessa | Fechar fica numa caixa difícil de achar | filiados/remessa-editar.png |
| atendimentos › A lista | /painel/filiados/atendimentos | Indicadores, filtros e situações, com uma atrasada | Artigo sem print; tela com prazos | filiados/atendimentos.png |
| direitos › Condições da hospedagem | /painel/filiados/direitos | Duas condições ligadas e a lista de beneficiários | Restringe direito do associado; combinações confundem | filiados/hospedagem-condicoes.png |
| cobrancas › Antes de começar | /painel/filiados/cobrancas | Indicadores, Configuração e Gerar competência, com cobranças abertas e vencidas | Artigo sem print; Gerar avisa todos os filiados por Pix | filiados/cobrancas.png |
| comprar › O ciclo | Processo em cotação | Propostas com Escolher e Encerrar cotação | A ordem dos botões já estava errada no manual | compras/cotacao-escolher.png |
| contratos › Parcelas recorrentes | Contrato com parcela aguardando | Cartão Aguardando documento fiscal com valor e Enviar nota | Valor diferente desfaz a autorização | compras/contrato-aguardando-nota.png |
| conciliacao › Resolva os pendentes | Lançamentos pendentes | Candidatas de ordem, depósito e contribuição, com Ignorar | A página não tem nenhum print | financeiro/conciliacao-pendentes.png |
| ordens › Pagar a partir do extrato | Extrato | Ordens marcadas e a barra inferior com total, Gerar remessa e Registrar pagamento | Pagamento em lote | financeiro/ordens-extrato-lote.png |
| ordens › Saúde das contas | Contas bancárias | Ordens esperando conta e Titular de outra pessoa com Está certa | Evita pagamento desviado; a seção não tem print | financeiro/contas-bancarias.png |
| institucional/lgpd › Bloqueios por litígio | /painel/institucional/lgpd | Formulário e um bloqueio vigente | Protege dado sob litígio de descarte | institucional/lgpd-bloqueio.png |
| institucional/auditoria › Exportações | /painel/institucional/auditoria?aba=exportacoes | Linhas com CPF destacado e recorte | Aba difícil de achar e usada em apuração | institucional/auditoria-exportacoes.png |
| juridico/reembolsos › Do lançamento ao pagamento | /painel/juridico/processos/[id] | Despesa aguardando, com Aprovar e gerar ordem e Reprovar | Gera ordem de pagamento | juridico/reembolso-avaliar.png |
| patrimonio/itens › Cautela | /painel/patrimonio/[id] | Item sem cautela, formulário com o Termo | Termo não pode ser anexado depois | patrimonio/cautela.png |
| index › Como entrar | /login | Deslogado, com Esqueci minha senha e Ative sua conta | Primeira tela de quem não teve treino | introducao/login.png |
| telegram › Mandar comprovantes | Conversa do Telegram (fora do app) | Resumo de um comprovante com Confirmar, Corrigir e Cancelar | A pessoa precisa saber que nada grava antes do Confirmar | introducao/telegram-comprovante.png |
| avisos › Os canais | /painel/perfil/avisos | Tabela por tipo com as colunas E-mail, Telegram e Celular | Tudo nasce desmarcado: principal causa de "não recebo" | introducao/avisos-preferencias.png |
| index › O painel | /painel | Conta de condutor com Solicitar viagem, Solicitar veículo e o tempo na linha do nome | Botões condicionais e difíceis de achar | introducao/painel-atalhos.png |
| hospedagem/demanda-garantida › Mapa de hóspedes | /painel/hospedagem/mapa | Hotel garantido, quartos com hóspedes nas três situações e o aviso de quarto excedente | Remanejar e cancelar afetam a estadia | hospedagem/mapa.png |
| hospedagem/demanda-garantida › Não comparecimentos | /painel/hospedagem/nao-comparecimentos | Punição em vigor, uma falta abonada, outra aberta, uma liberação | Abono e liberação mudam direito do filiado | hospedagem/nao-comparecimentos.png |
| hospedagem/reservas › A reserva pelo painel | /painel/hospedagem/servicos/[id] | Reserva com hóspedes, Compareceu e Vincular cupom | Comparecimento libera faturamento | hospedagem/servico-painel.png |
| veiculos/infracoes › Novo contrato | /painel/veiculos/contratos | Formulário aberto com Uso do carro em Dedicado | Campo novo que muda a escala da recepção | veiculos/contrato-novo.png |
| eventos/inscricoes › Filiados e prontuário | /painel/eventos/[id] | Lista com selos filiado e convidado, coluna Avaliar e botão Conciliar | Botão difícil de achar, no fim da lista | eventos/conciliar.png |
| eventos/criar › Publicar, adiar, cancelar | /painel/eventos/[id] | Cartão Situação do evento em Adiado, com motivo | Dispara e-mail a todos os inscritos | eventos/situacao-adiar.png |
| saude/atendimentos › Assistidos | /painel/saude/assistidos/novo | Exposição marcada e a sugestão de guarda | Data não muda sozinha ao marcar exposição | saude/assistido-guarda.png |
| saude/cat › CAT registrada sem conferência | /painel/saude/cat/[id] | Alerta com avisos da leitura e os quatro botões | Estado muda o que se pode fazer | saude/cat-sem-conferencia-alerta.png |
| saude/cat › Ligar a CAT ao filiado | /painel/saude/cat/[id] | Cartão Filiado vinculado com sugestão por CPF | O vínculo aparece ao filiado no portal | saude/cat-vincular-filiado.png |
| pessoal/ferias › Regras e travas | /painel/pessoal/ferias/[id] | Segundo gozo com a confirmação "O funcionário concordou" e mensagem de erro de início inválido | Campo que confunde e recusa frequente | pessoal/ferias-gozo-regras.png |
| pessoal/reembolsos › Avaliar | /painel/pessoal/reembolsos/[id] | Avaliar solicitação: valor, mês e ano do contracheque, observação | Campos obrigatórios que definem o pagamento | pessoal/reembolsos-avaliar.png |
| pessoal/contracheques › Configuração | /painel/perfil/dados-bancarios | Conta com selo Financeiro ciente e outra aguardando o Financeiro | Evita pagamento na conta errada e chamado | pessoal/perfil-dados-bancarios.png |
| votacoes › Teste de entrega | /painel/representacao/votacoes/rodadas/[id]?aba=divulgacao | Rodada por abrir, aviso prévio já enviado, selo Não chega, com histórico | Decide a estratégia de entrega | representacao/teste-entrega.png |
| votacoes › Pré-cadastro e kit | mesma rota | Rodada por abrir com pré-cadastrados, texto e QR | Botões pouco óbvios | representacao/kit-divulgacao.png |
| votacoes › Quando o link não chega | /painel/representacao/votacoes/rodadas/[id] | Votação aberta com alerta de link não usado | Muda o que fazer: reenviar não resolve | representacao/alerta-link-nao-usado.png |
| votacoes › Painel | /painel/representacao/votacoes | Votação em curso, alertas e lista de fontes | Reorganização em níveis; substitui o print órfão | representacao/votacoes-painel.png |
| votacoes › Prorrogar | /painel/representacao/votacoes/assembleias/[id] | Assembleia em votação, diálogo com data além da rodada | Fica no livro e estende a rodada | representacao/prorrogar.png |
| votacao-presencial › Parear o terminal | /urna e /mesario/urna/[id] | Terminal mostrando o código; quadro de pareamento | Passo que trava a urna digital | representacao/parear-terminal.png |
| filiacao-coletiva › Desistência | /desistir/[token] | Link aberto dentro do prazo, em celular | Trabalhador externo, prazo legal | fluxos-publicos/desistir.png |
| filiacao-coletiva › Desistência | /portal/desfiliacao em Ver como filiado | Filiado no prazo, quadro Link de desistência sem login | Botão muito difícil de achar | representacao/coletiva-copiar-link.png |

## Prints sugeridos P3 (15)

| Artigo › seção | Rota | O que precisa aparecer | Por que é crítico | Arquivo sugerido |
|---|---|---|---|---|
| hotel/avaliacoes › Os indicadores | /hotel/avaliacoes | Hotel com avaliações e um comentário moderado | Artigo sem print | hotel/avaliacoes.png |
| noticias/slides-tv › Montar um conjunto | /painel/comunicacao/slides/[id] | Conjunto com slides No ar e Agendado, link e último acesso | Artigo sem print | noticias/slides.png |
| noticias/aniversariantes › A lista do dia | /painel/comunicacao/aniversariantes | Dia com aniversariantes, situações do e-mail e botão WhatsApp | Artigo sem print | noticias/aniversariantes.png |
| index › Cartões | /painel/filiados | Todos os cartões de área visíveis | O print atual prioriza outros elementos; bom para localizar áreas | filiados/areas.png |
| termos › Melhorar com IA | /painel/filiados/termos | Editor com texto e os botões | Bom ter | filiados/termo-ia.png |
| remessas › Antes da primeira remessa | Conta bancária da remessa | Formulário com convênio e versões | Campos técnicos | financeiro/remessa-conta.png |
| ferramentas/documentos › Novas versões | /painel/ferramentas/documentos/[id] | Duas versões com vigência | Conceito de versões é pouco óbvio | ferramentas/documento-versoes.png |
| ferramentas/projetos › Anomalias | /painel/ferramentas/anomalias/[id] | Anomalia com porquês, causa raiz e providência | Fluxo em etapas | ferramentas/anomalia.png |
| suporte › Pergunte à IA | /painel/ajuda | Pergunta com resposta e o aviso de conferir | Bom ter: função sem nenhuma outra indicação | introducao/pergunte-ia.png |
| viagens/index › Pedir uma viagem | /painel/perfil/viagens | Conta com as duas permissões, "Para outra pessoa" escolhido | Mostra a pergunta nova | viagens/solicitar-para-quem.png |
| veiculos/abastecimentos › Pelo Telegram | bot (celular) | Resumo do cupom com Confirmar, Corrigir e Cancelar | Fluxo fora do painel | veiculos/abastecimento-telegram.png |
| saude/atendimentos › Agenda | /painel/saude/agenda | Linhas Agendado, Atendido e Sem registro | Bom ter | saude/agenda.png |
| pessoal/atestados-aso › ASO | /painel/pessoal/aso/[id] (edição) | Formulário com Exame realizado e Enviado | Bom ter | pessoal/aso-form.png |
| votacoes › Entrega | /painel/representacao/votacoes/entrega | Várias assembleias online | Bom ter | representacao/entrega-comparativo.png |
| votacoes › Excluir vários aptos | /painel/representacao/votacoes/rodadas/[id]?aba=aptos | Linhas marcadas, botões de exclusão | Bom ter; remoção em massa | representacao/aptos-exclusao.png |

## Prints existentes para refazer ou conferir (34)

| Arquivo | O que mudou | Evidência |
|---|---|---|
| public/ajuda/portal/inicio.png (09/10) | O Início foi refeito em faixas (Para você resolver, Minha situação, Novidades, Compromissos, Serviços), com menu lateral. O alt do artigo ainda fala em "atalhos e cards" | commits b035790f e c0e8e1c4 (11-12/10); src/app/portal/inicio/page.tsx:27 |
| public/ajuda/portal/{cadastro,convenios,hospedagem,lgpd,noticias,saude,agenda}.png (09/10) | Anteriores à casca com menu lateral e às ondas 2 a 5 do portal | commits b035790f a c0e8e1c4 (11-12/10), d44dcbc1 (18/10) |
| public/ajuda/portal/votacao.png (22/09) | O mais antigo. E-mail de votação recolhido e comprovante foram alterados depois | commits e9f9b5b2 (11/10), 98565aa5 (19/10) |
| public/ajuda/portal/eventos.png (17/10) | Conferir: a legenda diz que não há formulário, o que continua certo, mas o print é anterior à reforma de 18/10 | commit d44dcbc1 |
| public/ajuda/filiados/relatorios.png | Texto fala em quatro cartões; o hub tem cinco, com Etiquetas para os Correios. Conferir se foi recortado | relatorios/page.tsx:88-94 |
| public/ajuda/filiados/direitos.png | Texto não cita Condições da hospedagem, beneficiários, não comparecimento e Termos legais. Conferir se é recorte | direitos/page.tsx:112-225 |
| public/ajuda/filiados/acompanhamento.png | Texto dizia botão Avançar (ajustei a legenda); o botão real tem o nome da próxima etapa. Conferir a imagem | acompanhamento/page.tsx:120-124 |
| public/ajuda/filiados/perfil-dados-bancarios.png | Texto não cita o botão Pedir dados bancários. Print do mesmo dia da entrega; conferir | [id]/page.tsx:503-510 |
| public/ajuda/filiados/perfil-reembolsos.png | Conferir o texto de descrição do cartão, que mudou para greve e cobrança indevida | [id]/page.tsx:901-904 |
| public/ajuda/filiados/solicitacao-avaliacao.png | Texto fala em aprovar ou recusar; o botão é Reprovar. Conferir a imagem | solicitacoes-forms.tsx:31-44 |
| public/ajuda/financeiro/cartoes.png | Mostra o formulário no topo e a lista sem as colunas Uso e Fatura aberta; hoje é botão Novo cartão com diálogo. Print de 17/10, mudança de 19/10 (conferido pelo texto alternativo e pela data, imagem não aberta) | financeiro/cartoes/page.tsx:56-60, 83-84; commit 72264a09 |
| public/ajuda/financeiro/painel.png | Faltam os cartões Tributos, Contas bancárias e Auditoria das ordens (podem depender do perfil da captura). O texto alternativo diz "indicadores no topo", mas os cartões vêm antes (imagem aberta) | financeiro/page.tsx:130-164 |
| public/ajuda/compras/contrato.png | Print de 17/10; o texto alternativo não cita o aviso de autorização do contrato. Conferir (imagem não aberta) | compras/contratos/[id]/page.tsx:237 |
| public/ajuda/compras/avaliacoes.png | Print de 17/10; conferir se já mostra a etiqueta de alertas clicável (imagem não aberta) | compras/avaliacoes/page.tsx:78 |
| public/ajuda/institucional/painel.png | Faltam os cartões Deliberações e LGPD: retenção e descarte | src/app/painel/institucional/page.tsx:68-75,148-154 (conferido na imagem) |
| public/ajuda/ferramentas/documentos.png | Não é usado por nenhum artigo; mostra a entidade real Sindipetro-NF e o menu antigo "Compras". Não reaproveitei. Sugiro refazer na demo e apagar este | conferido na imagem |
| public/ajuda/institucional/conselho-fiscal-patrimonio.png | Não é usado por nenhum artigo; pode ilustrar Somente leitura em patrimonio/index. Não abri a imagem | grep em src/conteudo |
| Texto alternativo (imagens corretas) | Corrigi o texto de juridico/painel, ferramentas/painel, ferramentas/projetos, patrimonio/notas e patrimonio/recintos, que descreviam o que não existe. As imagens de recintos e de itens não foram abertas: o novo texto de recintos vem das colunas da tela | recintos/page.tsx (colunas Recinto, Código, Sede, Itens) |
| public/ajuda/introducao/alternador.png | Só de fundo: não mostra o tempo nem os atalhos na linha do nome, talvez por causa da conta de demo. O alternador, tema do print, continua certo | src/app/painel/page.tsx:107-126 |
| public/ajuda/introducao/meu-perfil.png | Conferido: segue igual à tela | src/app/painel/perfil/page.tsx |
| public/ajuda/viagens/solicitar.png | Conferido: não mostra a pergunta "para quem é a viagem". Não está errado para quem tem uma permissão só, mas o texto a descreve. Departamento e demais campos conferem | perfil/viagens/page.tsx:99 |
| public/ajuda/hospedagem/painel.png | Imagem conferida e atual; o texto alternativo é que estava antigo (corrigi) | hospedagem/page.tsx:85-127 |
| public/ajuda/veiculos/infracao.png | Imagem atual, porém mostra cobrança pendente com "Justificativa ainda não apresentada", estado que o fluxo normal não produz (dado de demonstração) | infracoes/[id]/page.tsx:66-70 |
| public/ajuda/saude/painel.png | Sem o cartão Pedidos do portal, que aparece para quem tem Atendimentos ou Gestão (print de 17/10; cartão do R2 de 18/10) | src/app/painel/saude/page.tsx:94-106 |
| public/ajuda/saude/cat.png | Print de 17/10: sem o botão Conferir em fila, sem a opção Registradas sem conferência e sem os selos Sem conferência e Com pendência | src/app/painel/saude/cat/page.tsx:166-176,422-432 |
| public/ajuda/saude/painel-analitico.png | Print de 17/10: anterior aos filtros de gravidade, prazo, duração e local (26/10). O alt cita seis indicadores; hoje são oito. Precisa de reprint e de ajuste no alt | src/app/painel/saude/indicadores/painel-saude.tsx:313-340; commit 29367f86 |
| public/ajuda/saude/painel-analitico-filtro.png | Mesma defasagem | commit 29367f86 |
| public/ajuda/saude/atendimentos.png | Trilha mostra "gravacao" e o relatório vazio ao lado: dado de demonstração incoerente (alt ajustado no artigo) | src/app/painel/saude/atendimentos/[id]/page.tsx:259-264 |
| public/ajuda/pessoal/painel-visao-geral.png | Cartão do ponto com "horas 70%/100%" (hoje "horas extras"). A ordem das seções está certa; o alt é que estava errado e foi corrigido | src/app/painel/pessoal/page.tsx:223 |
| representacao/aviso-aptos.png | Texto antigo do cartão (sem e-mail pessoal e Telegram) e sem Envio automático; rodada encerrada, com botões apagados | rodadas/[id]/aviso-aptos.tsx:142-146,205-211 |
| representacao/empregador.png | Pelo texto alternativo, as abas não incluem Arrecadação (imagem não aberta; alt não alterado) | empregadores/[id]/page.tsx:285 |
| representacao/campanha.png | Imagem atual, mas com campanha "Sem fonte pagadora" e alerta vermelho, pouco didático para ilustrar a página; só corrigi o texto alternativo | campanhas/[id]/page.tsx:105-113 |
| representacao/votacoes-lista.png e fluxos-publicos/oposicao.png | Órfãos, nenhum artigo usa | auditoria.json, orfaos |
| representacao/painel.png e fluxos-publicos/votacao.png | Imagens atuais; só o texto alternativo estava velho (corrigido) | representacao/page.tsx; votar-form.tsx:132 |

## Pendências no texto (9)

| Artigo | O que falta | Por que ficou |
|---|---|---|
| O que há de novo | A última entrada é de 19/10; o aviso de novidades não dispara desde então | Não é artigo do manual; é entrega à parte |
| pessoal/anuenios-niveis | Selo de permissão | Arquivo com alteração não commitada de outro trabalho |
| pessoal/anuenios-niveis | O aviso de 30 dias só cita anuênios, mas níveis também alertam | Idem |
| pessoal/anuenios-niveis | Diz que a progressão é automática, e não foi achada rotina que faça isso | Idem; precisa de confirmação |
| pessoal/funcionarios | Como um funcionário novo entra no quadro do Pessoal | Caminho não confirmado no código |
| financeiro/centros-custo | Onde se define o departamento do centro de custo | Campo não localizado |
| financeiro/ordens, compras/comprar | Detalhar o custeio institucional como origem da ordem | O detalhe está em institucional/custeios |
| financeiro (sem artigo próprio) | Tela Cobranças de multas: baixa, comprovante e histórico | Só citada em veiculos/infracoes |
| veiculos/infracoes | Contratos de aluguel ocupam mais da metade do artigo | Decidir se viram artigo próprio |

## Possíveis defeitos do sistema

### comunicacao-portal-hotel

1. **Texto técnico para o usuário externo.** A área do hotel mostra "o sindicato precisa rodar supabase/hospedagem-faturamento.sql" (src/app/hotel/contas/actions.ts:50; contas/page.tsx:36). No painel há o mesmo em etiquetas/page.tsx:149, links/page.tsx:71, qrcodes/page.tsx:61, slides/actions.ts:79, slides/page.tsx:63, textos/page.tsx:87 e textos/novo/page.tsx:51, e em src/lib/db/noticias.ts:219.
2. **Hotel, Início:** a frase "Sem o relatório dos hóspedes a reserva não entra na fatura" e o alerta aparecem para todo hotel, mas a trava só vale com `exige_relatorio_para_faturar`. `relatorioPendente` não olha essa opção (src/lib/db/hospedagem.ts:188; src/app/hotel/inicio/page.tsx). O mesmo vale para o triângulo em Reservas.
3. **Hotel, Acordo:** a pergunta frequente diz "Hoje não é obrigatório" sobre o relatório, fixa, inclusive para hotel que exige (src/app/hotel/acordo/page.tsx:47).
4. **Hotel, Hóspedes por quarto, em convênio por uso:** o aviso diz "as reservas estão no Início"; elas ficam na aba Reservas (src/app/hotel/hospedes/page.tsx, bloco `!ehGarantida`). A tela só é alcançável por endereço direto.
5. **Carteirinha:** o cartão diz que quem ler o QR vê "nome, matrícula e a condição atual. Nada mais", mas a verificação também mostra "Filiado(a) desde" (src/app/portal/carteirinha/page.tsx; src/app/carteirinha/[codigo]/page.tsx:47). O artigo segue a verificação.
6. **Ajuda do portal:** o "?" em O sindicato não tem artigo mapeado (src/lib/ajuda/mapa-portal.ts:20).

### filiados

1. **Termo aceito pode ser reescrito.** Editar este texto altera no lugar uma versão já aceita, sem trava e sem histórico. Contradiz a garantia de que o aceite guarda o texto exato. Evidência: src/lib/db/filiacao-termos.ts:100-114; termos/page.tsx:145-152.
2. **Reprovar ficha aprovada não desfaz a filiação.** A situação vira reprovada, o trabalhador recebe "não foi aprovada", e o cadastro segue Ativo. Evidência: src/lib/db/filiacao-publica.ts:819-834; solicitacoes/[id]/page.tsx:47-49.
3. **Remessa fechada aceita lançamento.** A caixa diz "ainda recebe lançamentos", mas nada confere esse estado na página da fonte. Evidência: remessa-form.tsx:121-124; [fonteId]/actions.ts e page.tsx:podeEnviar.
4. **Lista sem nada a atualizar trava o cadastro dos não encontrados.** Cadastrar exige lote aplicado, e sem alterações não há botão de aplicar. Mesmo caso se desmarcar tudo. Evidência: [loteId]/page.tsx:208-212,242; previa.tsx (botão desabilitado sem marcados).
5. **Cartões levam a "sem acesso".** Configurações de filiação, Inadimplentes, Cobranças Pix e Convênios não conferem permissão no cartão. Idem Possíveis duplicidades em Cadastros pendentes e no cartão de saúde, para quem só tem Filiados. Evidência: filiados/page.tsx:490-528; cadastros-pendentes/page.tsx:102-107; duplicidades/page.tsx:42.
6. **Aprovação com CPF que surgiu depois.** A criação da ficha recusa CPF já filiado, mas a aprovação cria o cadastro sem conferir de novo. Se a pessoa foi cadastrada no intervalo, nasce duplicidade. Evidência: filiacao-publica.ts:206-217 x 839-880.
7. **Lote: permissão divergente.** Pedir dados no lote aceita também Ordens de pagamento, mas a tela do lote exige Reembolsos ou Gestão. Inofensivo, só registro. Evidência: reembolsos/actions.ts:252.
8. **Mensagens técnicas na tela.** Atendimentos, Cobranças e Coletivas ainda citam "rode supabase/....sql" como aviso de banco ausente, contra a regra de migrações. Evidência: atendimentos/page.tsx:60; cobrancas/page.tsx:65; coletivas/page.tsx:119-121.

### financeiro-compras

1. **Comprador sem "Aquisição — editar" não vê as ações do processo.** A Área do comprador e as ações do servidor aceitam Comprador, mas a tela só mostra cotação, propostas, cancelar e gerar ordem com `aquisicoes_compras_edicao`. Evidência: compras/[id]/page.tsx:207, 212; compras/[id]/actions.ts:72-73; compras/comprador/page.tsx:97. O manual diz que o comprador opera tudo; conferir.
2. **Desfazer conciliação não reverte a baixa da contribuição nem o depósito criado**, e o evento "Conciliada" fica na trilha da ordem. Evidência: src/lib/db/conciliacao.ts:606-615. O manual agora descreve esse comportamento.
3. **Remover pagamento não confere a situação da ordem** e o estorno/remoção não tratam a conciliação já feita (o lançamento segue apontando para a ordem). Evidência: financeiro/ordens/[id]/actions.ts:254-285. Não testado em execução.
4. **Permissão "Centros de custo" (`financeiro_centro_custo`) não é usada por nenhuma tela**: só existe no catálogo. Quem a recebe não ganha nada. Evidência: busca retornou só src/lib/permissoes-catalogo.ts:33.
5. **Exportação contábil aparece para todos no painel do Financeiro**, sem filtro, mas a página exige leitura ou pagamento. Evidência: financeiro/page.tsx:171-176; contabil/page.tsx:29. **Cartões** faz o inverso: quem tem só Caixa pode usar a página, mas não vê o cartão. financeiro/page.tsx:136; cartoes/page.tsx:30.
6. **Meus estornos não tem entrada de menu**: só se chega pelo aviso no sino ou pela tela do estorno. Evidência: nenhum link para a lista fora de estornos/[id]/page.tsx:71.
7. **Botão Registrar estorno aparece com mês fechado** e só recusa ao enviar. A tela avisa em texto. Evidência: ordens/[id]/page.tsx:195-200, 610-616; ordens-estorno.ts:169-170.
8. **Ação de aprovar prestação grava em etapas sem transação** (acerto, prestação, conta): falha no meio deixa estado parcial. Evidência: caixas/actions.ts:164-193.

### institucional-ferramentas

1. **Cartão que leva a acesso negado.** O hub mostra Atas, Registro sindical e E-mails a quem tem só "Organização", mas essas páginas não aceitam essa permissão. src/app/painel/institucional/page.tsx (chavesAlternativas) × atas/page.tsx:43, registro-mte/page.tsx:44, emails/page.tsx:34.
2. **Fila de reembolsos sem entrada fixa.** Sem despesa aguardando, não há link para /painel/juridico/reembolsos no módulo: pagos e reprovados ficam difíceis de achar. src/app/painel/juridico/page.tsx:134.
3. **Item não se liga a nota.** A tela de nota mostra "Itens da nota" e a coluna Itens, mas nenhuma tela grava o vínculo. patrimonio/actions.ts:46-55; src/lib/db/patrimonio.ts:1024.
4. **Termo de cautela** só entra ao registrar: não há como anexar depois. patrimonio/actions.ts:99; [id]/cautela-controles.tsx.
5. **Filtro de homologações por empregador** existe, mas nenhuma tela leva a ele; o comentário cita um link do hub que não há. homologacoes/page.tsx:186.
6. **Tarefa sem edição.** Existe a ação de atualizar, mas a tela só cria e conclui. tarefas/actions.ts:80; tarefa-forms.tsx.
7. **Sedes do recinto fixas** (Macaé, Campos, Rio das Ostras…), o que não serve a outra entidade. src/lib/patrimonio-constantes.ts:15.
8. **Assunto do aviso errado.** O reembolso ao escritório avisa com "Reembolso de filiado a avaliar". src/lib/db/juridico.ts:1102-1112.
9. **Botão "Reenviar e-mail"** tem o mesmo rótulo quando o convite foi por Telegram. Não testei o envio. ferramentas/oficios/[id]/assinatura-acoes.tsx:164.
10. **Item em cautela pode ser inativado**, sem trava nem aviso. [id]/item-acoes.tsx; patrimonio/actions.ts:254.
11. **Texto técnico ao usuário final:** "rode supabase/patrimonio.sql" e equivalentes no Jurídico, Auditoria e API; esses arquivos já estão em supabase/historico. patrimonio/page.tsx; juridico/page.tsx.

### introducao-transversais

1. **Desativar a verificação em duas etapas não pede código nem confirmação** com a sessão já verificada. Basta uma sessão aberta para retirar a proteção: src/app/conta/seguranca/seguranca-form.tsx:122-128; actions.ts:73-86. O manual prometia o contrário.
2. **Ver a demanda leva à tela de sem acesso** para quem relata sem ter permissão de Demandas. O próprio relator não acompanha o relato: src/components/layout/feedback-dialog.tsx:74; src/app/painel/ferramentas/demandas/[id]/page.tsx:37.
3. **Devolução de ordem pelo /aprovar guarda o pedido de motivo em memória**, enquanto viagem e comprovante usam tabela justamente porque "cada mensagem pode cair numa instância diferente". O motivo pode se perder e virar texto livre para a IA: src/lib/telegram-aprovacoes.ts:26; src/lib/telegram-viagem.ts:34-35. Hipótese pela leitura do código, não reproduzida.
4. **O bot manda a "Meu perfil → Telegram"**, nome que não existe mais no menu: src/app/api/telegram/webhook/route.ts:66,212,236,244,251,264,274,284. O manual explica a diferença, mas o texto do bot deveria mudar.
5. **Quem só tem documento para assinar não vê a aba Gestão** (a condição não considera assinaturas), embora a aba tenha o bloco dele. Ele ainda acha pela caixa de entrada: src/app/painel/page.tsx:86; src/app/painel/_painel/aba-gestao.tsx:48.
6. **Dentro de /recepcao há aviso técnico** "Rode supabase/eventos.sql" para usuário final, se as tabelas faltarem: src/app/recepcao/page.tsx:52-57.
7. **/ajuda do bot não lista /cancelar nem /devolver**, que existem: src/lib/telegram-pendencias-fluxo.ts:122-136.

### operacoes

1. **Permissões sem efeito**: "Condutores" e "Contratos de aluguel" aparecem no catálogo, mas as telas só aceitam Gestão de veículos. "Condutores" só vale para o /carros do Telegram. Quem recebe acha que ganhou acesso (lib/permissoes-catalogo.ts:86-88; condutores/page.tsx:39; contratos/page.tsx:34; api/telegram/webhook/route.ts:574).
2. **Permissão "Infrações" leva a tela sem formulário**: habilita o botão Registrar infração, mas ele abre a lista onde só a gestão vê o formulário, e a gravação exige gestão ([id]/infracoes/page.tsx:33-55; infracoes/page.tsx:68; infracoes/actions.ts:44).
3. **Privacidade**: a aba Infrações do veículo mostra multas e condutores de todos a quem tem só Veículos ou Recepção, enquanto a lista geral restringe às próprias; o link da linha então redireciona ([id]/infracoes/page.tsx:29,40,84; infracoes/[id]/page.tsx:53).
4. **Botão errado**: "Solicitar veículo" na página de Veículos aponta para /painel#meus-veiculos, quadro que não existe sem solicitação aberta; deveria ir a /painel/solicitar-veiculo (veiculos/page.tsx:208; meus-veiculos.tsx:39).
5. **Cartões que barram**: Recepção sem Veículos vê Checklist, Manutenções e Infrações no painel, mas as telas recusam (veiculos/page.tsx:127-176; checklists/page.tsx:43; manutencoes/page.tsx:36; infracoes/page.tsx:35).
6. "Lançar abastecimento", na tela do veículo, abre a lista, não a inclusão ([id]/abastecimentos/page.tsx:54).
7. Texto obsoleto: "O desconto em diárias ainda será criado", mas o desconto já existe (infracao-forms.tsx:332; lib/db/diarias.ts:678).
8. Excluir checklist existe no servidor sem botão (checklists/actions.ts:185).
9. O cadastro do veículo não tem campo de arquivo, mas a página mostra CRLV, apólice e CRV; documento novo não tem como entrar (veiculo-form.tsx; [id]/page.tsx:140-151).
10. Mensagens "rode supabase/….sql" visíveis ao usuário (veiculos/page.tsx:252; infracao-forms.tsx:171; agendamentos/page.tsx:119).
11. Erro de digitação: "nao pode ocupar" (eventos/evento-forms.tsx:214).

### pessoal-saude

1. **Sigilo clínico, o mais grave:** quem registra o atendimento vira "autor" e lê e grava o relatório, mesmo sem cadastro de profissional. Como `saude_gestao` e `saude_atendimento` registram atendimento, a secretaria ou a gestão que clicar em Registrar atendimento passa a ler o conteúdo daquele atendimento. A checagem vem antes do teste de inativo, então **Inativo não tira esse acesso**, apesar de a tela dizer "deixa de ler relatórios imediatamente". Contradiz "Permissão administrativa não abre conteúdo clínico" e o comentário da regra. src/lib/saude-sigilo.ts:164-169; src/app/painel/saude/atendimentos/actions.ts:49; profissionais-forms.tsx:190-191. O manual agora descreve o comportamento real; não alterei código.
2. A gestão pode editar o Tipo e o Profissional de um atendimento, mudando quem lê o relatório, sem registro dessa troca na trilha do relatório. src/lib/db/atendimentos.ts:325-350.
3. Quem escreve o relatório sem ser atendente nem profissional indicado (ex.: outro do mesmo tipo) não vira autor: `autor_profissional_id` é gravado, mas a regra não o usa. Sai do tipo, perde o acesso ao que escreveu. src/lib/db/atendimentos.ts:440; src/lib/saude-sigilo.ts:158-189.
4. Telas com texto impreciso: Profissionais diz "ninguém lê relatório algum" sem profissional cadastrado, mas quem registrou lê; e "Sem tipos não há como registrar atendimento", mas o tipo é opcional. src/app/painel/saude/profissionais/page.tsx:119-120,188; atendimento-forms.tsx:93-100.
5. Assistido novo: marcar exposição troca o texto para "(40 anos)", mas a data de Guardar até continua em 20 anos, e nada recalcula ao salvar. Risco de guarda abaixo do piso legal. src/app/painel/saude/assistidos/novo/page.tsx:36; assistido-form.tsx:143-152; assistidos/actions.ts:30-44.
6. Cartão Movimento da folha aparece para Gestão de pessoal, mas a página só aceita as duas permissões próprias e manda para Sem acesso. src/app/painel/pessoal/page.tsx:90,373; contabilidade/page.tsx:26.
7. Permissão "Registro de ponto" (`pessoal_registro_ponto`) está no catálogo, mas nenhuma tela a usa: o ponto só abre para Gestão. src/lib/permissoes-catalogo.ts:69; ponto/page.tsx:45.
8. Botão Painel analítico aparece para quem tem só Atendimentos, que recebe Sem acesso. src/app/painel/saude/page.tsx:57-62; indicadores/page.tsx:15.
9. Mensagens técnicas ao usuário: "rode supabase/*.sql" em Saúde e no cartão do Pessoal. src/app/painel/saude/page.tsx:202-204; src/app/painel/pessoal/page.tsx:270,286.
10. Excluir gozo de férias pedido não avisa o funcionário: ele não fica sabendo que o pedido caiu. src/lib/db/ferias.ts:746-758.

### representacao-publicos

1. **Reunião de colaboradores sem resultado.** A tela e o comentário do código dizem que o resultado entra agregado, mas nenhuma tela grava esses números (`voto_votacao_respostas` só é lida numa trava de exclusão, `src/lib/db/assembleias.ts:1511`). O encerramento congela resultado vazio e gera hash disso. A descrição da modalidade em `assembleias-rodada.tsx:73-74` promete o que não existe.
2. **Interruptor "Apuração encerrada" em Dados da rodada** (`rodadas/[id]/rodada-form.tsx:169,242-261`). Grava na rodada sem hash, livro nem conferência, e `votacao-portal.ts:505-506,914-916` trata a assembleia como encerrada. Dá para fechar a votação e contornar o livro. Pela comparação, deveria sair da tela.
3. **Voto em separado digital deixa cadastro órfão.** O registro é gravado antes de conferir o terminal (`votacao-mesarios.ts:1599-1639`). Sem terminal ou com cédula aberta, a tela dá erro, mas o cadastro fica, e o mesário tende a repetir. O encerramento ignora esses (sem voto), porém a lista os mostra como pendentes.
4. **Prazo de 4 MB × 10 MB.** A ata diz até 4 MB (limite real dos envios), e `subirArquivoAssembleias` traz mensagem de 10 MB (`assembleias.ts:2294-2295`). Acima de 4 MB, o erro não será essa mensagem. Vale conferir edital e card também.
5. **Avisos técnicos para o usuário final.** Telas ainda dizem "rode supabase/….sql no SQL Editor" (`votacoes/page.tsx:117`, `aviso-aptos.tsx:69,365`, `filiacao-coletiva/page.tsx:93`), o que contraria a regra de migração e confunde se aparecer.
6. **Textos da tela sobre a filiação coletiva** dizem que se desiste "pela área do filiado", sem citar o link (`coletivas/page.tsx:220`). Menor.
7. **Texto do card Integridade** cita `npm run votacao:auditar` e `sha256sum` para o usuário (`integridade-card.tsx:53,125`). Menor.

## Dúvidas para o dono do produto

### comunicacao-portal-hotel

1. **Faturamento na demanda garantida:** a aba existe nos dois convênios, e a nova fatura exige "hóspede vinculado por cupom e comparecimento". Não conferi se a entrada da Recepção conta como comparecimento para faturar. Por isso, o artigo novo não fala de faturamento. Vale confirmar e completar.
2. **Não comparecimento na demanda garantida:** quem marca a falta e quando? Não descrevi no artigo novo.
3. **O sindicato:** deixei como seção da visão geral. Se preferir área própria na ajuda (o menu tem o item), o texto já está pronto para mover, mas é preciso mexer no manifesto e no mapa.
4. **Portal, Contribuição:** o título diz "Dúvidas frequentes", e não "Erros comuns", em vários artigos do portal. Mantive, por soar melhor para o associado. Confirma?

### filiados

1. Ficha pública aprovada deve mesmo nascer **Ativo**, sem passar por "Filiação não informada à fonte"? O artigo antigo e a trilha de etapas sugerem o contrário. O manual agora descreve o código.
2. Baixa de cobrança Pix grava recebimento sem fonte. Com a regra "a filiação depende de fonte", o restante do sistema recusa lançamento sem fonte. Isso é intencional? Evidência: cobrancas.ts:406 (fonte_pg_id: null) e [fonteId]/actions.ts:82.
3. Os apontamentos automáticos do prontuário devem continuar editáveis e excluíveis?
4. "Fechada" na remessa deveria travar lançamentos?

### financeiro-compras

1. **Caixa × Caixa — administração:** o código dá a mesma capacidade às duas (criar conta, aporte, aprovar prestação). O manual dizia que eram diferentes. Escrevi o que o código faz. Era essa a intenção, ou "Caixa" deveria só consultar? Se for, é defeito de permissão em área de dinheiro.
2. **Trocar situação → A pagar** deixa quem tem Ordens de pagamento autorizar sem limite de alçada (só contrato e custeio pedem permissão extra). Documentei. É o desejado? A segregação de funções da auditoria automática aponta esse caso?
3. **Departamento do centro de custo:** onde se define? Não há campo no cadastro do centro nem em Organização. O texto foi mantido.
4. **Fatura fechada por engano:** não há como reabrir. Qual é a orientação oficial? O manual só avisa.
5. **Guia de tributo lançada por engano:** só a prevista se cancela. O caminho é cancelar a ordem? Não verifiquei o efeito na guia, por isso não escrevi.

### institucional-ferramentas

1. **Jurídico geral aprova reembolso?** O manual dizia que só Gestão jurídica; o código aceita as duas, e a mesma pessoa pode registrar e aprovar. Documentei o que o código faz. Se a intenção era separar, é defeito de controle interno. reembolso-actions.ts:76.
2. **A permissão Homologações deve abrir e editar Processos** e registrar despesa? Hoje sim. processos/actions.ts:15-18; reembolso-actions.ts:34.
3. **Documentos:** quem tem a permissão pode excluir documento com todas as versões. Não há permissão separada para isso, é o desejado?
4. **Permissões "Comunicação interna" e "Busca de pessoas"** estão no catálogo, sem cartão em Ferramentas. Não verifiquei se outra tela as usa e não as citei. src/lib/permissoes-catalogo.ts:120-121.
5. **Modelos de ofício:** só encontrei o assunto e o corpo padrão por tipo, sem cadastro de modelos. É isso mesmo? O manual já descreve assim.
6. **Modelo de DPA:** consta em commit, mas não encontrei tela. Não citei no manual.

### introducao-transversais

1. Desativar 2FA deve pedir código sempre? Documentei o comportamento atual.
2. Trocar senha estando logado: é intencional só existir pelo Esqueci minha senha? Documentei assim. Não achei tela de troca em /painel/perfil nem em /conta/seguranca.
3. Arrecadação segue a permissão de filiação, e não a do Financeiro. O manual dizia o contrário. Documentei o código: é o desejado?
4. O bot é um só para todas as entidades, mas /viagem e os comprovantes exigem que a entidade da pessoa seja a do endereço do webhook; fora dela, mandam usar o painel (src/lib/telegram-viagem.ts:117; src/lib/telegram-arquivo.ts:128). Em várias entidades, isso limita o uso. Não pus no manual: é regra pretendida?
5. O dado de pendências calculado em Indicadores (src/lib/db/indicadores.ts:222) deveria aparecer na tela? Tirei o item do manual.
6. "Pergunte à IA" e a base do portal usam a base gerada do manual no build (package.json, prebuild). As edições só chegam à IA depois do build. Não há ação além de gerar no próximo deploy.

### operacoes

- Mover Contratos de aluguel para artigo próprio (`veiculos/contratos`)? Hoje é mais da metade do artigo de Infrações. Não movi para não mexer em estrutura sem decisão.
- Os documentos do veículo são só legado ou falta o envio (defeito 9)?
- As permissões do defeito 1 devem passar a valer ou sair do catálogo? O manual descreve o comportamento atual; se passarem a valer, os selos mudam.
- Lista de espera de eventos: a promoção manual é a intenção? O manual agora afirma que não anda sozinha.
- A pessoa contratada ou diretor nova deve ganhar "Solicitar viagem para si" no cadastro? Pendência anterior, sem resposta; o manual diz que não recebe sozinha.

### pessoal-saude

1. Defeito 1: o certo é restringir o "autor" a quem tem cadastro de profissional ativo? Hoje o manual avisa para o atendimento ser registrado por um profissional. Se o código mudar, o aviso "Quem registra o atendimento vira autor dele" precisa sair.
2. O CID do atestado vai na linha do movimento da folha e na planilha para a contabilidade (folha-movimento.ts:566-570). É desejado? O manual diz "O CID fica só no atestado" em atestados-aso e registrei o envio em movimento-folha. Dado sensível de saúde saindo para terceiro merece decisão.
3. Como um funcionário novo entra no Pessoal? Não achei criação de vínculo na ficha; "Nova pessoa" (Institucional → Usuários) cria a pessoa, mas não confirmei que abre o vínculo. O artigo Funcionários segue sem esse passo.
4. Férias: a tabela do saldo cita **Não autorizado**, mas nenhuma ação atual gera esse estado (Desfazer volta a Aguardando). Parece só dado antigo. Mantive a linha. Confirma? ferias/funcionario/[usuarioId]/page.tsx; src/lib/db/ferias.ts:773.
5. Anuênios: a progressão é mesmo automática? (arquivo intocável, não alterei).
6. Regra de 14 dias só é cobrada com 3 gozos ou com a soma fechando o descanso. Descrevi assim. É a regra pretendida?

### representacao-publicos

1. Reunião de colaboradores: deve ganhar tela de lançamento, ou o resultado fica mesmo só na ata? Escrevi o que existe hoje (só ata).
2. Votação offline: quem vota no papel não entra na participação do sistema, já que presença só se registra dentro do horário e com a urna aberta. Participação e voto único na híbrida ficam incompletos. Como orientar? O voto em separado offline também fica sem o código de envelope, que só o sistema gera.
3. Apurador em urna digital: a tela permite "Apurar urna" digital, com contagem manual. Isso soma à contagem automática? Não conferi a soma; não descrevi.
4. Selo "não confere" do hash: quem a entidade deve procurar? Escrevi "quem administra o sistema".
5. Validade do código nas assinaturas de contrato, cessão, RPA e férias: só afirmei a do ofício (10 min); a tela dos outros não mostra a duração.
6. Link de desistência: o único jeito de obter é pelo Ver como filiado. É isso mesmo, ou deveria estar na lista do processo?
7. Exemplo de cliente real em textos do sistema (ex.: mensagens de análise): retirei SLB, Baker e Halliburton do manual. Confirme que era o desejado.

**Cédula:** nada restou dizendo que a cédula não existe. A busca em fluxos-publicos e representacao não acha essa afirmação; a cédula online existe (`src/app/votar/[id]/page.tsx:267`) e a cédula em PDF também (`votacoes/cedula/[id]/route.ts`).
