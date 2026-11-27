# Operacional: Veículos, Ferramentas, Patrimônio, Espaços, Jurídico, Hospedagem, Viagens, portal do hotel e telas públicas

Rotas conferidas: **143**.
- Veículos: 28, mais /painel/solicitar-veiculo.
- Ferramentas: 28.
- Patrimônio: 13.
- Espaços: 7.
- Jurídico: 6.
- Hospedagem (painel): 12.
- /painel/viagens/[[...caminho]]: 1.
- Hotel: 17.
- Públicas: /hospedagem/{avaliar,oferta,reserva}/[token], /espaco/[slug] e /recepcao.

Artigos lidos:
- ajuda/veiculos/{index, agendamentos, checklist, abastecimentos, manutencoes, infracoes, condutores}
- ajuda/ferramentas/{index, projetos, documentos, agenda, oficios}
- ajuda/patrimonio/{index, itens, recintos, notas}
- ajuda/espacos/{index, publico, pedidos, termo}
- ajuda/juridico/{index, homologacoes, processos, reembolsos}
- ajuda/hospedagem/{index, reservas, demanda-garantida, faturamento, avaliacoes}
- ajuda/viagens/{index, atendimento, faturas}, só por grep
- ajuda/eventos/recepcao, para /recepcao
- hotel/{visao-geral, reservas, recepcao, emergencial, avaliacoes, faturamento, contas, acordo}
- de apoio: introducao/suporte e portal/hospedagem

Conferi também `docs/manual-auditoria-2026-11.md`. Os itens que já constavam lá estão marcados **(já na auditoria)**.

Observação sobre /painel/viagens/[[...caminho]]: a rota só faz `redirect()` para /painel/institucional/viagens/... e serve aos links antigos dos e-mails (src/app/painel/viagens/[[...caminho]]/page.tsx:12-14). A ajuda é resolvida já na rota nova, então não há lacuna aqui.

Resumo de cobertura: Patrimônio, Jurídico e Recepção de eventos estão bem cobertos. As lacunas graves se concentram em três frentes:
- Hospedagem, no faturamento e no que acontece depois de faturar.
- Espaços, na relação entre termo, confirmação e permissões.
- Veículos, nas regras de dinheiro e nas decisões sem volta.

---

## Telas sem nenhum artigo

| Rota | O que a tela faz | Artigo sugerido (novo ou existente) | Prioridade |
|---|---|---|---|
| /painel/veiculos/[id]/infracoes | Aba de multas do veículo, com "Registrar infração". Nenhum artigo fala dela; a ajuda cai em veiculos/index pelo prefixo. | veiculos/infracoes, seção "Pela página do veículo" | P3 |
| /painel/veiculos/[id]/abastecimentos | Lista paginada dos abastecimentos do veículo e botão "Lançar abastecimento", que abre a lista e não a inclusão (já na auditoria, item 6). O index só cita o botão. | veiculos/abastecimentos | P3 |

As outras áreas não têm tela sem artigo: o assunto de cada rota está em algum texto. O problema delas é de navegação e aparece em "Rotas sem Ajuda desta tela".

---

## Lacunas em telas que têm artigo

