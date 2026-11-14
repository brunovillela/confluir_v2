<!-- GERADO por scripts/gerar-notas-versao.mjs a partir de src/lib/novidades.ts. Não editar à mão: acrescente a entrada em novidades.ts (regra da ADR 0024) e rode `npm run produto:notas`. -->

# Notas de versão

O que mudou para quem usa o Confluir, da entrega mais recente para a mais antiga. É o mesmo conteúdo do aviso "O que há de novo" dentro do sistema. O detalhe técnico de cada entrega está no histórico do git; as decisões de arquitetura, em [`docs/arquitetura/adr/`](../arquitetura/adr/LEIA-ME.md).

## 14/11/2026 — Ordens de pagamento: busca por quem recebe

- Aquisição: compra cancelada pelo vendedor depois de feita. Na compra, "Compra cancelada pelo vendedor" registra se o dinheiro virou crédito para compras futuras ou foi devolvido, com valor, data e comprovante: a compra sai de Notas a receber e dos avisos de nota, ordens não pagas são canceladas e, nas pagas, o comprovante vira o documento da despesa. Os créditos ficam em "Créditos com fornecedores" (em Notas a receber) até serem marcados como usados.
- Comunicação → Aniversariantes → Do mês: os aniversariantes do mês inteiro numa lista só, por dia — filiados ativos e o quadro da entidade (diretores, funcionários, prestadores, aprendizes e estagiários). Quem é das duas coisas aparece uma vez, com os dois rótulos; dá para filtrar, buscar por nome e passar de mês.
- Ordens de pagamento: a busca agora acha a ordem pelo nome ou CPF/CNPJ de quem recebe — funcionário, diretor, filiado, empresa ou convidado —, com as palavras em qualquer ordem e sem acento. O filtro Favorecido também passa a listar quem não tem cadastro (marcado como "Sem cadastro").

## 10/11/2026 — Congressos: inscrição pelo link e importação de listas

- Aquisição: o comprador fica sabendo de cada solicitação nova. Aviso "Nova aquisição a cotar" (e-mail, Telegram ou celular, ligado em Meu perfil → Avisos), a fila na caixa de entrada do painel e no lembrete diário, o quadro "A cotar" na página de Aquisição e, na Área do comprador, há quantos dias cada solicitação espera.
- Jornadas de trabalho: segundo turno em cada dia, para o intervalo intrajornada (ex.: 08:00 às 12:00 e 13:00 às 17:00). A carga soma só os turnos, e o alerta de acesso fora do horário vale só antes da primeira entrada e depois da última saída. Cada jornada tem página própria, com o horário, quem a segue (incluir e mover) e a edição, que fecha ao salvar.
- Congressos e conferências: página pública de inscrição. A pessoa escolhe como vai participar e a base, a regra de vagas é aplicada na hora (confirmada ou lista de espera) e ela recebe um link pessoal para acompanhar a situação e o programa, sem criar conta.
- Congressos: link pessoal também para quem a comissão incluiu, com cópia ou envio por e-mail. Gerar um novo invalida o anterior.
- Congressos: importar participantes de uma planilha (Nome, CPF, Base, Condição…) ou de uma ata em PDF ou foto, lida pela IA. Tudo passa por conferência antes de gravar: novos, já no congresso e linhas com problema.
- Fornecedores: a chave Pix da conta agora vai com o tipo (CNPJ / CPF, Telefone, E-mail ou Chave aleatória) e é conferida pelo tipo ao salvar. Em conta antiga, o tipo provável já vem escolhido na edição.
- Fornecedores: arquivar uma conta bancária que não se usa mais. Ela sai das escolhas de pagamento, as ordens antigas continuam com ela, e dá para desarquivar.
- Fornecedores: excluir uma conta duplicada (mesma chave Pix ou mesma agência e conta de outra conta do fornecedor) passa as ordens dela para a outra conta. Conta usada em ordens e sem duplicada não é excluída, e a tela diz em quais ordens ela está.
- Aquisição: ao gerar a ordem de pagamento de uma compra, inclua uma observação (ex.: "50% do valor total, referente à antecipação do serviço"). Ela vai na descrição da ordem e aparece na lista, na autorização e no extrato.
- Viagens: a hospedagem diz se o quarto é Individual ou Coletivo e, no coletivo, com quem a pessoa prefere dividir — também no /viagem do Telegram. É uma indicação para a equipe de viagens, que monta os quartos; o pedido aparece na viagem e na exportação.
- Acesso: o link de criar ou redefinir senha não se perde mais quando é enviado pelo WhatsApp — ele só é usado quando a pessoa salva a senha. E acabou o "não foi possível confirmar que você não é um robô" ao ir da tela de entrada para "Esqueci minha senha".

