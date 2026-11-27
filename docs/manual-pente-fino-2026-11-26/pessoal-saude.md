# Pessoal (src/app/painel/pessoal/**) e Saúde (src/app/painel/saude/**)

Rotas conferidas: 123 (104 do Pessoal e 19 da Saúde). Artigos lidos: pessoal/index, funcionarios, contracheques, ponto, ferias, anuenios-niveis, diarias, atestados-aso, faltas, treinamentos, atribuicoes-sst, reembolsos, plano-saude, informes, movimento-folha; saude/index, cat, indicadores, cipa, atendimentos; introducao/meu-perfil.

Método: listei as 123 `page.tsx` e as 30 `actions.ts` da fatia, com todas as ações exportadas. Com um script, comparei com o texto de todos os MDX de `src/conteudo/ajuda` os rótulos de todos os `.tsx` da fatia: textos de JSX, `label`/`title`/`placeholder`/`rotulo`, o miolo de `<Button>`/`TabsTrigger`/`SelectItem` e os textos de `confirmarEnvio`. Depois li à mão o que sobrou e as seções dos artigos que cobrem cada ação.

**Conclusão geral:** esta fatia é das mais bem cobertas do manual. Quase todos os botões, abas, filtros e confirmações das duas áreas estão no texto, muitos com print, e Ponto, Férias, Diárias, Contracheques, Atribuições e SST e CAT estão minuciosos. O que falta está concentrado em quatro lugares: a **fatura do plano de saúde** (botões novos da Fase 3), o **lançamento de anuênio**, a **entrada de funcionário novo** e as **exclusões na Saúde** (CIPA, agenda, tipos). Some-se a isso o **"Ajuda desta tela"**, que manda várias telas ao índice da área, embora o artigo certo exista.

## Telas sem nenhum artigo

Nenhuma. Todas as 123 telas são tratadas por algum artigo, inclusive Carreira (em anuenios-niveis.mdx), Movimento da folha, Profissionais, Assistidos e Agenda (em saude/atendimentos.mdx). O problema destas últimas é o mapeamento do botão de ajuda (veja "Rotas sem Ajuda desta tela").