### Veículos

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prior. | Evidência |
|---|---|---|---|---|---|---|
| /painel/veiculos/contratos/[id] | "Gerar cobrança" | ausente | A locação no valor exato do "Valor mensal" do contrato nasce **dispensada de autorização**. Valor diferente, ou outra categoria (TAG, Infração, Seguro, Outras taxas), passa pela alçada. | infracoes (seção de contratos) | P1 | src/lib/db/veiculos.ts:3945-3955 |
| /painel/veiculos/infracoes/[id] | "Avaliar justificativa" / "Salvar avaliação" | parcial | O rádio já vem marcado em "Atividade sindical — o sindicato assume a multa": salvar sem trocar isenta o condutor. Não há confirmação e a avaliação não se refaz, porque o formulário só aparece enquanto aguarda avaliação. | infracoes | P1 | src/app/painel/veiculos/infracoes/infracao-forms.tsx:268,277-291; infracoes/[id]/page.tsx:209-211 |
| /painel/veiculos/infracoes | "Registrar infração" | ausente | Não há editar nem excluir infração, e o aviso (sino e e-mail) já saiu para o condutor. É preciso conferir antes e dizer a quem recorrer se errar. | infracoes | P1 | infracoes/actions.ts (só registrar, justificar, avaliar e gerar ordem) |
| /painel/veiculos/checklists e /novo | "Realizar checklist" | parcial | "Checklist da frota" sozinha não abre a área: a lista exige Veículos ou Gestão, e nenhum menu leva a /novo. | checklist | P2 | checklists/page.tsx:43; src/lib/permissoes.ts:440-444; checklists/novo/page.tsx:29 |
| /painel/veiculos/manutencoes | "Registrar manutenção" | parcial | Só com "Manutenções" a pessoa não abre a área nem o veículo; precisa também de Veículos. | manutencoes | P2 | manutencoes/page.tsx:36; [id]/manutencoes/page.tsx:41 |
| /painel/veiculos/manutencoes/[id] | página da manutenção | ausente | A manutenção registrada não se edita nem se exclui pela tela. | manutencoes | P2 | manutencoes/[id]/page.tsx:150-170; manutencoes/actions.ts:208 (ação sem botão) |
| /painel/veiculos/manutencoes/planos | "Salvar", "Ativa", "Excluir programação" | ausente | Faltam três coisas: editar a programação; desmarcar "Ativa", que para os alertas e mantém o histórico; e excluir, que não pede confirmação e tira o vínculo das manutenções. | manutencoes | P2 | manutencao-forms.tsx:519-531,598-634; manutencoes/actions.ts:285-306 |
| /painel/veiculos/contratos/[id] | "Gerar cobrança" | ausente | O sistema recusa a cobrança em três casos: período repetido na mesma categoria ("Já existe ordem deste contrato para o período…"), contrato finalizado e contrato sem locadora. | infracoes | P2 | src/lib/db/veiculos.ts:3897-3920 |
| /painel/veiculos/contratos | "Departamento", "Centro de custo" | parcial | O manual os trata como opcionais, mas eles vão para todas as ordens de cobrança. O centro só aparece depois de escolher o departamento. | infracoes | P2 | src/lib/db/veiculos.ts:3963-3965; contrato-forms.tsx:247-270 |
| /painel/veiculos/[id]/historico/[movimentacaoId] | "Salvar correção" (bloco Devolução) | ausente | Data e hodômetro da devolução em branco reabrem a movimentação, e o veículo volta a "Em uso". É recusado se já houver outra movimentação aberta. | index | P2 | movimentacao-editar-form.tsx:149-153; src/lib/db/veiculos.ts:1366 |
| /painel/veiculos/[id]/historico/[movimentacaoId] | "Excluir movimentação" | parcial | É recusado quando "Outro registro depende desta movimentação". | index | P3 | src/lib/db/veiculos.ts:1424 |
| /painel/veiculos/[id]/manutencoes | "Enviar para manutenção" / "Concluir manutenção" | parcial | Não há confirmação, e registrar a manutenção não tira o veículo de "Em manutenção". | manutencoes | P3 | [id]/veiculo-acoes.tsx:16-42 |
| /painel/veiculos | busca "Placa, modelo ou código" | ausente | O manual só cita o filtro Ativos/Inativos/Todos. | index | P3 | veiculos/page.tsx:282-301 |
| /painel/veiculos/[id] | botão "Checklist" | parcial | Só aparece com o checklist configurado. | index | P3 | [id]/page.tsx:218-225 |
| /painel/veiculos/contratos | aviso "Há contrato vigente sem veículo vinculado…" | ausente | O aviso manda vincular "na ficha do veículo", e o manual ensina pelo contrato. Dizer os dois caminhos. | infracoes | P3 | contratos/page.tsx:69-77 |
| /painel/veiculos/abastecimentos | "Legado s/ veículo" | ausente | Explicar o lançamento antigo do Bubble sem placa. | abastecimentos | P3 | abastecimentos/page.tsx:267 |
| /painel/solicitar-veiculo | "Esta solicitação não pode mais ser editada…" | parcial | Com CNH vencida ou condutor desautorizado, a solicitação aberta também não se edita. | agendamentos | P3 | solicitar-veiculo/page.tsx:80-97 |

