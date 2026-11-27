# Representação, Eventos e telas públicas ligadas

Rotas conferidas: 100 page.tsx, mais rotas de PDF/planilha ligadas:
- Representação: 69
- Eventos no painel: 8
- /congresso: 10
- /votar: 4
- /mesario: 2
- /apurador: 2
- /urna, /relacao, /evento, /inscricao, /desistir: 1 cada

Artigos lidos:
- `ajuda/representacao/`: index, acordos, congressos, empregadores, filiacao-coletiva, negociacoes, oposicao, votacao-presencial, votacoes
- `ajuda/eventos/`: index, criar, inscricoes, convidados, dados-participantes, recepcao
- `ajuda/fluxos-publicos/`: index, votacao, congresso, evento, oposicao
- `portal/`: votacao, eventos, oposicao
- de apoio: `filiados/controle-envio`, `filiados/cadastros-pendentes`

Os artigos de oposição foram lidos na versão atual da pasta, que está em edição por outra sessão.

Os caminhos de evidência são relativos a `src/app/`, salvo quando começam por `src/`.

Também foram conferidos `docs/manual-auditoria-2026-11.md` e `docs/manual-entregas-2026-11-14.md`. O que já estava lá vem marcado "(já apontado)".

**Resumo:**
- O artigo **votacoes.mdx** (921 linhas) cobre bem o painel de votações, mas o "Ajuda desta tela" nunca leva a ele.
- **Congressos** tem só as Fases 1 e 2 no manual: as Fases 3 a 7 (dia do evento, relatoria, plenária, moções, encerramento) e o link pessoal do participante não aparecem.
- **Oposição** segue com as pendências conhecidas e outras novas.
- **Eventos** está bem coberto, mas a "Ajuda desta tela" de quase todas as rotas cai no índice.

---

## Telas sem nenhum artigo

Nenhuma rota fica sem destino no "Ajuda desta tela". As telas abaixo, porém, não têm **nenhum texto** no artigo para onde o botão leva.

| Rota | O que a tela faz | Artigo sugerido (novo ou existente) | Prioridade |
|---|---|---|---|
| /painel/representacao/congressos/[id]?aba=dia | Painel do dia: **Mesa de credenciamento**, **Presença na sessão**, **Lista de contingência**, **Crachás em lote para pré-impressão**; quadros Credenciamento, sessão atual, Quórum, Por base; trocas de titular por suplente com Desfazer | representacao/congressos-dia (novo) | P1 |
| /painel/representacao/congressos/[id]/credenciamento | Busca por nome/CPF/QR; documento com foto conferido; Participa (No local / A distância); Justificativa fora do prazo; **Credenciar e imprimir crachá**; **Segunda via do crachá** (pede motivo e invalida o anterior); Desfazer credenciamento com motivo; **Assumir** no lugar de titular, com "Autorizado por" | congressos-dia | P1 |
| /painel/representacao/congressos/[id]/porta | Presença na sessão: escolha da sessão, leitura contínua de crachás, Presente/Voltou, Registrar saída; funciona sem rede ("Sobe sozinho quando a rede voltar"); código da sala no telão | congressos-dia | P1 |
| /painel/representacao/congressos/[id]/sala/[sessaoId] | Telão com o QR da sala, que muda a cada N segundos, para a presença pelo link pessoal | congressos-dia | P2 |
| /painel/representacao/congressos/[id]/contingencia (PDF) | Lista de contingência por base (confirmados e espera), para o sistema fora do ar | congressos-dia | P2 |
| /painel/representacao/congressos/[id]?aba=relatoria | Propostas por situação; **Colar propostas** (caderno de teses); **Aplicar a votação dos grupos**; **Buscar propostas da etapa anterior**; grupos com Relatoria/Novas/Apontamentos/Relatório (Entregue/Em andamento); Registrar função | representacao/congressos-relatoria (novo) | P1 |
| /painel/representacao/congressos/[id]/grupos/[grupoId] | **Nova proposta do grupo**; **Apontar** (Acréscimo/Alteração/Supressão); Apontamentos gerais; **Salvar votação**; **Entregar o relatório do grupo** (trava o grupo); Retirar apontamento; **Sugerir síntese** (IA) | congressos-relatoria | P1 |
| /painel/representacao/congressos/[id]/consolidacao | Filtros Eixo/Grupo/Situação; **Fundir** ("Criar a proposta fundida", Desfazer a fusão); **Enviar à plenária** (Consenso/Debate); **Só aos anais**; Retirar; Mover para o eixo; Texto consolidado; aviso "Acima da cota de saída do regimento" | congressos-relatoria | P1 |
| /painel/representacao/congressos/[id]/propostas/[propostaId] | Rastro: Versões do texto, Nos grupos, Apontamentos, Nasceu da fusão de, Plenária | congressos-relatoria | P3 |
| /painel/representacao/congressos/[id]/assistente | Assistente da relatoria (IA): Ler o caderno de teses, Procurar parecidas para fundir, Comparar grupos, Eixo/abrangência/competência, Aceitar/Recusar, "Quanto a IA ajudou neste congresso" | congressos-relatoria | P2 |
| /painel/representacao/congressos/[id]/plenaria | Mesa da plenária: bloco de consenso (**Votar o bloco**, **Destaque**, "Quem pediu o destaque?"); resultado por proposta (Aprovada sem oposição, crachá, Contar/Lançar contagem); moções habilitadas; Já votadas com Desfazer; Proposta nova em plenária | representacao/congressos-plenaria (novo) | P1 |
| /painel/representacao/congressos/[id]/plenaria/ao-vivo | Fila de fala (Quem pede a palavra, Tipo de fala, Com a palavra, cronômetro, Encerrar/Reabrir inscrições, Nova rodada); votação eletrônica (A favor · Contra · Abstenção, Priorização, Secreta/Aberta nominal, **Abrir a votação**, **Encerrar e apurar**, Cancelar) | congressos-plenaria | P1 |
| /painel/representacao/congressos/[id]/plenaria/estacao | Estação de voto na mesa para quem não tem celular (identifica pelo crachá) | congressos-plenaria | P1 |
| /painel/representacao/congressos/[id]/telao | Telão: quem fala, cronômetro, fila, votação e resultado | congressos-plenaria | P2 |
| /painel/representacao/congressos/[id]?aba=mocoes | Lista de moções, com situação e assinaturas até o mínimo; Registrar moção | representacao/congressos-mocoes (novo) | P1 |
| /painel/representacao/congressos/[id]/mocoes/[mocaoId] | Lançar assinatura (Ler o crachá / Lançar do papel / Estação da mesa); QR para assinar; **Protocolar** (grava o limiar, encerra a coleta); Habilitar/Não habilitar com motivo; Retirar; **Alterar a moção** (com assinaturas, cria versão nova e as assinaturas precisam ser refeitas); Trilha; PDF | congressos-mocoes | P1 |
| /painel/representacao/congressos/[id]?aba=encerramento | **Encerrar o congresso** (gera resoluções, libera relatório, certificados e página pública); Reabrir; Relatório final (PDF); Caderno de resoluções (PDF); página pública; Indicadores; Participação por base | representacao/congressos-encerramento (novo) | P1 |
| /painel/representacao/congressos/[id]/resolucoes | Gerar do que foi aprovado; Registrar resolução; Responsável/Prazo/Situação/Prazo vencido; Marcar como reservada / Tornar pública; **Revogar** com motivo; Destino Negociação; **Gerar ofício**; Levar à etapa seguinte | congressos-encerramento | P1 |
| /painel/representacao/congressos/[id]/eleicao | Inscrever chapa (Titular/Suplente); Lançar os votos; **Apurar** / **Desfazer a apuração** (apaga votos e eleitos); Impugnar; Homologar; Levar à etapa seguinte | congressos-encerramento | P1 |
| /painel/representacao/congressos/[id]/certificados | Quem tem direito (credenciado com frequência mínima); **Emitir os certificados**; código; revogação | congressos-encerramento | P2 |
| /painel/representacao/congressos/[id]/entidades | **Gerar link da entidade** / Gerar link novo / Copiar o link; indicados; assinatura ("Falta assinar", "Lista mudou: assinar de novo"); taxa (**Registrar pagamento**, Desfazer pagamento); ficha em PDF | representacao/congressos (nova seção) | P1 |
| /painel/representacao/congressos/[id]/creche | Crianças inscritas: Responsável, Criança, Cuidados, Também busca, Situação na creche | representacao/congressos (nova seção) | P2 |
| /congresso/entidade/[token] | Página pública da entidade: indicar pessoas (Participa como…), assinatura do representante legal (Nome do representante, Cargo na entidade), **Assinar a indicação**; "A indicação só vale depois da assinatura" | fluxos-publicos/congresso (nova seção) | P1 |
| /congresso/eu/[token]/plenaria | Pedir a palavra, votar (secreto ou nominal), Código da sala | fluxos-publicos/congresso | P1 |
| /congresso/eu/[token]/grupo/[grupoId] | Relatoria do grupo pelo celular (para quem tem a função) | fluxos-publicos/congresso | P2 |
| /congresso/eu/[token]/mocoes/nova | Apresentar moção pelo link pessoal | fluxos-publicos/congresso | P2 |
| /congresso/eu/[token]/mocao/[codigo] | "Ler o código da sala e assinar"; **Retirar a minha assinatura**; em "A sua moção": QR para colher assinaturas e Alterar o texto | fluxos-publicos/congresso | P1 |
| /congresso/mocao/[codigo] | QR público da moção: Ler e assinar (abre com o link pessoal) | fluxos-publicos/congresso | P3 |
| /congresso/eu/[token]/resolucoes e /congresso/[slug]/resolucoes | Resoluções gerais e Moções aprovadas; "Ler as resoluções aprovadas" | fluxos-publicos/congresso | P3 |
| /painel/representacao/oposicao/atendimento | Busca por CPF ou e-mail. Mostra a situação do cadastro, a conta e o último acesso, a origem de cada e-mail e o "Código pendente (não usado)". Mostra também o "Pedido pela oposição, ainda não conferido", os envios da Brevo em 30 dias e a orientação pronta (já apontado em manual-entregas, pendência da outra sessão) | representacao/oposicao (seção "Atendimento") | P1 |