## 09/11/2026 — Remessas do Pessoal mais fáceis de arrumar

- Pessoal: editar, salvar, cancelar, transferir ou abrir um registro e voltar não leva mais à página 1 nem ao topo. A lista continua na mesma página, com a mesma quantidade por página e os mesmos filtros, e a tela volta na linha da pessoa, destacada. Vale para ponto, contracheques, ASO, atestados e ausências, treinamentos, férias, níveis, anuênios, faltas, informes, diárias e reembolsos (no ponto, a edição abre logo abaixo da linha). Nas remessas de diárias, do Pessoal e da Diretoria, a diária aberta pela remessa volta para a remessa, na própria diária.
- Jornadas de trabalho: configure as jornadas da entidade uma vez e vincule os funcionários a elas, vários de uma vez. Mudou o horário? Altere a jornada e vale para todos os vinculados (Pessoal → Atribuições e SST → Jornadas de trabalho).
- Contracheques e ponto: transferir um contracheque ou um registro de ponto para outra remessa aberta, pelo botão Transferir na linha.
- Remessa vazia de contracheques ou de ponto pode ser excluída pelo botão no alto da remessa, mesmo finalizada.
- Aquisição: a proposta da cotação e o arquivo do contrato aceitam PDF de até 3,8 MB, e o arquivo maior é recusado na hora, com a explicação. Antes, um PDF grande derrubava a tela com "Algo deu errado".
- Recebimentos: descrição longa em até duas linhas, valor e Registrar chegada sempre à direita, e selo de atraso quando a previsão de entrega passou.
- Viagens: dá para pedir só hospedagem. No alto do formulário, em O que precisa, escolha Passagem, Passagem e hospedagem ou Só hospedagem; qualquer item também pode ser removido.
- Filiação → Controle de envio: registrar que uma empresa não tem valores a repassar (por exemplo, todos se desfiliaram), para o controle parar de cobrar a relação até o desconto voltar.
- Criar senha pelo link do e-mail: se a senha escolhida não for aceita, a tela diz o motivo e dá para tentar outra com o mesmo link, sem precisar pedir um novo.
- Senhas: um olho ao lado de todo campo de senha mostra o que foi digitado. Ao criar ou trocar a senha, a tela mostra o que ela precisa ter e marca cada item enquanto você digita.
- Votações → rodada → aba Aptos: baixar a relação dos aptos a votar em planilha ou PDF, com os filtros da tela (todos, já votou, não votou, busca e situação do link pessoal). A planilha traz contatos, se votou, quando, por qual canal e a situação do link.
- Oposição: o tempo mínimo do vídeo da campanha só conta com o vídeo tocando e é conferido na confirmação; a oposição registra quanto foi assistido. No cadastro da campanha, o tempo vai em minutos e segundos (3:20), com Usar a duração do vídeo.
- Representação Sindical → Congressos e conferências (novo): crie o congresso copiando a edição anterior ou a partir de um modelo, ajuste as regras do regimento na configuração (cada mudança vira uma versão, com o artigo de origem), defina papéis e direitos, bases com limite de delegados, eixos, grupos e sessões, e monte a lista de participantes. A diretoria entra como nata com um clique, e a ordem de inscrição confirma quem cabe em cada base e põe o restante na lista de espera.

## 08/11/2026 — Financeiro em dia, oposição pronta e contratos saudáveis