### Ferramentas

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prior. | Evidência |
|---|---|---|---|---|---|---|
| /painel/ferramentas/oficios/[id] (rascunho) | "Melhorar com IA" | parcial | O texto da IA **substitui o Corpo na hora**, sem prévia nem aceitar/recusar. Exige corpo com pelo menos 10 caracteres. É preciso reler e salvar antes de enviar, porque o envio usa a versão salva. | oficios | P1 | src/app/painel/ferramentas/oficios/oficio-form.tsx:275-301,522; oficios/ia-actions.ts:26-28; oficios.mdx:92-93 |
| /painel/ferramentas | cartões "Automações", "Modelos e pedidos", "Painéis" | defasado | O index lista só 6 áreas no texto, nos passos e no print. | index | P2 | ferramentas/page.tsx:82-103; index.mdx:1-2,7-37 |
| /painel/ferramentas/oficios/[id] | "Número" com "(previsto)" | defasado | O número não se edita: é o último do ano + 1, atribuído no envio ou na emissão. O manual manda "conferir" como se fosse ajustável. | oficios | P2 | assinatura-acoes.tsx:124-133; oficio-acoes.tsx:49-55; actions.ts:242; oficios.mdx:52-53,301-302 |
| /painel/ferramentas/oficios/[id] (filiação/desfiliação) | cartão "Pessoas": "Carregar da fonte pagadora", "Adicionar selecionados", "Adicionar manualmente", "Remover", "Defina a empresa destinatária acima e salve…" | parcial | Salvar a empresa antes; incluir pessoa fora da lista; remover só no rascunho; o que é "Nenhum filiado pendente nesta fonte pagadora". É a lista que manda a empresa descontar ou parar de descontar. | oficios | P2 | oficios/[id]/page.tsx:330-398; oficio-acoes.tsx:189-300; oficios.mdx:72-77 |
| /painel/ferramentas/demandas/[id] | "Excluir esta demanda" / "Excluir demanda" | parcial | Fica no pé da página e só aparece para o criador. As tarefas ficam avulsas; checklists e comentários somem. Não tem volta. | projetos | P2 | demandas/[id]/page.tsx:62-66,200-219; demanda-acoes.tsx:101-140 |
| /painel/ferramentas/modelos e /modelos/[id] | "Adicionar ao modelo" (Tarefa/Marco, "dias antes"/"dias depois"/"no dia", Prioridade, Procedimento, Checklist) e "Excluir o modelo?" | parcial | Falta o passo a passo de montar o modelo. Excluir deixa os formulários "sem modelo". | projetos | P2 | modelos-forms.tsx:37-40,74-76,99-131; modelos/[id]/page.tsx:88,95 |
| /painel/ferramentas/oficios/[id] | "Escolha o assinante (diretoria) acima e salve para poder enviar." | ausente | O cartão de envio só aparece depois de salvar o assinante. | oficios | P3 | oficios/[id]/page.tsx:430-439 |
| /painel/ferramentas/oficios/[id] | "Finalizar ofício" | parcial | Limite de 4 MB também aqui, e há confirmação. | oficios | P3 | assinatura-acoes.tsx:205-226 |
| tabela "Quem vê o quê" | "Demandas — … excluir demandas" | defasado | Só o criador exclui. | projetos | P3 | projetos.mdx:443 × demandas/[id]/page.tsx:64-66 |
| /painel/ferramentas/demandas | coluna "Feito" do Quadro | ausente | Mostra só as 30 mais recentes. | projetos | P3 | demandas/page.tsx:38,101-103 |
| /painel/ferramentas/demandas | filtro de relatos do "?" | ausente | Os relatos do sistema viram demandas, e a caixa de entrada abre a lista filtrada. | projetos | P3 | demandas/page.tsx:77-78 |
| "Aplicar modelo" | "Responsável pelas tarefas" ("Ninguém por enquanto") | ausente | Dá para pôr um responsável em todas as tarefas de uma vez. | projetos | P3 | modelos/usar-modelo.tsx:87-113 |
| /painel/ferramentas/modelos | "Formulários de pedido" (campos, "Criar formulário", "Excluir o formulário?") | parcial | Os campos, a edição e a exclusão. | projetos | P3 | modelos-forms.tsx:177-222 |
| /painel/ferramentas/automacoes | "Excluir a automação"; "Crie a etiqueta antes, em Tarefas → Etiquetas." | parcial | O manual só fala em ligar e desligar. | projetos | P3 | regras-forms.tsx:54-60,101,126-142 |
| /painel/ferramentas/projetos/[id] | "Departamentos" | ausente | É calculado; não existe campo para preencher. | projetos | P3 | projetos/[id]/page.tsx:188-190 |
| /painel/ferramentas/projetos e /anomalias | (não há excluir) | ausente | Não se excluem: finaliza-se o projeto ou se cumprem as etapas da anomalia. | projetos | P3 | projetos/actions.ts; anomalias/actions.ts |
| /painel/ferramentas/anomalias | "Em aberto" × "Eficácia verificada" | parcial | "Em aberto" é a anomalia sem eficácia verificada. | projetos | P3 | anomalias/page.tsx:86-87,104-106 |
| /painel/ferramentas/agenda/novo | tipo do compromisso | defasado | O manual lista "Evento", que o avulso não oferece. | agenda | P3 | agenda-forms.tsx:97; src/lib/agenda-constantes.ts:22; agenda.mdx:67-68 |

### Patrimônio

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prior. | Evidência |
|---|---|---|---|---|---|---|
| /painel/patrimonio/notas/novo e notas/[id] | "Fornecedor" | parcial | A lista vem do cadastro de **Fornecedores de Compras**. Fornecedor que não está lá precisa ser cadastrado antes, em Compras. | notas | P3 | src/app/painel/patrimonio/notas/novo/page.tsx:8,17; notas/nota-form.tsx:80-86 |