As evidências dos congressos estão em:
- `painel/representacao/congressos/[id]/page.tsx:71-84`: 10 abas; o artigo lista 6, em `congressos.mdx:52-61`.
- `src/lib/congressos/config.ts:376-694`.
- `congresso/eu/[token]/page.tsx:65,152,162-185,207,229`.

As da oposição estão em `painel/representacao/oposicao/atendimento/page.tsx:51-63,109-116,187-203`.

---

## Lacunas em telas que têm artigo

### Votações (painel)

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/representacao/votacoes/assembleias/[id]?aba=apuracao | **Encerrar apuração** (cartão "Resultado e fechamento") | defasado | O manual diz que a contagem da urna física só entra após **Concluir apuração da urna**. O código soma toda contagem salva, concluída ou não. O encerramento não confere se cada urna física foi concluída, e o painel não mostra a situação da apuração por urna. Dá para encerrar, liberar o resultado e avisar os votantes com urna por contar. É preciso mandar conferir com os apuradores antes. | votacoes (Encerrar e reabrir; Apurador), votacao-presencial (5) | P1 | src/lib/db/assembleias.ts:2507-2545, 2605-2646; votacoes.mdx:776-779; votacao-presencial.mdx:202-206 |
| idem | Contagem por pergunta | parcial | Só a contagem de urna **física** entra. O que o apurador lança em urna **digital** é ignorado. Isso responde à dúvida 3 da auditoria anterior. | votacoes › Apurador | P2 | src/lib/db/assembleias.ts:2512-2517 |
| idem | **Encerrar apuração** sem confirmação | parcial | O botão não abre diálogo. No mesmo clique ele congela o resultado, libera ao filiado e agenda o e-mail do resultado. | votacoes › Encerrar e reabrir | P2 | painel/representacao/votacoes/apuracao/[id]/apuracao-form.tsx:110-116; src/lib/db/assembleias.ts:2716-2717 |
| idem | Voto em separado "cadastrado, não chegou a votar" | ausente | O que fazer com esse estado. Ele aparece com Deferir/Indeferir, mas não trava o encerramento (já apontado, defeito 3). | votacoes › Voto em separado | P3 | apuracao/[id]/emseparado-validacao.tsx:56 |
| /painel/representacao/votacoes/campanhas/[id] e rodadas/[id] | Excluir campanha ou rodada (não existe) | ausente | Não há exclusão. Falta dizer o caminho para algo criado por engano: renomear, finalizar e não cadastrar assembleia. | votacoes › Montar uma votação | P2 | votacoes/campanhas/actions.ts; votacoes/rodadas/[id]/actions.ts |
| /painel/representacao/votacoes/campanhas/[id] | Campanha finalizada | parcial | Só muda o selo e os filtros; não trava rodada, assembleia nem voto. | votacoes › Nova campanha | P3 | campanhas/campanha-form.tsx:196-211 |
| /painel/representacao/votacoes/rodadas/[id] | Cadastro de assembleia bloqueado após o período | ausente | Terminada a rodada, não se cria nem se edita assembleia. O caminho é estender o término em Dados da rodada. | votacoes › O que trava | P3 | rodadas/[id]/page.tsx:169-173 |
| rodadas/[id]?aba=divulgacao | Vídeo indicativo (URL) | parcial | O manual diz que a rodada "anexa" o vídeo; na verdade é um link. | votacoes:116-118 | P3 | rodadas/[id]/rodada-form.tsx:149-158 |
| rodadas/[id] (edição da assembleia) | Edital (PDF) e Ata (PDF) da assembleia | ausente | Edital próprio da assembleia e segundo caminho para subir a ata. | votacoes › Montar | P3 | rodadas/[id]/assembleias-rodada.tsx:454-473 |
| rodadas/[id]?aba=perguntas | Editar pergunta; "Texto da opção de resposta"; X que exclui opção | parcial | Faltam o lápis, a inclusão de opção uma a uma e a exclusão (com confirmação). | votacoes › Perguntas | P3 | rodadas/[id]/perguntas.tsx:126-136,181,195,277-323 |
| rodadas/[id]?aba=aptos | Lixeira da linha ("Remover este apto da lista?"; "Já votou — não pode ser removido") | ausente | O manual só fala da exclusão em massa. | votacoes › Excluir vários aptos | P3 | rodadas/[id]/aptos.tsx:328-349 |
| idem | Ler lista com IA (limite) | parcial | O manual diz 25 MB; para foto o limite é 20 MB. | votacoes:181-188 | P3 | rodadas/[id]/aptos-ia.tsx:76-78 |
| idem | CPF em conflito / Conferir cadastro | parcial | O manual diz "resolva com o eleitor". Falta dizer que a divergência abre caso em Filiados › Cadastros pendentes › Divergências das votações, com link cruzado. | votacoes › Quando o cadastro não confere | P2 | src/lib/db/votacao-divergencias.ts; src/conteudo/ajuda/filiados/cadastros-pendentes.mdx:52-79 |
| rodadas/[id]?aba=divulgacao | "Apagar [N dias] depois do encerramento da apuração" | parcial | O manual dá só 90 dias. As opções são 30/60/90/180/365, e o cartão mostra a data prevista e depois "Contatos apagados em…". | votacoes:705-711 | P3 | rodadas/[id]/guarda-contatos.tsx:40-72 |
| rodadas/[id], campanhas/[id] | Selos da rodada: Sem assembleia, Agendada, Em votação, A apurar, Apurada | ausente | Explicar os selos da rodada; hoje o manual só explica os da assembleia. | votacoes › O que trava | P3 | src/lib/db/votacao-panorama.ts:24-30 |
| /painel/representacao/votacoes/fontes/[id] | Ordem Recentes/Tema; card "Rodadas antigas que não foram ligadas a nenhuma campanha" | parcial | Faltam a ordenação e o card. | votacoes › Fonte pagadora | P3 | fontes/[id]/page.tsx:224-230,263 |
| assembleias/[id]?aba=urnas | Mesário ativo / Apurador ativo / Urna ativa | parcial | Os erros comuns mandam ver se o cadastro está "ativo", sem dizer onde. Também falta dizer o efeito da urna inativa. | votacoes, votacao-presencial › Erros comuns | P3 | votacoes/urnas/[id]/urnas-mesarios.tsx:226,708,891 |
| idem | Lixeira de urna, mesário e apurador; editar tipo/horário da urna | ausente | Não há trava depois da abertura. Falta pelo menos o aviso para não mexer com a votação em curso. | votacoes › Presencial com urnas | P2 | urnas/[id]/urnas-mesarios.tsx:209,303,691,874; src/lib/db/votacao-mesarios.ts:263-301 |