- Financeiro: "O que fazer hoje" no topo da área, e, no mesmo quadro, o fechamento do mês só com o que as filas não mostram, sem contar nada duas vezes; clicar num número abre a lista filtrada com exatamente aquelas ordens.
- Ordens de pagamento: distribuir vários comprovantes de uma vez (a IA lê e sugere a ordem de cada um), pagar pela própria conciliação do extrato, marcar Processando em lote, aviso de possível duplicidade na hora de pagar e alerta de vencimento distante demais (ano digitado errado). O comprovante só é cobrado de Pix, Pix QR Code e TED.
- Contratos → Saúde dos contratos: um medidor como o dos cadastros da filiação, apontando o que falta em cada contrato.
- Filiação → Controle de envio das relações de desconto: quadro por empresa e mês mostra quem mandou a relação, quem falta cobrar e as inclusões e exclusões a enviar ao RH.
- Ficha de filiação online começa pelo CPF, reconhece quem quer se refiliar e avisa quem parou no meio. O link da ficha fica no topo de Filiados.
- Filiados: mesclar dois cadastros lado a lado, escolhendo campo a campo e unindo contatos e vínculos.
- Oposição: carta assinada pelo próprio Confluir, passo a passo do Assinador gov.br com conferência antes do envio, atendimento por CPF ou e-mail, funil da campanha, lembretes em três marcos e "ver como o trabalhador".
- Ofícios: mais de um assinante, todos assinando ao mesmo tempo; saudação e fecho editáveis e prévia em PDF.
- Atas e deliberações: numeração anual automática, sigilo também no título e nos presentes, e exportação em planilha dentro do seu nível de sigilo.
- Contracheques: corrigir o líquido lido do PDF, aplicar linha a linha e marcar todos na conferência da folha.
- Agenda em calendário (mês, semana e dia): clique para criar e arraste para mudar o dia ou o horário.
- Tabelas salariais guardadas com vigência, e o nível editado direto da Carreira e da aba Funcionários.
- Viagens: permissão separada para pedir para si e para outras pessoas; quem viaja é avisado quando alguém pede por ele.
- Férias: o pagamento segue as Regras de férias da entidade, sem regra de lei fixa no aviso.
- Controle de acesso: o agente da recepção é pareado por código, com verificação da conexão.
- Formulários de "novo" passam a abrir por botão em mais de 20 telas, e os seletores de pessoa não perdem mais o valor gravado.
- Login: fim do falso "senha incorreta" quando o botão era clicado duas vezes.

## 02/11/2026 — RPA em ondas, Meu perfil e Telegram que resolve

- RPA: aviso antes de enviar, limite de RPAs por prestador no mês, link de assinatura na emissão com lembretes, comprovante enviado sozinho ao fornecedor, IRRF e teto do INSS pelo mês do pagamento, relatório mensal à contabilidade e retenções nas guias de Tributos.
- Ordens de pagamento: extrato como o do banco, com resumo por prazo no topo e marcar e pagar (remessa ou pagamento em lote).
- Telegram: resolver pendências pela conversa, /pendencias, menu de comandos, pedir passagem e hospedagem com /viagem e mandar comprovante por foto ou PDF.
- Meu perfil: layout mais compacto, contatos e ramais à vista, tempo de casa, aviso de contracheque lido e os próprios dados bancários, confirmados pelo Financeiro.
- Contracheques: importar a folha em PDF, separada por funcionário e com o líquido lido; conferência que alerta competência, variação e quem ficou de fora; liberar ou bloquear em massa e liberação automática numa data.
- Ponto: importar o relatório do relógio e apurar as horas pelas batidas; mudar uma remessa antiga pergunta se recalcula as seguintes.
- Filiados: atualizar cadastros por uma lista de trabalhadores lida pela IA, com desfazer; motivo da desfiliação em lote e por vínculo.
- Atas de reunião: deliberações como itens próprios, com responsável, prazo, lembrete, aviso de vencida na caixa de entrada, histórico e nível de sigilo por usuário.
- Atestado gera a ausência (Afastamento médico) e a mantém em dia; CATs sem conferência entram numa fila.
- Veículos: cobrança da locação por período com fatura e boleto (a IA lê a fatura da locadora), editar e prorrogar contrato, apontamentos do checklist e alertas no painel e no resumo diário.
- Processo de compra: comprovante de pagamento na ordem e envio ao fornecedor.
- Cessão de espaços: a equipe registra o pedido pelo painel, e faixas de horário livre não se sobrepõem.
- Abas e ordenação de colunas não levam mais ao topo da página.

## 28/10/2026 — Contas bancárias, oposição e reembolsos

- Financeiro → Contas bancárias: saúde das contas com juntar repetidas, corrigir, marcar como conferida, prioridade pelo dinheiro em jogo e as ordens que esperam conta. Uma conta por pessoa, compartilhada pelos papéis do mesmo CPF.
- Pedir dados bancários ao favorecido por um link de uso único. Ordem Pix ou TED só sai com a conta registrada, e a conta cadastrada completa as ordens abertas.
- Ficha do filiado: cartão Dados bancários (contas e Pix, com a principal).
- Oposição: integridade antes do processo grande, acesso sem link, avaliação em lote, relação ao empregador, dossiê, assinatura gov.br, decisões jurídicas por campanha e FAQ com aviso de privacidade.
- Reembolsos a filiados: sem teto mensal, por tipo, lançamento em lote, totais por tipo e exportação XLSX; o comprovante vira a nota fiscal da ordem.
- Custeio: cancelamento com motivo (com reflexo no Financeiro), situação Concluído, editar e excluir ordem e gerar novas ordens como no contrato.
- Ordem: reclassificar centro de custo, departamento e rateio até o fechamento do mês; mês fechado trava o pagamento.
- Ponto: horas em HH:MM, saldos automáticos, percentual de hora extra por entidade e isenção de registro com histórico.
- Votação: link pessoal pelo canal escolhido (e-mail pessoal ou Telegram), pré-cadastro no link geral, kit de divulgação, teste de entrega antecipado e alerta de link pessoal não usado.
- Financeiro → Tributos: guias previstas, lançamento da guia lido pela IA, guias a vencer na caixa de entrada e conferência nas ordens.
- Cartões de crédito de uso corporativo ou com responsável, e Meu cartão para quem tem um.
- Aviso de férias assinado eletronicamente pelo funcionário.
- Avatar (foto ou iniciais) de quem tem acesso ao sistema nas listas e telas onde a pessoa aparece.
- Formulários: uma recusa do servidor não apaga mais o que foi digitado.