Fora isso, itens, cautela, recintos e notas estão cobertos com os rótulos corretos. Os defeitos 3, 4, 7, 10 e 11 da auditoria seguem valendo: vínculo item × nota sem tela, termo de cautela só no registro, sedes fixas, item em cautela pode ser inativado e "rode supabase/patrimonio.sql" (patrimonio/page.tsx:31; itens/page.tsx:151).

### Cessão de espaços (painel e /espaco/[slug])

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prior. | Evidência |
|---|---|---|---|---|---|---|
| /painel/espacos/pedidos/[id] | "Confirmar a cessão" × cartão "Termo de cessão" ("Gerar o termo") | **defasado / enganoso** | Depois de confirmada a cessão, o cartão do termo fica só leitura (`podeGerir && !encerrado`). Quem confirma antes de gerar o termo **não consegue mais gerá-lo nem mandá-lo para assinatura**. O manual diz "O termo não trava a confirmação", e isso leva justamente a esse erro. Deve dizer: gere e envie o termo **antes** de confirmar. | pedidos; termo | P1 | src/app/painel/espacos/pedidos/[id]/page.tsx:65-68,152-157,159; pedidos.mdx:73-74 |
| /painel/espacos/pedidos/[id] | cartão "Fechamento" ("Recusar pedido", "Cancelar pedido") | ausente | Confirmada a cessão, o cartão Fechamento some: **não há como cancelar uma cessão confirmada** pela tela, e a agenda continua riscada. O manual só fala de recusar ou cancelar antes de confirmar. Dizer o que fazer em caso de desistência. | pedidos | P1 | pedidos/[id]/passos.tsx:479 (`if (!podeGerir \|\| encerrado) return null`); page.tsx:65-68,180-185 |
| /painel/espacos/pedidos e /pedidos/[id] | permissão "Cessão — autorizar (avaliação política)" | **defasado** | Quem tem só essa permissão **não abre a fila nem o pedido**: as páginas exigem "Cessão de espaços" ou "Cessão — cadastrar…". O menu oferece a fila também ao autorizador (permissoes.ts:614), mas a página recusa. O manual diz que autorizar "é uma permissão à parte", como se bastasse. Avisar que o autorizador precisa **também** de "Cessão de espaços". | pedidos | P1 | pedidos/page.tsx:45; pedidos/[id]/page.tsx:45; src/lib/permissoes.ts:609-615; pedidos.mdx:6-8,99-101 |
| /painel/espacos/pedidos/[id] | "Enviar de novo" / "Cancelar a assinatura pendente" | ausente | Enviar de novo **cancela os links anteriores**, e o botão para cancelar a assinatura pendente existe. O artigo termo.mdx não cita nenhum dos dois. | termo | P2 | pedidos/[id]/passos.tsx:693-694,727,736-739 |
| /painel/espacos/pedidos/[id] | "Marcar como pago" (custeio) | parcial | Não pede confirmação e não tem desfazer. Só grava a data do pagamento: **não lança receita nem cobrança no Financeiro**. Quem recebe precisa registrar o dinheiro por fora. | pedidos | P2 | pedidos/[id]/passos.tsx:450-458; src/lib/db/espacos-esteira.ts:538-545 |
| /espaco/[slug] (público) | "Confirme seu e-mail" / "Código" / botão de reenvio | parcial | O código **vale 20 minutos**, aceita até **5 tentativas** ("Muitas tentativas. Peça um novo código.") e pode ser reenviado pela própria página. É o que a equipe precisa dizer a quem liga reclamando. | publico | P2 | src/lib/db/espacos-solicitacao.ts:42-43,628-633; src/app/espaco/[slug]/pedido-form.tsx:67,145-150 |
| /painel/espacos/pedidos | situações "Aguardando confirmação do e-mail", "Na fila", "Em análise", "Recusada", "Cancelada", "Confirmada"; coluna "Com quem" | ausente | A lista das situações e o filtro "Todas as situações". O texto fala em "rascunho", mas a tela mostra "Aguardando confirmação do e-mail". | pedidos | P3 | src/lib/db/espacos-esteira.ts:38-45; pedidos/page.tsx:113-155 |
| /painel (caixa de entrada) | "Pedidos de espaço em análise" | ausente | O item da caixa de entrada não é citado, e o autorizador não recebe aviso próprio de autorização pendente. | pedidos | P3 | src/lib/db/pendencias.ts:417-422 |
| /painel/espacos/[id] | faixas, bloqueios e regras: só lixeira ("Excluir faixa", "Excluir bloqueio", "Excluir regra") | ausente | Não há edição: para mudar, exclui-se e cadastra-se de novo. As exclusões não pedem confirmação. Faltam também os motivos do bloqueio (Manutenção, Agenda prioritária, Outro). | index | P3 | [id]/agenda.tsx:152,327,337; [id]/exigencias.tsx:230; src/lib/espacos-constantes.ts:29-33 |