### Votação pública (/votar, /mesario, /apurador, /urna)

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /apurador/urna/[id] | **Concluir apuração da urna**, separado de **Salvar contagem** | parcial | Concluir usa só a última contagem **salva**, não o que está digitado, e não exige que exista uma. Quem conclui sem salvar fecha a urna com números vazios ou velhos, sem volta. | votacao-presencial (5; Erros comuns), votacoes › Apurador | P1 | apurador/urna/[id]/apuracao.tsx:204-224; src/lib/db/votacao-apuracao.ts:484-503 |
| /mesario/urna/[id] | **Registrar presença** | ausente | Um clique, sem confirmação nem desfazer: gasta o voto único da pessoa na rodada e, na urna digital, abre a cédula no terminal. Mandar conferir nome e CPF e dizer o que fazer se errar (anomalia + secretaria). | votacao-presencial (4) | P1 | mesario/urna/[id]/operacao.tsx:494-511; src/lib/db/votacao-mesarios.ts:1018-1105 |
| /urna, /mesario/urna/[id] | "O terminal ainda está com outra cédula liberada. Aguarde o voto." | parcial | Nenhuma tela cancela a cédula aberta. Se o eleitor sai sem votar, a urna digital trava. Falta a orientação. | votacao-presencial (Parear o terminal; Erros comuns) | P1 | src/lib/db/votacao-mesarios.ts:1059-1066,1633-1638; urna/terminal.tsx:122-158 |
| /mesario/urna/[id] | Quadro **Parear terminal de votação** (some após parear) | ausente | Se o terminal travar ou tiver o navegador limpo, não há onde parear de novo. Falta dizer como trocar o terminal. | votacao-presencial | P2 | mesario/urna/[id]/page.tsx:104-114; urna/constantes.ts:2 |
| /mesario/urna/[id] | **Encerrar** (só com a urna aberta no dia) | parcial | Depois de **Fechar o dia** no último dia, encerrar exige nova abertura com um eleitor. | votacao-presencial (Encerramento) | P2 | mesario/urna/[id]/operacao.tsx:97-138 |
| /mesario/urna/[id] | Abertura do dia | ausente | A abertura vale até a meia-noite. Na virada, a urna volta a fechada sem ata de fechamento. | votacao-presencial (Fechamento do dia) | P2 | src/lib/db/votacao-mesarios.ts:773-776 |
| /mesario/urna/[id] | "Voto em separado cadastrado — siga o procedimento" + **Cadastrar outro** | parcial | O código do envelope aparece uma vez só. Mandar anotar antes de seguir. | votacao-presencial (Voto em separado) | P2 | mesario/urna/[id]/operacao.tsx:331-362 |
| /votar/[id], /urna | "Escolha uma opção nesta pergunta para continuar." / "Responda todas as perguntas para confirmar o voto." | ausente | Todas as perguntas são obrigatórias, sem branco ou nulo online. Para abstenção, é preciso cadastrar a opção. | votacoes (Perguntas), votacao-presencial | P2 | portal/votacao/[id]/cedula-form.tsx:200; src/lib/db/votacao-mesarios.ts:1328 |
| /votar/[id] | **Revisar e votar** → **Confirmar seu voto** (**Voltar e alterar** / **Confirmar voto**) | parcial | Faltam o passo de revisão e o aviso de que o voto não muda depois. | fluxos-publicos/votacao (Caminho 1) | P2 | portal/votacao/[id]/cedula-form.tsx:223-250 |
| /votar/[id] | "Você não está apto a votar nesta assembleia, ou a votação não está aberta." | ausente | Causas e o que fazer. | fluxos-publicos/votacao (Erros comuns) | P2 | votar/[id]/page.tsx:214-221 |
| /votar | "Seu nome ainda não foi encontrado na lista desta votação." / "Você não está habilitado a votar nesta votação." | ausente | O que cada estado significa e o que fazer. | fluxos-publicos/votacao | P2 | votar/page.tsx:281,290 |
| /votar | Cartão **Falta alguma votação?** | ausente | Quem já foi achado numa votação repete **Confirmar meus dados** para outra. | fluxos-publicos/votacao (Caminho 3) | P2 | votar/page.tsx:134-150 |
| /votar | "Este cadastro está bloqueado para conferência. Procure o sindicato." | parcial | Mensagem de bloqueio (por exemplo, depois de "Não sou eu"). | fluxos-publicos/votacao | P2 | src/lib/db/votacao-link-unico.ts:363,377 |
| /apurador/urna/[id] | **Apurar urna** em urna digital | parcial (já apontado, dúvida 3) | A contagem manual de urna digital não soma, porque é ignorada (ver Votações). | votacao-presencial | P2 | src/lib/db/assembleias.ts:2517 |
| /votar | "Não encontramos você na lista de aptos…" | parcial | Essa recusa conta para a trava de 5 tentativas. | fluxos-publicos/votacao | P3 | src/lib/db/votacao-link-unico.ts:308-311; votar/actions.ts:196-209 |
| /votar | Somente filiados com a votação do portal suspensa | ausente | "vote pelo link pessoal enviado ao seu e-mail". | fluxos-publicos/votacao | P3 | votar/page.tsx:254-259 |
| /votar | **Sair** | ausente | Encerra a sessão (computador compartilhado). | fluxos-publicos/votacao | P3 | votar/page.tsx:127-132 |
| /votar | Telegram: "A confirmação expirou…", "Conversa aberta — falta compartilhar o número." | parcial | Faltam a expiração e o estado intermediário. | fluxos-publicos/votacao | P3 | votar/entrar-form.tsx:96-98,130-132 |
| /votar | **Sim, usar …** / **Não, está certo** | parcial | Os botões da sugestão de domínio. | fluxos-publicos/votacao | P3 | votar/entrar-form.tsx:258-279 |
| /votar/[id] | "Esta assembleia é só presencial…" | ausente | Caso de quem abre o link de uma assembleia presencial. | fluxos-publicos/votacao | P3 | votar/[id]/page.tsx:222-231 |
| /votar/[id] | "Você ainda não pode votar nesta assembleia." (carência) | ausente | Só o portal explica a carência. | fluxos-publicos/votacao | P3 | votar/[id]/page.tsx:247-255 |
| /votar/[id] | "A cédula desta assembleia ainda não tem perguntas." | ausente | Sinal de erro de montagem para a equipe. | votacoes (Erros comuns) | P3 | votar/[id]/page.tsx:260-265 |
| /votar/[id] | "O acesso é temporário…", **Ver todas as votações** | ausente | O link volta ao link único. | fluxos-publicos/votacao | P3 | votar/[id]/page.tsx:40-47 |
| /votar/[id] | "Não é o seu CPF que está nesta lista?…" | parcial | O que fazer quando o CPF da lista é de outra pessoa. | fluxos-publicos/votacao | P3 | votar/[id]/confirmar-cpf-form.tsx:62-65 |
| /votar/recebi | "O endereço veio incompleto…" e outros erros | ausente | O manual só descreve o caminho feliz. | fluxos-publicos/votacao (Aviso prévio) | P3 | votar/recebi/page.tsx:60-80 |
| /mesario, /apurador | "…não está cadastrada como mesário (apurador) em nenhuma rodada ativa." / "Este e-mail não está cadastrado…" | parcial | Faltam a rodada inativa e as mensagens. | votacao-presencial (Erros comuns) | P3 | mesario/page.tsx:63-67; mesario/actions.ts:37; apurador/page.tsx:62-66; apurador/actions.ts:34 |
| /mesario | Lista de urnas ("x de y compareceram", "terminal pareado") | parcial | O mesário vê todas as urnas das suas rodadas, sem atribuição por urna, ao contrário do apurador. | votacao-presencial (3. Papéis) | P3 | mesario/page.tsx:103-166 |
| /mesario/urna/[id] | **Buscar** (lista limitada a 50) | ausente | Sem busca, só aparecem 50 nomes. | votacao-presencial | P3 | src/lib/db/votacao-mesarios.ts (~623, .limit(50)) |
| /mesario/urna/[id] | "Este CPF já votou nesta rodada." | parcial | Falta em Erros comuns: na híbrida, quem votou online é barrado na urna. | votacao-presencial | P3 | src/lib/db/votacao-mesarios.ts:1042,1103 |
| /mesario/urna/[id] | "Este terminal já está pareado a outra urna." / "Código não encontrado…" | ausente | Erros do pareamento. | votacao-presencial | P3 | src/lib/db/votacao-mesarios.ts:716-718 |
| /urna | **Aguardando o próximo eleitor**, **Terminal encerrado**, nome do eleitor no topo | parcial | Estados do terminal. | votacao-presencial | P3 | urna/terminal.tsx:122-178 |