## Lacunas em telas que têm artigo

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/pessoal/plano-saude/fatura | Cartão **Incluir no plano quem está na fatura**, botão **Incluir os N sugeridos** e **Incluir** por linha (com "sugerido pelo nome" / "sem sugestão") | ausente | Linha da fatura sem ninguém do plano pode ser incluída dali, com produto e data de inclusão, e a carteirinha vem da fatura. A sugestão é **só pelo nome**: conferir cada linha antes de incluir em massa, porque a pessoa errada passa a ter desconto em folha. Agregados e quem não está no cadastro só entram pela página do contrato. | pessoal/plano-saude.mdx › A fatura da operadora | P1 | src/app/painel/pessoal/plano-saude/fatura/page.tsx:241-290; fatura/forms.tsx:236-258 (confirmação: "pessoas sugeridas pelo nome? Confira antes a lista") |
| /painel/pessoal/anuenios/novo e /anuenios/[id] | **Novo lançamento** do anuênio: **Nível do anuênio \***, **Vale desde \***, aviso "O próximo nível é calculado automaticamente: um degrau acima, um ano depois desta data" | parcial / impreciso | O passo "Lançamento e progressão" não diz como lançar nem quais campos usar. Também diz que "a progressão é automática", mas o que é automático é só o **cálculo do próximo** ao salvar. Não foi achada rotina que mude o degrau sozinha na data (já na auditoria 11/2026 como "precisa de confirmação"). Quem lê pode achar que o adicional muda sozinho e deixar de lançar o avanço, com efeito na folha. | pessoal/anuenios-niveis.mdx:81-84 e 99-100 ("O anuênio não avançou sozinho… vai para o degrau seguinte na data do próximo") | P1 | src/app/painel/pessoal/anuenios/lancamento-form.tsx:122-153; anuenios/page.tsx:84-89 |
| /painel/pessoal/funcionarios e /painel/pessoal/[id] | Como um funcionário **novo** entra no quadro | ausente no artigo (já na auditoria 11/2026) | Não há botão de inclusão no Pessoal. A pessoa entra por Gestão → Usuários (Nova pessoa com o vínculo com a entidade), e o artigo Funcionários não aponta para esse caminho. Sem isso, quem lê não sabe incluir um funcionário. | pessoal/funcionarios.mdx (novo passo "Incluir um funcionário" com link para gestao/usuarios) | P1 | src/app/painel/pessoal/funcionarios/page.tsx:127-190 (sem botão de inclusão); src/conteudo/ajuda/gestao/usuarios.mdx:23 |
| /painel/pessoal/plano-saude/fatura | **Ler de novo** | ausente | Ler de novo **substitui** a leitura do mês e desfaz os casamentos feitos à mão (há confirmação). | pessoal/plano-saude.mdx › A fatura da operadora | P2 | fatura/forms.tsx:41,55 |
| /painel/pessoal/plano-saude/fatura | **Desfazer a conferência** | ausente | A fatura marcada como conferida pode ser reaberta. Só sem conferência aparece **Apagar a leitura**. | pessoal/plano-saude.mdx | P2 | fatura/forms.tsx:115-130; fatura/page.tsx:389 |
| /painel/pessoal/plano-saude/fatura | **Lançar a coparticipação da fatura** | parcial | Falta dizer que o valor já lançado de cada titular no mês é **substituído** (a confirmação avisa, o artigo não). | pessoal/plano-saude.mdx:103-105 | P2 | fatura/forms.tsx:99-110 |
| /painel/pessoal/[id] | Cartão de dependentes ("Nenhum dependente registrado.", colunas Nome, Parentesco, Situação) | parcial | A ficha só mostra os dependentes. Eles se cadastram pelo Plano de saúde ("O dependente também entra no cadastro do funcionário em Pessoal"). O artigo cita "os dependentes" sem dizer onde incluir. | pessoal/funcionarios.mdx › Abrir a ficha | P2 | src/app/painel/pessoal/[id]/page.tsx:210-235; plano-saude/forms.tsx:683 |
| /painel/saude/cipa/[id] | **Excluir** (a reunião) | ausente | A exclusão apaga o registro da reunião, que o artigo trata como prova ("o registro é o convite"). É **imediata, sem confirmação** e sem desfazer. O artigo não fala em excluir. | saude/cipa.mdx | P2 | src/app/painel/saude/cipa/[id]/page.tsx:95; cipa-forms.tsx:387-400; src/lib/db/cipa.ts:227-233 |
| /painel/pessoal/anuenios | **Informado à contabilidade** (caixa no lançamento) e **Filtrar por contabilidade** / "Contabilidade — todos" | parcial | O artigo diz que o lançamento fica "Informado ou Pendente", mas não diz que se marca na caixa do formulário nem que a lista filtra e ordena por isso. | pessoal/anuenios-niveis.mdx:85-88, 105-106 | P3 | anuenios/lancamento-form.tsx:156-163; anuenios/lancamentos-lista.tsx:117-120; anuenios/page.tsx:137 |
| /painel/pessoal/plano-saude/fatura | **Apagar a leitura** | ausente | Apaga a leitura da fatura do mês (só antes de conferida), para começar de novo. | pessoal/plano-saude.mdx | P3 | fatura/forms.tsx:148-156; fatura/page.tsx:389 |
| /painel/pessoal/diarias/contas | **Novo tipo de despesa** (Nome, Ordem, Descrição (opcional)) | parcial (só no alt do print) | Como criar um tipo de despesa extra e para que serve a ordem. | pessoal/diarias.mdx › Despesas extras e centros de custo | P3 | src/app/painel/pessoal/diarias/contas/contas-forms.tsx:124-170; contas/page.tsx:232-240 |
| /painel/saude/cipa/[id] | Lixeira do representante (remover) | ausente | Remove o representante da reunião. Hoje o artigo só fala em incluir e em Compareceu/Desfazer. | saude/cipa.mdx › Registrar uma reunião | P3 | cipa-forms.tsx:345-362 |
| /painel/saude/agenda | **Excluir agendamento** | ausente | Apaga o agendamento, sem confirmação. | saude/atendimentos.mdx › Agenda | P3 | src/app/painel/saude/agenda/agenda-forms.tsx:125-140 |
| /painel/saude/profissionais | **Excluir tipo** | ausente | Só exclui tipo sem profissional e sem atendimento; senão, recusa. | saude/atendimentos.mdx › Profissionais e tipos | P3 | profissionais/profissionais-forms.tsx:50-61; src/lib/db/atendimentos.ts:1175-1185 |
| /painel/pessoal | Cartão **Plano de saúde** | ausente na tabela de permissões | A tabela "Abre para" do índice não tem a linha do Plano de saúde (o cartão só aparece para Gestão de pessoal). | pessoal/index.mdx:10-21 | P3 | src/app/painel/pessoal/page.tsx:304-311 |