### Jurídico

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prior. | Evidência |
|---|---|---|---|---|---|---|
| /painel/juridico/processos/[id] | "Registrar despesa" | ausente | A despesa lançada **não se edita nem se exclui**. Valor ou comprovante errado só se corrige pedindo a reprovação ("Observação") e lançando de novo. | reembolsos | P2 | src/app/painel/juridico/processos/reembolso-actions.ts (só registrar, avaliar e definir centro); src/lib/db/juridico.ts:1150-1255 |
| /painel/juridico/homologacoes e /processos | filtros vindos de outras telas (`fonte`, `filiado`) | ausente | As listas abrem filtradas por empregador ou por filiado quando se chega pela ficha. A tela mostra o filtro sem explicar de onde veio. | homologacoes; processos | P3 | homologacoes/page.tsx:184; processos/page.tsx:191 |

O restante do Jurídico confere com o código: permissões, status que finalizam, escritório como favorecido, centro de custo, erros e "Ver a fila". Os defeitos 2, 8 e 11 da auditoria seguem valendo ("rode supabase/juridico.sql" em juridico/page.tsx:128-129).

### Recepção de eventos (/recepcao)

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prior. | Evidência |
|---|---|---|---|---|---|---|
| /recepcao | "Confirmar" / "Entrou" | ausente | A presença confirmada **não se desfaz** pela porta (só há buscar e confirmar). Confirmação por engano vai para o prontuário do filiado. Dizer a quem recorrer. | eventos/recepcao | P3 | src/app/recepcao/actions.ts:25-58 |
| /recepcao | "Trocar de evento" / "Trocar de dia" | ausente | Os dois botões não são citados (P3 menor). | eventos/recepcao | P3 | src/app/recepcao/page.tsx:127,146 |