### Congressos (telas já cobertas)

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/representacao/congressos/[id]?aba=configuracao | Link "Mostrar também local da decisão, moções, divulgação e encerramento" e selo "Registrada; aplicada nas próximas etapas do módulo" | defasado | O artigo diz que essas seções "só registram a regra". Hoje só Local da decisão está marcada assim, e as regras dela já valem. O erro comum "Mudei a seção de credenciamento e nada aconteceu" está errado. | congressos | P1 | painel/representacao/congressos/formularios.tsx:450,514; src/lib/congressos/config.ts:81-97; congressos.mdx:110-113,323-324 |
| idem | Seções Credenciamento, Presença e quórum, Propostas, Apreciação nos grupos, Plenária, Moções, Eleição da delegação, Divulgação, Encerramento | ausente | Regras que mudam o funcionamento: prazos de credenciamento e "Depois do prazo"; "Suplente assume"; "Quem autoriza a troca"; "Exige documento com foto"; "Segunda via do crachá"; "Quórum de instalação"; "Frequência mínima para certificado"; "Maioria para aprovar"; "Forma de votar"; "Votação eletrônica"; "Como a moção chega à plenária"; eleição; "Resoluções públicas". | congressos | P1 | src/lib/congressos/config.ts:376-694 |
| idem | "Taxa de inscrição", "Valor da taxa", "Credenciar só com a taxa da entidade paga", "Se a conferência falhar", "Quem paga as despesas" | ausente | Com Bloqueia, o credenciamento é recusado se a taxa da entidade estiver pendente. | congressos | P1 | config.ts:298-323; src/lib/db/congressos-dia.ts:311-315 |
| /painel/representacao/congressos/[id] | Abas **Dia do evento**, **Relatoria**, **Moções**, **Encerramento** | ausente | A tabela do artigo tem 6 abas e a tela tem 10. | congressos | P1 | [id]/page.tsx:71-84; congressos.mdx:52-61 |
| [id] (Dados do congresso) | Situação "Encerrado" × **Encerrar o congresso** | parcial | Pôr Encerrado à mão não gera resoluções nem certificados. É preciso usar o botão da aba Encerramento. | congressos | P1 | congressos/encerramento-componentes.tsx:84; src/lib/db/congressos-encerramento.ts:841-850 |
| /congresso/eu/[token] | "QR para a mesa de credenciamento" | ausente | Mostrar na mesa para ser achado sem digitar. | fluxos-publicos/congresso | P1 | congresso/eu/[token]/page.tsx:65 |
| idem | "Presença nas sessões" / "Registrar presença na sala" | ausente | Ler o código do telão, que muda a cada poucos segundos. | fluxos-publicos/congresso | P1 | page.tsx:229; presenca-sala.tsx:36 |
| idem | "Plenária: votar e pedir a palavra" | ausente | Votar pelo celular; voto secreto × nominal. | fluxos-publicos/congresso | P1 | page.tsx:152; painel/representacao/congressos/ao-vivo-componentes.tsx:626 |
| idem | "Apresentar moção", "Ler QR de moção", "Ler e assinar" | ausente | Apresentar, assinar, retirar assinatura. A assinatura grava o texto lido. | fluxos-publicos/congresso | P1 | mocoes-do-link.tsx:36,48; congresso/mocao/[codigo]/assinar-mocao.tsx:69,95 |
| idem config | "Creche para os filhos dos participantes" (idades, vagas) | ausente | Como ligar a creche; a criança é inscrita pelo link do responsável. | congressos | P2 | config.ts:349-352 |
| idem config | Card "Preencher pelo regimento" (IA) | ausente | Enviar o regimento, conferir item a item, Aplicar o marcado. Com o regimento aprovado, a tela pede deliberação. | congressos | P2 | [id]/page.tsx:522; ia-componentes.tsx |
| /painel/representacao/congressos | Permissões "— mesa de credenciamento, porta e quórum" e "— relatoria, consolidação e mesa da plenária" | ausente | O artigo só cita consultar e configurar. | congressos | P2 | src/lib/permissoes-catalogo.ts:165-166; [id]/page.tsx:96-99 |
| [id]?aba=delegacao | Botões "Entidades: link, assinatura e taxa" e "Creche" | ausente | Onde ficam e para que servem. | congressos | P2 | [id]/page.tsx:601,605 |
| /congresso/eu/[token] | "Relatoria" | ausente | Coordenação e relatoria operam o grupo pelo celular. | fluxos-publicos/congresso | P2 | page.tsx:207 |
| idem | "Creche" / "Inscrever criança" | ausente | Só para confirmados; respeita idade e vagas. | fluxos-publicos/congresso | P2 | page.tsx:176-185 |
| idem | "Meu certificado (PDF)", "Resoluções aprovadas" | ausente | Aparecem depois do encerramento, para quem cumpriu a frequência. | fluxos-publicos/congresso | P2 | page.tsx:162-170 |
| /congresso/** | Tabela "Os dois endereços" | defasado | Faltam /congresso/entidade/…, /congresso/mocao/… e …/resolucoes. | fluxos-publicos/congresso | P2 | fluxos-publicos/congresso.mdx:7-12 |

### Oposição e filiação coletiva

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/representacao/oposicao/[id] (Editar) | Situação (Rascunho / Aberta / Encerrada) | ausente | Como abrir a campanha (Aberta exige início e fim do prazo). Ela **não encerra sozinha** no fim do prazo, e reabrir uma encerrada fica na trilha. | representacao/oposicao | P1 | painel/representacao/oposicao/oposicao-forms.tsx:116-128; src/lib/db/oposicao.ts:522-534 |
| idem | Formalização: "Só confirmação na tela" / "Confirmação + carta assinada" / "Híbrido (filiado só confirma; não filiado assina a carta)" | ausente | O efeito de cada modo e a combinação com "Prova exigida do não filiado". | representacao/oposicao | P1 | oposicao-forms.tsx:131-143; src/lib/oposicao-constantes.ts:8-10,217-223 |
| /painel/representacao/oposicao/[id]/opositor/[opositorId] | **Pedir nova carta** + "Escolher um motivo pronto…" | ausente (já apontado) | A diferença para Reprovar: volta a "Aguardando documento" e o motivo segue por e-mail. Os motivos prontos são editáveis. | representacao/oposicao | P1 | oposicao-forms.tsx:321,356-366,387-410 |
| idem | Requisitos da "Avaliação da Filiação" + "Conferi o documento assinado e aprovo mesmo assim" | parcial | Os itens do checklist e a confirmação que fica na trilha. | representacao/oposicao | P1 | opositor/[opositorId]/page.tsx:222-287; oposicao-forms.tsx:322-331 |
| /painel/representacao/oposicao/[id] | Carta não enviada no prazo › "Encerrar as N sem carta" | parcial | Todas viram **Reprovadas** ("carta não enviada"), cada pessoa recebe aviso e **não há volta**. Só aparece depois do prazo. | representacao/oposicao | P1 | gestao-forms.tsx:299-327; [id]/page.tsx:307-321 |
| /painel/representacao/oposicao/[id]/empregadores | Relação por empregador · PDF · Planilha · **Registrar envio** (Meio, Referência, Observação) | parcial | Só entram as aprovadas. Faltam os selos "Nunca enviada", "N nova(s) desde o último envio", "Relação enviada em dia" e "enviada(s) que deixaram de estar aprovadas", e os meios. Registrar envio pede a permissão de configurar. | representacao/oposicao | P1 | [id]/empregadores/page.tsx:52-58,85-101,121-123; gestao-forms.tsx:335-406 |
| /painel/representacao/filiacao-coletiva/[id] | Reverter o processo (REVERTER + "Sua senha de acesso") | defasado | O artigo diz que as filiações criadas são "excluídas". Na verdade, ficam "Excluído(a) do quadro associativo" e os vínculos novos se apagam. Reverter vale **mesmo depois do prazo** (com gente já Ativa ou que desistiu), e a empresa não é avisada. | representacao/filiacao-coletiva | P1 | src/lib/db/filiacao-coletiva.ts:818-870; [id]/page.tsx:303-319 |
| opositor/[opositorId] | Aprovar/Reprovar numa oposição já decidida | ausente | Dá para decidir de novo, e o trabalhador é avisado. Se ela já foi à empresa, aparece o selo de enviadas que deixaram de estar aprovadas. | representacao/oposicao | P2 | opositor/[opositorId]/page.tsx:53; [id]/empregadores/page.tsx:98-101 |
| /painel/representacao/oposicao/[id] | Avaliar em lote ("marcadas nesta página" / "todas as não avaliadas deste filtro") | parcial | Só as não avaliadas mudam. As que têm pendência ficam em "Ficaram de fora por pendência". O motivo é único para todas. | representacao/oposicao | P2 | gestao-forms.tsx:103-170,185-200 |
| /painel/representacao/oposicao/[id]/funil | "Do começo à decisão", "De onde vieram", "Por empresa" | parcial (já apontado) | Faltam as etapas, a tabela por empresa, os que "optaram por não se opor" e onde fica o botão Funil. | representacao/oposicao | P2 | [id]/funil/page.tsx:30-56,69-117; [id]/page.tsx:149-153 |
| /painel/representacao/oposicao/[id] | Situações: Aguardando documento, Não avaliada, Aprovada, Reprovada, **Desistente**; "Todas (sem desistentes)" | parcial | O que é cada uma. Desistente vem de "Não quero me opor". | representacao/oposicao, portal/oposicao | P2 | src/lib/oposicao-constantes.ts:36-40; [id]/page.tsx:290-305,333,362 |
| /painel/representacao/oposicao/decisoes | Salvar decisões | parcial | O padrão só vale para campanhas que o seguem e ainda não foram abertas. | representacao/oposicao | P2 | painel/representacao/oposicao/actions.ts:128 |
| /painel/representacao/oposicao/[id] | "Pronta para abrir?" / "Conferência da campanha aberta" | parcial | Itens e níveis (ok, atenção, impede). Só decisões e prazo impedem; sem fonte, a campanha alcança todos. | representacao/oposicao | P2 | src/lib/oposicao-prontidao.ts:43-125 |
| opositor/[opositorId] | Reverificar assinatura · "Conferir o certificado …" · Abrir o PDF assinado · Carta registrada | ausente | Quando reverificar (gov.br/e-CPF) e o que mostra Carta registrada. | representacao/oposicao | P2 | opositor/[opositorId]/page.tsx:150-209 |
| /painel/representacao/oposicao/[id]/divulgacao | "Avisar os filiados pelo sistema" · "Baixar o QR code (PNG)" · "A campanha ainda não está recebendo oposições" | parcial | Os filiados já veem o aviso no portal. A mensagem pede a permissão Mensagens aos filiados, e o link só funciona com a campanha aberta. | representacao/oposicao | P2 | [id]/divulgacao/page.tsx:67-74,96-101,138-157 |
| /portal/oposicao (fora do portal) | "**Sou filiado** … ou **Não sou filiado**" | defasado | Desde 22/11 a entrada é pelo CPF, com o botão "Trocar CPF". | portal/oposicao | P2 | src/conteudo/portal/oposicao/index.mdx (Fora do portal); portal/oposicao/oposicao-portal-forms.tsx:34-41,91-100 |
| /painel/representacao/oposicao/[id] | Questionário: "Nova pergunta" / "Remover pergunta" | parcial | O questionário se edita fora do Editar, e cada mudança vale na hora. | representacao/oposicao | P3 | [id]/page.tsx:256-288 |
| opositor/[opositorId] | "Depois de salvar, abrir a próxima não avaliada" | ausente | Como andar pela fila. | representacao/oposicao | P3 | oposicao-forms.tsx:332-335 |
| /painel/representacao/oposicao/carta, [id]/carta | "Voltar ao texto padrão do sistema" / "Voltar a usar o texto da entidade" | parcial | Como voltar ao texto anterior; o aviso ao salvar diz quantos são afetados. | representacao/oposicao | P3 | carta/page.tsx:63-68; [id]/carta/page.tsx:70-93 |
| /painel/representacao/oposicao/decisoes | Aviso de privacidade › "Voltar ao padrão" | ausente | Como voltar ao texto padrão. | representacao/oposicao | P3 | gestao-forms.tsx:549-580 |
| /painel/representacao/oposicao/[id] | Fonte "Sem fonte informada"; busca "Nome, CPF, matrícula, e-mail ou protocolo" | ausente | Como achar uma oposição. | representacao/oposicao | P3 | [id]/page.tsx:349-386 |
| [id]/previa | "Sou filiado" / "Não sou filiado" | parcial | A prévia alterna os perfis. | representacao/oposicao | P3 | [id]/previa/page.tsx:70-89 |
| /portal/oposicao | "Não quero me opor" | ausente | Vira Desistente e pode registrar depois, no prazo. | portal/oposicao, fluxos-publicos/oposicao | P3 | portal/oposicao/[id]/oposicao-flow.tsx:304-316 |
| /painel/representacao/filiacao-coletiva | Situação "Revertido" | parcial | O artigo cita só Rascunho e Aplicado. | representacao/filiacao-coletiva | P3 | filiacao-coletiva/page.tsx:35-50,109-114 |
| /painel/representacao/filiacao-coletiva/[id] | "Desistiram no prazo", "Já ativados", "Cadastros criados", "Condições alteradas" | parcial | Como ler o andamento. | representacao/filiacao-coletiva | P3 | [id]/page.tsx:125-147 |

### Painel do módulo, Acordos, Negociações e Empregadores

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/representacao/empregadores/[id] | Aba "Arrecadação" | parcial | Exige a permissão de Receitas da Filiação. O erro comum "Não vejo a aba…" não a cita. | representacao/empregadores | P2 | painel/representacao/empregadores/[id]/filtros.ts:11; empregadores.mdx:279-289,346-347 |
| idem | "Documentação legal" (Título, Tipo, Nº, "Data do documento", "Vigência até (opcional)", "Arquivo (PDF)"), "Remover documento" | ausente | Como incluir, quais os tipos, quem pode. Remover não pede confirmação. | representacao/empregadores | P2 | [id]/empregador-docs-forms.tsx:24-80,94-117 |
| /painel/representacao/empregadores/[id]/editar | "Excluir fonte" | ausente | Fonte com vínculos não se exclui (a tela manda inativar). Sem vínculos, a exclusão é lógica. | representacao/empregadores | P2 | fonte-form.tsx:58-66,230-241; empregadores/actions.ts:128-160 |
| idem | "Fonte inativa", "Inativa desde" | ausente | O que muda (filtro Condição, selo) e que é o caminho no lugar de excluir. | representacao/empregadores | P2 | fonte-form.tsx:200-209 |
| /painel/representacao/acordos/comparacoes/[id] | "Excluir comparação" | ausente | Não pede confirmação. | representacao/acordos | P2 | acordos/comparacoes/[id]/page.tsx:246-252 |
| /painel/representacao/negociacoes/[id] | Excluir documento ("…com o PDF e as cláusulas?"), excluir acontecimento ("Tirar este registro da linha do tempo?") | ausente | O artigo só fala de excluir a negociação. | representacao/negociacoes | P2 | negociacoes/[id]/negociacao-forms.tsx:311,360-364 |
| /painel/representacao | Cartão "Congressos e conferências" | defasado (print) | representacao/painel.png mostra 6 cartões, e a tela tem 7. | representacao/index | P3 | painel/representacao/page.tsx:64-70; index.mdx:60 |
| idem | Quem vê o cartão Congressos | parcial | As permissões de gestão, credenciamento e relatoria também mostram o cartão. | representacao/index | P3 | page.tsx:81-93 |
| /painel/representacao/empregadores/nova | "CNPJ / CPF", "Categoria *" | parcial | O artigo diz que a categoria é escolhida "em Editar", mas ela é obrigatória já na criação. A fonte aceita CPF. | representacao/empregadores | P3 | fonte-form.tsx:119,178-199; empregadores.mdx:246 |
| /painel/representacao/empregadores/[id] | Indicadores clicáveis | parcial | Abrem Filiados filtrado pela fonte. | representacao/empregadores | P3 | [id]/page.tsx:146-148,225-233 |
| [id]?aba=arrecadacao | Desconto em folha em empresa de grupo centralizado | ausente | O quadro só manda para a pagadora. | representacao/empregadores | P3 | [id]/desconto-folha.tsx:22-38 |
| idem | "A comunicar ao RH: …" + "Enviar"; prazos e contatos | parcial | A edição é feita ali; "Enviar" é atalho. | representacao/empregadores | P3 | [id]/desconto-folha.tsx:86-131 |
| /painel/representacao/empregadores/grupos/[id] | "Empresa pagadora (faz o repasse)", "Retirar … do grupo", excluir grupo | parcial | O padrão da pagadora e a retirada. Excluir o grupo não apaga as empresas. | representacao/empregadores | P3 | grupos/grupo-forms.tsx:121-131,276,296-299 |
| empregadores/[id]/reunioes/nova | Leitura da ata por IA acima de 20 MB | parcial | A IA não lê o escaneado acima de 20 MB; o manual diz 25 MB. | representacao/empregadores | P3 | [id]/reunioes/actions.ts:99; empregadores.mdx:325-329 |
| empregadores/[id]/reunioes/[reuniaoId] | "Editar" e excluir | ausente | Excluir apaga a ata e os participantes. | representacao/empregadores | P3 | [reuniaoId]/page.tsx:132-134,217; excluir-reuniao.tsx:16 |
| /painel/representacao/acordos/comparacoes/[id] | "Analisar com IA", "Fechar a diferença" | parcial | O par sem análise. | representacao/acordos | P3 | comparacoes/[id]/par-acoes.tsx:96 |
| /painel/representacao/acordos, [id] | Selos "Vencido" e "Vencendo" | parcial | Selos na linha e no cabeçalho. | representacao/acordos | P3 | acordos/page.tsx:47-53,218-222 |
| /painel/representacao/acordos/[id] | "Adicionar cláusula" / "Remover cláusula" | parcial | Os campos. O mesmo seletor se chama "Categoria" aqui e "Tema" na edição. | representacao/acordos | P3 | acordos-forms.tsx:313-335,345-362 |
| /painel/representacao/acordos/[id]?editar=1 | "Documento do acordo (PDF, vazio mantém o atual)" | ausente | Se trocar o PDF separa as cláusulas de novo. | representacao/acordos | P3 | acordos-forms.tsx:266-275 |
| /painel/representacao/negociacoes/[id]/quadro | "O que a pauta pede mudar" | parcial | Falta a terceira diferença. | representacao/negociacoes | P3 | negociacoes/[id]/quadro/page.tsx:230-246 |
| /painel/representacao/negociacoes/[id] | "Quadro comparativo" | ausente | Só aparece com acordo vigente ou documento. | representacao/negociacoes | P3 | negociacoes/[id]/page.tsx:106,136-141 |

### Eventos e telas públicas de evento

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/eventos/[id] | Avaliar → **Confirmar** (inclusive da Lista de espera) | ausente | Confirmar à mão não confere lotação, vagas nem teto. Só depois aparece o alerta. | eventos/inscricoes | P1 | painel/eventos/actions.ts:419-475; [id]/page.tsx:215-228 |
| /painel/eventos/[id] | Situação do evento → Publicado depois de Adiado/Cancelado | ausente | Republicar não avisa ninguém. "Nova data (se já houver)" não muda Início e Término; é preciso corrigir em Editar antes. | eventos/criar | P1 | actions.ts:378-415; evento-forms.tsx:494 |
| /painel/eventos/[id] | Desistência de não filiado | ausente | /inscricao/[token] não tem cancelar, e a equipe não tem "Cancelar", só Recusar, que manda e-mail de recusa. | eventos/inscricoes; fluxos-publicos/evento | P2 | evento-forms.tsx:556-558; inscricao/[token]/actions.ts |
| /painel/eventos/[id]/campos | Respostas aos campos próprios | defasado | O manual diz que ficam "na ficha". Não há ficha: elas só saem no Excel de **Baixar confirmados…**, sem pendentes e recusadas. | eventos/criar | P2 | painel/eventos/[id]/page.tsx:447-456; [id]/confirmados/xlsx/route.ts:76 |
| /painel/eventos/[id]/convidados | Lançar um convidado / Importar planilha | ausente | O convidado não recebe e-mail, link nem QR: na porta é achado por nome ou CPF e não responde ao RSVP. | eventos/convidados; eventos/recepcao | P2 | [id]/convidados/actions.ts:120-172 |
| /painel/eventos/configuracao | Termos em vigor | parcial | A tela só mostra, não edita. Falta dizer a quem pedir a versão nova e o que acontece sem termo. | eventos/dados-participantes | P2 | configuracao/page.tsx:67-100 |
| /painel/eventos/novo, [id]/editar | Travas e regras de inscrição (grupo recolhível) | parcial | O grupo precisa ser aberto. | eventos/criar | P3 | evento-forms.tsx:282-284 |
| /painel/eventos/[id] | Histórico das inscrições | parcial | A posição muda conforme o estado. | eventos/criar | P3 | [id]/page.tsx:250-261 |
| /painel/eventos/[id] | Situação "Cancelada" | parcial | Depende de permitir_cancelar da Área do associado. | eventos/inscricoes | P3 | portal/eventos/page.tsx:258-262 |
| /relacao/[token] | "Sem valores a repassar", "Sem desconto" | parcial | Faltam esses estados e um texto do ponto de vista do RH. | filiados/controle-envio | P3 | relacao/[token]/page.tsx:19-26 |

---

## Rotas sem "Ajuda desta tela"

Todas as rotas do painel desta fatia têm o botão. Estas, porém, apontam para o artigo errado ou genérico:

- **/painel/representacao/votacoes/\*\*** (14 rotas) → `representacao/votacao-presencial`.
  - O mapa automático ligaria ao `votacoes`, mas o EXTRAS sobrescreve (src/lib/ajuda/rota.ts:65; a sobrescrita ocorre em `mapaAjuda`, linhas 109-110).
  - Resultado: o artigo principal de votações (921 linhas) nunca é alcançado pelo botão. Sugestão: tirar a entrada de EXTRAS e criar uma só para `/painel/representacao/votacoes/urnas` → votacao-presencial. **P1.**