## 19/10/2026 — Privacidade e integridade das votações

- Política de privacidade da entidade em /privacidade, com o encarregado (DPO) e o contato preenchidos em Institucional → Organização. As telas de acesso, a ficha de filiação, a votação, as inscrições e a oposição passam a mostrar o link para ela.
- Institucional → Auditoria ganhou as abas Exportações e API: quem baixou listas com dados pessoais (planilhas, PDFs, CNAB), quando e quantas linhas, e cada consulta feita pela API pública. A chave da API agora tem escopos por tipo de dado e não é aceita no endereço (?chave=).
- Institucional → LGPD: prazos de guarda dos dados. Todo mês o sistema simula o que sairia em cada regra (fotos de inscrição em eventos, registros de tentativas de acesso, fichas de filiação não concluídas); só apaga de verdade a regra que a entidade ligar. Pessoas em processo podem ser bloqueadas contra qualquer descarte.
- Pedidos de saúde feitos no portal chegam só à equipe de saúde, com aviso genérico, sem nome nem CPF.
- Votações: no encerramento, o resultado é congelado, ganha um código de conferência (SHA-256) publicado na apuração, no relatório e no portal, e a votação é conferida automaticamente. Reabrir a apuração exige motivo e fica no livro da apuração. Os contatos que os eleitores deixam para receber o link são apagados 90 dias após a apuração (prazo ajustável na rodada), e o voto em separado é desligado da pessoa ao encerrar.

## 18/10/2026 — Área do associado

- Filiados → Área do associado: habilite, suspenda ou desabilite cada parte do portal do associado — carteirinha, contribuição, hospedagem, convênios, saúde, votação, eventos, agenda, notícias, atendimento, O sindicato —, com uma mensagem ao associado e, se quiser, a data em que a parte volta sozinha. Suspensa, a parte fica para consulta e nada é enviado por ela; desabilitada, sai do menu, do Início, da ajuda e dos avisos.
- O portal inteiro também: em modo de consulta (o associado entra e vê tudo, mas nada é gravado) ou fora do ar (a entrada mostra a mensagem e os canais da entidade). A contribuição assistencial, a desistência da filiação coletiva, o link pessoal de voto e a verificação da carteirinha nunca param.
- Configure cada parte: o que o associado pode alterar em Meu cadastro, a declaração e o extrato em PDF, o prazo do Pix, os assuntos, os anexos e o prazo para reabrir do Atendimento, o resultado no histórico da Votação, o cancelamento de inscrição em eventos, a diretoria em O sindicato, o aviso da tela de entrada e os atalhos da barra do celular, entre outras. Tudo começa no comportamento de antes.
- Primeiro acesso: antes de usar o portal, o associado aceita o termo de privacidade em vigor e completa os dados que a entidade exige (e-mail, telefone, endereço, contato de emergência). Vale também para quem já usa o portal, no próximo acesso, e de novo quando um termo novo é publicado.
- Conferir como o associado vê: abre o portal de um filiado em somente leitura, com cada parte do jeito que ele a vê.

## 06/10/2026 — Conciliação bancária