### Hospedagem (painel), portal do hotel e páginas públicas

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prior. | Evidência |
|---|---|---|---|---|---|---|
| /hotel/faturamento e /painel/hospedagem/hoteis/[id] | situação "Cancelada" / "Sem ordem" da fatura | ausente | Fatura cuja ordem é cancelada ou devolvida fica para sempre em "Faturas em aberto", e as reservas continuam presas a ela. Não há como cancelar ou refazer a fatura. | hotel/faturamento; hospedagem/faturamento | P1 | src/app/hotel/faturamento/page.tsx:93-102; src/lib/db/hospedagem.ts:1252,1278 |
| /hotel/faturamento/nova (demanda garantida) | Nova fatura | ausente | Reserva garantida não gera `hospedagem_servico`, e a lista de faturáveis só lê serviços: o hotel garantido nunca vê nada para faturar. O manual não diz como ele cobra. | hotel/faturamento; hospedagem/demanda-garantida | P1 | src/lib/db/hospedagem.ts:1273-1282; src/lib/hotel-permissoes.ts:43 |
| /painel/hospedagem/cupons | "Cancelar" (cupom Reservado, pagamento por uso) | ausente | Só marca o cupom como cancelado: o cupom continua vinculado, conta como hóspede e comparecido, e a reserva segue faturável. É preciso **Desvincular** antes. | hospedagem/reservas | P1 | cupons/actions.ts:192-196; src/lib/db/hospedagem.ts:360-366 |
| /hotel/reservas/[id] e /painel/hospedagem/servicos/[id] | "Desfazer comparecimento" / "Desvincular" / "Reabrir reserva" | ausente | Os três continuam disponíveis depois de faturar. Desvincular recalcula a tarifa de uma reserva que já está em fatura e ordem. | hotel/reservas; hospedagem/reservas | P1 | servicos/[id]/servico-acoes.tsx:56,116,132; src/lib/db/hospedagem.ts:967-993,1033-1047 |
| /hotel/recepcao | "Registrar entrada" | parcial | **Não se desfaz**, nem pelo hotel nem pelo painel: vale como comparecimento, impede o cancelamento e dispara a avaliação. | hotel/recepcao | P1 | src/lib/db/hospedagem-garantida.ts:2079-2086 |
| /painel/hospedagem/nao-comparecimentos | "Abonar" / "Liberar" | parcial | Os dois não têm desfazer. Liberar não pede confirmação e zera o efeito de todas as faltas anteriores. | hospedagem/demanda-garantida | P2 | nao-comparecimentos/formularios.tsx:28-33,72-76; actions.ts:50 |
| /painel/hospedagem/hoteis/[id] | "Desativar" / "Reativar" (Usuários do hotel) | ausente | Como tirar o acesso de quem saiu do hotel. Acesso desativado não recebe "Reenviar e-mail" nem "Copiar link". | hospedagem/index | P2 | hoteis/[id]/usuarios-hotel.tsx:205-225; hoteis/actions.ts:350,369 |
| /painel/hospedagem/hoteis/[id] | Tarifas por acomodação, "Excluir" | ausente | Não há edição: troca-se o preço excluindo e incluindo de novo. A tarifa é reaplicada ao vincular ou desvincular. Sem tarifa para N pessoas, a reserva é recusada. | hospedagem/index | P2 | hoteis/[id]/tarifas.tsx:50,107,123-151 |
| /painel/hospedagem/mapa | "Remanejar" | parcial | Move a estadia inteira de quarto. Falta o erro "O quarto N não comporta esta estadia…" e o fato de que o botão some depois da entrada. | hospedagem/demanda-garantida | P2 | mapa/formularios.tsx:34-43; src/lib/db/hospedagem-garantida.ts:1904,1926 |
| /painel/hospedagem/servicos/[id] | (falta o relatório do hotel) | ausente/defeito | O painel não mostra o relatório que o hotel enviou, mesmo com "Exigir relatório…". | hospedagem/reservas | P2 | servicos/[id]/page.tsx; compare com hotel/reservas/[id]/page.tsx:347-379 |
| /painel/hospedagem/mapa e /cupons | cancelar reserva (equipe) | parcial | A pessoa recebe sino e e-mail "cancelada pelo sindicato", e a vaga oferecida da fila se encerra. | hospedagem/demanda-garantida | P3 | src/lib/db/hospedagem-garantida.ts:1016-1036 |
| /hotel/reservas/[id] | "Desvincular" | parcial | O filiado é avisado e o cupom volta a aguardar. | hotel/reservas | P3 | src/lib/db/hospedagem.ts:995-1026 |
| /hotel/reservas/[id] | "Tarifa por hóspede", "Custo da entidade", "Substituir relatório" | ausente | O que é cada valor e como trocar o arquivo. | hotel/reservas | P3 | hotel/reservas/[id]/page.tsx:216-237; relatorio-form.tsx:437 |
| /hotel/faturamento/nova | "· sem relatório" | ausente | A reserva entra sem relatório quando o hotel não o exige. | hotel/faturamento | P3 | fatura-form.tsx:129 |
| /hotel/emergencial | "Este hotel está inativo e não recebe cupons." | ausente | Erro comum que não está no artigo. | hotel/emergencial | P3 | src/lib/db/hospedagem-emergencial.ts:63 |
| /hotel/recepcao | "já tinha entrada registrada", "Fechar câmera" | ausente | Mensagem quando a pessoa já entrou e como fechar a câmera. | hotel/recepcao | P3 | recepcao/porta-hotel.tsx:101 |
| /hotel (login) | endereço /hotel e aba "Recuperar senha" | parcial | O endereço não aparece em nenhum artigo. | hotel/visao-geral | P3 | src/app/hotel/page.tsx; hotel-login-form.tsx:69-80 |
| /painel/hospedagem/hoteis/novo | "Máx. hóspedes por dia" | ausente | O campo é só informativo e não entra em nenhuma regra. | hospedagem/index | P3 | hoteis/hotel-form.tsx:143 |
| /painel/hospedagem/hoteis/novo | "Quartos dedicados", "Máx. hóspedes por quarto" | parcial | Os dois aparecem também no convênio por uso. | hospedagem/index | P3 | hoteis/hotel-form.tsx:123-140 |
| /painel/hospedagem/cupons | acesso pela Filiação | ausente | filiacao_gestao e filiacao_filiados também veem os cupons, e a gestão emite. | hospedagem/reservas | P3 | cupons/chaves.ts:10-22 |
| /painel/hospedagem/servicos | triângulo ⚠ | ausente | Indica reserva encerrada sem relatório. | hospedagem/reservas | P3 | servicos/page.tsx:161-170 |
| /painel/hospedagem/avaliacoes | selos "Aguarda providência", "Respondida", "Pendente" | parcial | O artigo só nomeia "Tratada". | hospedagem/avaliacoes | P3 | avaliacoes/page.tsx:430-445 |
| /hotel/ajuda | lista de artigos | parcial | Mostra artigos dos dois convênios e de áreas sem permissão. | (estrutura) | P3 | src/app/hotel/ajuda/layout.tsx:19-26 |

---

## Defasados (o manual diz e o código não faz)