- **/painel/eventos/[id]** → índice de eventos. Deveria ir para eventos/inscricoes.
- **/painel/eventos/novo** e **/painel/eventos/[id]/editar** → índice. Deveriam ir para eventos/criar.
- **/painel/eventos/[id]/campos** → índice. Deveria ir para eventos/criar.
- **/painel/eventos/[id]/convidados** → índice. Deveria ir para eventos/convidados.
- **/painel/eventos/configuracao** → índice. Deveria ir para eventos/dados-participantes.
- **/painel/representacao/congressos/\*\*** → `congressos`. O destino está certo, mas o artigo não fala de 22 das telas (ver a primeira tabela).

As telas públicas (/votar, /mesario, /apurador, /urna, /congresso, /evento, /inscricao, /relacao, /desistir) não têm o botão. Isso é esperado, porque ficam fora de /painel.

---

## Prints sugeridos (só os críticos)

| Tela | Por quê | Arquivo sugerido |
|---|---|---|
| /painel/representacao/votacoes/assembleias/[id]?aba=apuracao, híbrida, antes de encerrar | Encerrar tem efeito oficial, e o painel não mostra urnas pendentes | representacao/apuracao-encerrar.png |
| /apurador/urna/[id] com contagem lançada, Salvar contagem e Concluir à vista | Concluir sem salvar fecha a urna errada, sem volta | representacao/apurador-contagem.png |
| /urna com cédula aberta, ao lado do /mesario com a recusa "O terminal ainda está com outra cédula liberada" | Trava de campo sem saída descrita | representacao/terminal-cedula-aberta.png |
| /mesario/urna/[id] após voto em separado físico, com o código do envelope | O código aparece uma vez só | representacao/mesario-voto-separado-codigo.png |
| Mesa de credenciamento do congresso com pessoa encontrada | Decide o direito de voto, sob pressão | representacao/congressos-credenciamento.png |
| Mesa ao vivo com votação aberta e fila de fala | Tela mais complexa, usada ao vivo | representacao/congressos-mesa-ao-vivo.png |
| Moção antes de Protocolar | Protocolar encerra a coleta de assinaturas | representacao/congressos-mocao-protocolar.png |
| /congresso/eu/[token] no celular (QR, Presença, Plenária, Moções) | O participante externo faz tudo por ali | fluxos-publicos/congresso-link-pessoal.png |
| /congresso/entidade/[token] com indicação e assinatura | Representante legal externo; sem assinatura, nada vale | fluxos-publicos/congresso-entidade.png |
| /painel/representacao/oposicao/[id]/opositor/[id] com requisito vermelho e os 3 botões | Decisão jurídica com três saídas parecidas | representacao/oposicao-avaliar.png |
| /painel/representacao/oposicao/[id]/empregadores com "N nova(s) desde o último envio" e Registrar envio aberto | É o que vai ao RH; erro inclui ou exclui gente do desconto | representacao/oposicao-relacao-empregador.png |
| /painel/representacao/oposicao/atendimento com código pendente e eventos da Brevo | Resolve o chamado mais comum | representacao/oposicao-atendimento.png |
| /painel/representacao/filiacao-coletiva/[id] com "Reverter o processo" aberto | Ação de massa com senha, sem volta | representacao/coletiva-reverter.png |
| /painel/eventos/[id] com "Baixar a relação" (CPF parcial, sem contato) | Leva dado pessoal a terceiros | eventos/baixar-relacao.png |
| /painel/eventos/[id] com "Fechar as inscrições?" e recado | Corta inscrições do link e do portal | eventos/fechar-inscricoes.png |