- API e webhooks (Institucional): chaves de leitura para o contador, o Power BI e o site (filiados, arrecadação, despesas, agenda, eventos) e webhooks assinados que avisam outros sistemas quando uma ordem é paga, uma filiação é aprovada, um cupom é reservado ou uma contribuição Pix entra — com reenvio automático e log de entregas.
- Assinatura gov.br verificada: ao receber a ficha de filiação, a carta de oposição ou a minuta assinada em PDF, o sistema confere integridade, assinatura, cadeia ICP-Brasil, validade e o CPF do signatário contra o cadastro, e mostra o selo na avaliação.
- Filiados → Cobranças Pix: quem paga a contribuição por Pix recebe, todo mês, um QR Code e um código copia e cola no portal (Contribuição), com aviso; a baixa vem do extrato (identificador no histórico) ou da tela, e vira recebimento na remessa da competência.
- Financeiro → Remessas bancárias: cadastre a conta da entidade e gere o arquivo CNAB 240 (Pix por chave, crédito em conta, TED e boleto) com as ordens a pagar; o retorno do banco marca cada ordem paga ou rejeitada com o motivo.
- Financeiro → Conciliação bancária: importe o extrato em OFX ou CSV e cada lançamento é casado com a ordem paga ou com o depósito da fonte pagadora — sozinho quando há um único candidato, com um clique quando há mais. Crédito sem depósito vira o depósito da fonte na hora; tarifas e transferências internas podem ser ignoradas com o motivo.

## 05/10/2026 — Portal do associado no celular

- Carteirinha digital com QR Code verificável por qualquer portaria ou convênio, e declaração de filiação em PDF na hora.
- Minha contribuição: os descontos repassados mês a mês, a última contribuição e a situação da pessoa pela regra da entidade.
- Portal feito para o celular: barra de navegação inferior, página atual marcada e as tabelas viram cards em telas pequenas.
- Avisos no portal: sino do filiado e e-mail por preferência quando o hotel reserva o cupom, abre vaga na lista de espera, a inscrição é avaliada, o evento muda ou uma votação abre.
- Confluir no celular: instale como app (Adicionar à tela inicial), ligue "Receber no celular" em Meu perfil → Avisos e os avisos do sino chegam como notificação. Tela Aprovar com ordens, documentos e diárias em cards de um toque.
- Telegram com botões: a ordem que aguarda a sua autorização chega com Aprovar e Devolver na própria conversa, e /aprovar lista as ordens na sua alçada.
- Churn e retenção (Indicadores): saídas e entradas por mês, taxa por fonte pagadora, tempo médio de filiação e motivos de desfiliação em lista fechada, com registro do motivo na ficha.
- Custos consolidados (Indicadores): frota por veículo e por km, hospedagem por hotel, viagens e diárias por pessoa e por departamento.
- Exportação contábil (Financeiro): despesas pagas e receitas do período em XLSX, com centro de custo, departamento, favorecido e CNPJ/CPF.
- Home do diretor: o que espera a sua decisão, a agenda da semana, votações, negociações, os números da entidade e os seus pedidos de viagem e diária, em uma tela só.
- Atendimento pelo portal: o filiado abre solicitação (jurídico, saúde, cadastro, reembolso, reclamação, outro) com anexo e acompanha a resposta; no painel ela vira Demanda com prazo, e a equipe responde pela Demanda ou por Filiados → Atendimentos, com indicadores de tempo de resposta.

## 04/10/2026 — O painel passa a vir até você

- Caixa de entrada na home: tudo que espera a sua decisão, com contagem e atalho para cada fila. O contador ao lado do sino se atualiza sozinho.
- Avisos a quem precisa agir: pedido de férias, diária, reembolso, falta, ficha de filiação, espaço, viagem, ordem na sua alçada e fornecimento a receber chegam na hora, pelo sino, por e-mail e pelo Telegram. Lembrete diário do que ficou parado.
- Resumo diário de vencimentos: contratos, acordos, CNH, seguro, ASO, férias, treinamentos, faturas, ordens, mandatos e convênios vencendo nas áreas que você cuida.
- Meu perfil → Avisos: escolha, tipo a tipo, o que recebe por e-mail e por Telegram.
- Busca global com Ctrl+K: filiados, fornecedores, usuários, ordens, contratos, veículos e qualquer página do menu.
- Confirmações com contexto no lugar da caixa cinza do navegador; erros de formulário apontam o campo.
- "Minha área" no topo do menu lateral; menu de ajuda (?) no cabeçalho com o artigo desta tela, as novidades e um canal para relatar problemas ou sugerir.

## 03/10/2026 — Conta mais protegida

- Verificação em duas etapas com aplicativo autenticador, em Meu perfil → Segurança da conta.
- Confirmação "não sou um robô" no login e nos acessos públicos, e bloqueio temporário após tentativas erradas de senha.
- Trilha de auditoria: quem alterou o quê e quando, nas tabelas sensíveis (Institucional → Auditoria).
- LGPD: o filiado baixa os próprios dados no portal; a gestão atende pedidos de exclusão com anonimização.
- Arquivos enviados são conferidos pelo conteúdo, não só pelo nome.

---

Entregas anteriores a 05/10/2026 não têm nota de versão; ver o histórico do git e as fichas de módulo no manual (`src/conteudo/ajuda/`).