| # | Artigo:linha | Trecho | O que o código faz | Evidência |
|---|---|---|---|---|
| 1 | espacos/pedidos.mdx:73-74 | "O termo não trava a confirmação." | Depois de confirmar, não se gera nem se envia mais o termo. | pedidos/[id]/page.tsx:155 |
| 2 | espacos/pedidos.mdx:6-8, 99-101 | autorizar "é uma permissão à parte" | Só com ela a pessoa não abre a fila nem o pedido. | pedidos/[id]/page.tsx:45 |
| 3 | veiculos/infracoes.mdx:130-131 | cartão "Veículos vinculados" | O cartão se chama "Veículos do contrato". | contratos/[id]/page.tsx:356 |
| 4 | veiculos/checklist.mdx:8-9 | "Realizar o checklist exige a permissão Checklist da frota" | Ela sozinha não basta. | checklists/page.tsx:43 |
| 5 | ferramentas/oficios.mdx:52-53, 301-302 | "o número (o próximo do ano é sugerido)… confira antes de emitir" | O número é só leitura, com "(previsto)". | assinatura-acoes.tsx:124-133 |
| 6 | ferramentas/agenda.mdx:67-68 | tipos incluem "Evento" | O avulso não oferece "Evento". | src/lib/agenda-constantes.ts:22 |
| 7 | ferramentas/index.mdx:1-2 (e o print painel.png) | 6 áreas | São 9: faltam Automações, Modelos e pedidos e Painéis. | ferramentas/page.tsx:82-103 |
| 8 | ferramentas/projetos.mdx:443 | Demandas "excluir demandas" | Só o criador exclui. | demandas/[id]/page.tsx:64-66 |
| 9 | hotel/visao-geral/index.mdx:49-53 | o Início mostra reservas abertas, hóspedes e chegadas de hoje | No convênio garantido os três números são sempre 0. | src/app/hotel/inicio/page.tsx:86-113 |
| 10 | hotel/visao-geral/index.mdx:53 | "Cada número leva à aba correspondente" | No convênio por uso, "Hóspedes hoje" não tem link. | inicio/page.tsx:135 |
| 11 | hotel/faturamento:42-44; hospedagem/faturamento:137-139 | "quando o sindicato paga, ela passa para Faturas fechadas" | A fatura com ordem cancelada nunca fecha. | src/lib/db/hospedagem.ts:1252 |

Fora dos artigos: a descrição do módulo Ferramentas ainda diz "…ofícios e e-mails" (src/lib/permissoes.ts:798; src/lib/ajuda/manifesto.ts:691,699).

---

## Rotas sem "Ajuda desta tela"

Sem botão de ajuda:
- **Portal do hotel inteiro**: /hotel/inicio, cupons, emergencial, reservas, reservas/nova, reservas/[id], hospedes, recepcao, avaliacoes, faturamento, faturamento/nova, contas, acordo e /hotel. A casca (src/app/hotel/hotel-shell.tsx:27-31) só tem a aba "Ajuda" para o índice; não existe mapa tela→artigo para o manifesto-hotel. O mapeamento é direto, porque as 8 áreas têm artigo (cupons e reservas → reservas; hospedes e recepcao → recepcao).
- **/recepcao**: fica fora do /painel, sem o menu de ajuda (src/components/layout/ajuda-menu.tsx não é montado ali). O artigo eventos/recepcao existe.
- Páginas públicas /espaco/[slug] e /hospedagem/{avaliar,oferta,reserva}/[token]: para pessoa externa, a falta é aceitável.