Prints defasados:
- eventos/evento.png (17/10): é anterior a Baixar confirmados, Fechar inscrições e Histórico.
- representacao/painel.png: não tem o cartão Congressos.

Continuam faltando (já apontado): eventos/conciliar.png, eventos/situacao-adiar.png e representacao/apurador-iniciar.png.

---

## Possíveis defeitos vistos de passagem

**Votações**
- Encerrar apuração soma contagens de urnas físicas não concluídas, não exige conclusão e não pede confirmação (src/lib/db/assembleias.ts:2507-2545, 2605-2646). A contagem de urna digital é ignorada sem aviso (:2517).
- O apurador pode concluir a urna sem contagem salva (src/lib/db/votacao-apuracao.ts:484-503).
- Não há como cancelar cédula aberta nem trocar o terminal pareado. "Terminal encerrado" parece inalcançável (votacao-mesarios.ts:714,1191,1299).
- A abertura da urna expira à meia-noite sem ata de fechamento (votacao-mesarios.ts:773-776).
- Urna, mesário e apurador se editam e se excluem sem trava durante a votação. A exclusão devolve a mensagem crua do Postgres (votacao-mesarios.ts:263-301,343-355).
- Dados da rodada deixa encurtar o período com assembleias cadastradas e mudar a cláusula de filiação coletiva depois da votação (rodadas/[id]/actions.ts:68-118).
- Resolvido: o interruptor "Apuração encerrada" da auditoria anterior saiu de rodada-form.tsx.