Contagem: P1 = 3, P2 = 5, P3 = 7. Defasado = 1 (a "progressão automática" do anuênio, contada também como P1).

## Rotas sem "Ajuda desta tela"

Pela regra de `src/lib/ajuda/rota.ts`, estas rotas caem no **índice da área**, embora exista artigo próprio:

- /painel/pessoal/funcionarios e /painel/pessoal/[id] → deveriam ir a pessoal/funcionarios. Não existe `/painel/pessoal/funcionarios` em MODULOS, e EXTRAS não tem a rota.
- /painel/pessoal/carreira/** → pessoal/anuenios-niveis
- /painel/pessoal/anuenios/** → pessoal/anuenios-niveis. EXTRAS só tem /niveis.
- /painel/pessoal/contabilidade/** → pessoal/movimento-folha. O slug é diferente do segmento da rota e não há EXTRA.
- /painel/saude/profissionais, /painel/saude/assistidos/**, /painel/saude/agenda → saude/atendimentos
- Autosserviço (Meu perfil), que cai no artigo genérico introducao/meu-perfil: /painel/perfil/ferias → pessoal/ferias; /perfil/faltas → pessoal/faltas; /perfil/ponto → pessoal/ponto (o motivo do uso fora do expediente está lá); /perfil/ausencias e /perfil/asos → pessoal/atestados-aso; /perfil/treinamentos → pessoal/treinamentos; /perfil/informes → pessoal/informes; /perfil/carreira → pessoal/anuenios-niveis; /perfil/diarias e /perfil/diarias/historico → pessoal/diarias; /perfil/plano-saude → pessoal/plano-saude. Só /perfil/reembolsos e /perfil/contracheques estão mapeadas.

Todas as outras rotas da fatia caem no artigo certo, pela regra geral ou pelas EXTRAS.

## Prints sugeridos (só os críticos)

| Tela | Por quê | Arquivo sugerido |
|---|---|---|
| /painel/pessoal/plano-saude/fatura com linhas sem ninguém do plano | Mostrar o cartão "Incluir no plano quem está na fatura", com "sugerido pelo nome" e o botão Incluir os N sugeridos. Inclusão errada vira desconto em folha | pessoal/plano-saude-fatura-incluir.png |
| /painel/pessoal/anuenios/novo | Formulário do anuênio com Nível do anuênio, Vale desde, o aviso do próximo calculado e Informado à contabilidade. Hoje a seção Anuênios não tem print do lançamento (o de anuenios-registro mostra a edição) | pessoal/anuenios-lancamento.png |

## Possíveis defeitos vistos de passagem

- **Excluir reunião da CIPA** e **Excluir agendamento** apagam de vez, com um clique e sem `confirmarEnvio`, ao contrário do resto do sistema. A reunião é registro de prova. Evidência: saude/cipa/cipa-forms.tsx:387-400; src/lib/db/cipa.ts:231; saude/agenda/agenda-forms.tsx:125-140.
- Anuênio: a tela diz que o próximo "é calculado automaticamente" e o manual, que "a progressão é automática", mas não foi achada rotina que avance o degrau na data. Se ela não existe, o manual e a tela induzem ao erro (já levantado na auditoria 11/2026, ainda sem confirmação).
- O que segue em aberto da auditoria 11/2026 (sigilo do autor do atendimento, Movimento da folha para quem só tem Gestão, `pessoal_registro_ponto` sem uso, Painel analítico para quem só tem Atendimentos, "rode supabase/*.sql") não foi reconferido aqui.