Com destino ruim (o prefixo cai no índice da área, mas o conteúdo está em outro artigo):
- **/painel/ferramentas/** demandas, demandas/nova, demandas/[id], demandas/[id]/editar, tarefas, anomalias, anomalias/nova, anomalias/[id], anomalias/[id]/editar, automacoes, modelos, modelos/[id] e paineis (14 rotas). Caem em ferramentas/index, que não explica essas telas. O conteúdo está em **ferramentas/projetos**. P2.
- **/painel/patrimonio/[id]** e **/painel/patrimonio/novo**: caem em patrimonio/index. Cadastro, inativação e cautela estão em **patrimonio/itens**. P2.
- **/painel/hospedagem/cupons** e cupons/novo: caem em hospedagem/index. A emissão e o cancelamento estão em **hospedagem/reservas**. /hoteis/** cai no index, que é aceitável, mas a configuração da garantida está em demanda-garantida.
- **/painel/veiculos/** contratos e contratos/[id] (conteúdo em infracoes), [id]/movimentacao (agendamentos), [id]/manutencoes (manutencoes) e [id]/checklist (checklist): todos caem em veiculos/index.
- Entrada morta em EXTRAS: `"/painel/espacos/configuracao"` aponta para uma rota que não existe (src/lib/ajuda/rota.ts:77). Com isso, o artigo espacos/publico não é alcançado por nenhuma tela.

---

## Prints sugeridos (só os críticos)

| Tela | Por quê | Arquivo sugerido |
|---|---|---|
| /painel/espacos/pedidos/[id] com o termo gerado e o cartão "Assinatura do termo" aberto, antes de "Confirmar a cessão" | Mostra a ordem certa (termo e assinatura antes de confirmar), que hoje leva ao erro sem volta | espacos/pedido-termo-antes.png |
| /painel/veiculos/contratos/[id], formulário de cobrança aberto (categoria, fatura lida pela IA, período, valor, linha digitável) | Gera ordem de pagamento, e não há print de contratos | veiculos/contrato-cobranca.png |
| /painel/veiculos/checklists/novo com "Apontamento em aberto" e "O problema permanece?" | checklist.mdx não tem nenhum print | veiculos/checklist-apontamento.png |
| /painel/ferramentas/oficios/[id], rascunho de Filiação, cartão "Pessoas" | É a lista que manda a empresa descontar | ferramentas/oficio-pessoas.png |
| /painel/hospedagem/hoteis/[id], "Usuários do hotel" com a grade de permissões | Define o que o hotel pode fazer | hospedagem/permissoes-hotel.png |
| /painel/hospedagem/cupons com reserva garantida e cupom emergencial | Reenviar e-mail, Copiar link, Cancelar e o selo Emergencial na mesma linha | hospedagem/cupons.png |

Ainda faltam os prints já pedidos na auditoria (linhas 54-55, 73-77, 100-101, 116-117, 122-125, 147, 153-154, 157).

---

## Possíveis defeitos vistos de passagem

**Cessão de espaços**
1. A tela do pedido exige `espacos`/`espacos_gestao`, mas o menu oferece a fila a `espacos_autorizacao` e a action de autorizar só exige esta: o autorizador puro fica sem acesso (pedidos/[id]/page.tsx:45; src/lib/permissoes.ts:614; pedidos/actions.ts:87).
2. Confirmar trava o termo (`podeGerir && !encerrado`): a cessão confirmada sem termo nunca mais o terá (pedidos/[id]/page.tsx:155).
3. Cessão confirmada não pode ser cancelada pela tela (passos.tsx:479).

**Hospedagem**
4. A fatura com ordem cancelada fica presa, e as reservas mantêm `fatura_id` (src/lib/db/hospedagem.ts:1252,1278).
5. O hotel garantido não fatura, e o Início fica zerado (inicio/page.tsx:86-113; hospedagem.ts:1273).
6. Cancelar um cupom reservado não o desvincula da reserva (cupons/actions.ts:192-196).
7. Comparecimento, vínculo e reabertura mudam o custo depois da fatura (hospedagem.ts:967-1047).
8. O erro do login do hotel cita "Esqueci minha senha", mas a aba se chama "Recuperar senha" (src/app/hotel/actions.ts:46).
9. Na garantida, a data de saída do cupom emergencial aceita hoje na tela, e o servidor recusa (emergencial-form.tsx:102; hospedagem-emergencial.ts:137).

**Veículos**
10. A avaliação da infração já vem marcada em "Atividade sindical" (infracao-forms.tsx:268).
11. "Programar preventiva" leva quem tem só Manutenções a uma tela proibida (components/veiculos-manutencao.tsx:37-44; manutencoes/planos/page.tsx:21).
12. Exclusões sem confirmação: "Excluir programação" e "Excluir item" do checklist. Também ficam sem confirmação as exclusões de faixa, bloqueio e regra em Espaços.

**Ferramentas**
13. O módulo aparece para quem tem só "Agenda — criar e editar compromissos" ou só "E-mails institucionais", mas /painel/ferramentas recusa essas duas (src/lib/permissoes.ts:801-812; ferramentas/page.tsx:107-115).
14. "Emitir sem assinatura eletrônica" manda "ajuste" o número, que não é editável (oficios/[id]/page.tsx:~444-447).

**Texto técnico "rode supabase/….sql" para o usuário** (soma-se ao item 11 da auditoria):
- ferramentas/tarefas/page.tsx:214-221 e oficios/page.tsx:92-93;
- hospedagem: hoteis/[id]/usuarios-hotel.tsx:123-126, mapa/page.tsx:140, nao-comparecimentos/page.tsx:87;
- src/lib/db/espacos-esteira.ts:28;
- /recepcao/page.tsx:52-57 (já na auditoria).

**Itens da auditoria anterior**
- Ainda valem: Veículos 1-10 e "Ver a demanda" sem acesso para o relator.
- Não valem mais: "Reenviar e-mail" em ofício (hoje "Reenviar convite") e "Tarefa sem edição" (existe "Editar tarefa").

---

## Contagens

- Telas sem nenhum artigo: **2** (Veículos).
- Lacunas: **P1 = 12**, **P2 = 22**, **P3 = 39**.
  - Veículos: 3/7/7.
  - Ferramentas: 1/6/12 (o P2 inclui a navegação da ajuda).
  - Patrimônio: 0/0/1.
  - Espaços: 3/3/3.
  - Jurídico: 0/1/1.
  - Recepção: 0/0/2.
  - Hospedagem/hotel: 5/5/13.
- Defasados: **11**, mais 1 na descrição do módulo Ferramentas.
- Rotas sem "Ajuda desta tela": 14 do hotel e /recepcao. Com destino ruim: 14 de Ferramentas, 2 de Patrimônio, 2 de Hospedagem e 5 grupos de Veículos, além de 1 entrada morta em EXTRAS.