**Congressos**
- "Local da decisão" está marcada como não aplicada, mas as regras dela valem (config.ts:90; src/lib/db/congressos-ao-vivo.ts:116-117).
- "Pergunta sobre hospedagem", "Lista de delegados pública" e "Quem paga as despesas" não têm efeito.
- Situação "Encerrado" à mão contorna o botão Encerrar (sem resoluções nem certificados).
- O bloqueio por cotas segue sem efeito (já apontado). O de elegibilidade passou a barrar só pela taxa da entidade (congressos-dia.ts:311-315).

**Oposição e filiação coletiva**
- A campanha de oposição segue "Aberta" após o prazo; nada a encerra (src/lib/db/oposicao.ts:522-534).
- Registrar envio ao RH pede "configurar", não "avaliar" ([id]/empregadores/page.tsx:121).
- Reverter a filiação coletiva não tem trava de prazo, desfaz quem já é Ativo e não avisa a fonte (src/lib/db/filiacao-coletiva.ts:818-870).

**Eventos**
- Confirmar à mão não tem trava de lotação.
- A equipe não consegue marcar uma inscrição como "Cancelada", só "Recusada", com e-mail de recusa.

**Exclusões sem confirmação**
- "Excluir comparação" (acordos/comparacoes/[id]/page.tsx:246).
- "Remover documento" (empregadores/[id]/empregador-docs-forms.tsx:94-117).

**Avisos técnicos "rode supabase/….sql" na tela**
- Novos: acordos/comparacoes (src/lib/db/acordos-comparacoes.ts:26), negociacoes/page.tsx:63-67, empregadores/categorias/page.tsx:57, painel/eventos/page.tsx:79-82 e eventos/novo/page.tsx:48.
- Já apontados: votacoes/page.tsx:117, aviso-aptos.tsx:69,365, assembleias-rodada.tsx:114 e filiacao-coletiva/page.tsx:93.
- O texto do card Integridade com `npm run votacao:auditar` continua (já apontado).

**Nomes de clientes reais**
- Placeholder "Ex.: Grupo Baker Hughes" (empregadores/grupos/grupo-forms.tsx:88).
- Texto alternativo de acordos-tema.png com "Halliburton" (acordos.mdx:278).

**Outros**
- "nao pode ocupar" continua em eventos/evento-forms.tsx:238 (já apontado).
