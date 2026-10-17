# Plano — nova organização das páginas de Votações (17/10/2026)

> **Implementado em 17/10/2026** (fases A–F; decisões: campanha em todas as fontes, apuração/acompanhar/urnas como abas da assembleia, rodada em abas). Ajustes em relação ao plano: o legado sem rodada (285 assembleias do Bubble) não tem nome, data nem campanha e fica fora da hierarquia; alertas de apuração pendente só das assembleias encerradas nos últimos 60 dias; a trilha do cabeçalho passou a caber numa linha em qualquer largura (todas as telas do painel).

## A hierarquia proposta

```
Votações (painel geral)
└─ Fonte pagadora                         /votacoes/fontes/<empresa>
   └─ Campanha                            /votacoes/campanhas/<id>?fonte=<empresa>
      └─ Rodada de assembleias            /votacoes/rodadas/<id>?fonte=<empresa>
         └─ Assembleia                    /votacoes/assembleias/<id>?fonte=<empresa>
            ├─ Visão geral · Votantes · Urnas e mesários · Apuração   (abas)
```

**Hoje:** Votações (lista de campanhas) › Campanha › Rodada › e três páginas soltas
para a assembleia (Apuração, Acompanhar, Urnas). A assembleia não tem página
própria, e a trilha mostra rótulos genéricos ("Campanhas", "Rodadas de assembleias").

**Mudança:**
- entra o nível **Fonte pagadora**;
- a **assembleia** ganha página própria, que reúne o que hoje está espalhado;
- **as rotas atuais continuam valendo**: nenhum link salvo, e-mail ou favorito quebra,
  e a de "Acompanhar" passa a redirecionar para a aba da assembleia.

---

## Nível 1 — Votações (painel geral)

**Indicadores (faixa do topo)**
- Campanhas abertas.
- Rodadas em curso.
- Assembleias **abertas agora**.
- Assembleias que abrem nos próximos 7 dias.
- Participação média das últimas 5 votações.
- Aptos sem link nas votações abertas ou próximas.

**Alertas (só aparecem quando há o que fazer; cada um leva ao lugar exato)**
- Aptos sem link pessoal com a votação a 48 h ou aberta *(já existe)*.
- Pessoas repetidas na lista de aptos.
- Votação abrindo em até 7 dias sem perguntas, sem aptos ou sem assembleia.
- Envio automático dos links desligado numa rodada que abre em até 72 h.
- Assembleia encerrada com a **apuração não encerrada**.
- Voto em separado **sem decisão**.

**"Agora e a seguir"** — assembleias em curso e as próximas, com:
- fonte e campanha;
- contagem regressiva ("termina em 5 h 12 min" / "abre em 2 dias");
- participação ao vivo (votaram/aptos — **nunca o resultado**);
- atalho direto para a assembleia.

**Fontes pagadoras com campanhas** (lista principal)
- Colunas:
  - fonte (selo do grupo empresarial);
  - nº de campanhas, abertas e encerradas;
  - última votação e situação dela;
  - próxima votação;
  - participação média;
  - aptos na última rodada.
- Filtros:
  - busca por nome ou CNPJ;
  - grupo empresarial;
  - situação (com campanha aberta, só encerradas);
  - período (ano);
  - com votação nos próximos 7 dias.
- Ordenação: nome, última votação, próxima votação, nº de campanhas, participação.
  Paginação.
- Linha **"Sem fonte pagadora"** para campanhas sem vínculo (as do legado).
- Ao voltar de uma fonte, a lista reabre com os filtros de antes (padrão `LembrarLista`).

**Atalhos que ficam no topo:** Nova campanha · Link único · Entrega das votações.

## Nível 2 — Fonte pagadora

**Cabeçalho**
- Nome, CNPJ e selo do grupo.
- Link para a ficha do empregador.
- Link para os **acordos coletivos** da fonte. É o que costuma estar em votação
  (ACT, termo aditivo).

**Indicadores**
- Campanhas; rodadas; assembleias realizadas.
- Participação média e a da última votação.
- Variação de aptos ao longo do tempo.
- % que votou sem código (entrega).

**Gráfico de participação** por assembleia (linha do tempo): mostra se a base está
votando mais ou menos.

**Campanhas da fonte**
- Colunas: tema, situação, rodadas, última rodada e resultado (aprovada/rejeitada),
  participação, período.
- Filtros por situação e ano; ordenação.
- Também aparecem as campanhas **compartilhadas com outras fontes**, com o selo
  "também: X".

**Alertas da fonte:** o mesmo conjunto do painel geral, filtrado.

## Nível 3 — Campanha

**Cabeçalho:** tema, situação, fontes (chips — clicar troca o contexto de fonte).

**Linha do tempo das rodadas.** Ex.: "1ª rodada 07/10 — rejeitada → 2ª rodada
14/10 — aprovada".
- Cada rodada mostra situação, período, aptos, participação e o resultado de cada
  pergunta, quando apurada.

**Indicadores:** total de rodadas, aptos (última), votantes, participação, resultado
final da campanha.

**Dados da campanha** (editar), recolhidos num cartão lateral. O conteúdo de hoje
continua, só sai do caminho.

**Próxima ação sugerida**, por exemplo:
- "a 2ª rodada abre amanhã e 12 aptos estão sem link";
- "apuração da 1ª rodada a encerrar".

## Nível 4 — Rodada de assembleias

É a página atual, reorganizada em **abas** (o endereço guarda a aba, então voltar e
recarregar não perdem o lugar). Hoje é uma página muito longa.

- **Visão geral:**
  - indicadores (aptos, votaram, participação, sem link, repetidos);
  - lista das **assembleias** com situação e contagem regressiva;
  - alertas da rodada (sem link, repetidos).
- **Aptos:**
  - a lista completa: busca, filtros de voto e de link, importar, cadastrar;
  - exclusão em massa, unificar repetidos, link pessoal por pessoa.
  - Vale para todas as assembleias da rodada, como hoje.
- **Perguntas:** perguntas e opções (travadas depois do primeiro voto, como hoje).
- **Divulgação:**
  - card e edital (enviar e ver);
  - aviso por e-mail aos aptos e envio automático;
  - link geral.

**Navegação lateral:** setas **‹ rodada anterior · próxima ›** da mesma campanha.

## Nível 5 — Assembleia (página nova)

**Cabeçalho**
- Nome, modalidade, situação.
- **Contagem regressiva para o fim** (ou para a abertura), atualizando sozinha.
  No fim, vira "Encerrada — apurar".
- **Abas irmãs:** chips das outras assembleias da mesma rodada, para trocar sem
  voltar.

**Visão geral**
- Informações: período e horários, sala virtual (link, data e hora), "somente
  filiados", voto em separado, ata.
- Indicadores ao vivo: aptos, votaram, participação, votos por hora (gráfico
  simples). **Sem resultado antes do fim**, como hoje.
- **Entrega** (cartão da fase 4): link, canal, códigos.
- Ações: prorrogar, anexar ata, copiar link de voto.

**Votantes**
- A relação de quem votou: nome, CPF, matrícula, canal (link pessoal, código,
  portal, urna) e hora.
- Busca, ordenação, paginação.
- Exportar (PDF de votantes que já existe).
- Também "quem ainda não votou", com o atalho para mandar o link pessoal.

**Urnas e mesários** (só presencial ou híbrida): o que hoje é a página de urnas e o
"Acompanhar" (votos por urna, lacres, votos em separado).

**Apuração** (aparece depois do término): a apuração atual — contagem, votos em
separado, encerrar e reabrir, relatórios.

---

## Navegação e retorno (em todas as páginas)

1. **Trilha com nomes reais**:
   `Votações › Baker Hughes › ACT 2026/2028 › 2ª rodada › Assembleia online`.
   Hoje mostra "Campanhas" / "Rodadas de assembleias". Nomes longos são abreviados
   com o completo no hover.
2. **O caminho de volta não se perde**:
   - Uma campanha pode ter várias fontes. Por isso a fonte de onde a pessoa veio
     viaja no endereço (`?fonte=`) por toda a descida, e a trilha e o "Voltar"
     sobem por ela.
   - Sem o parâmetro (link colado, favorito), a trilha usa a fonte da campanha, ou
     a primeira se forem várias.
3. **Botão "←" de cada página** volta ao nível pai, com o contexto. Nas listas com
   filtro, reabre com os filtros de antes.
4. **Lateralidade:**
   - setas entre rodadas da campanha;
   - chips entre assembleias da rodada;
   - na fonte, um seletor "outras campanhas desta fonte".
5. **Abas no endereço** (`?aba=aptos`): voltar do navegador volta para a aba certa.
6. **Celular:** tabelas viram cartões, trilha encurta para "← nível pai", abas
   roláveis.

## O que acrescentei ao pedido

- Nível **"Sem fonte pagadora"** para não perder campanhas antigas.
- **Alertas acionáveis** em cada nível (os das fases 1–4 do plano de adequação, mais
  apuração pendente e votação sem perguntas ou aptos perto de abrir).
- **Linha do tempo de rodadas** na campanha e **gráfico de participação** na fonte —
  o que mais ajuda na análise de uma negociação.
- **Votos por hora** na assembleia (mostra quando a base vota, para planejar
  lembretes).
- **Abas** na rodada e na assembleia, no lugar de páginas longas.
- **Página única da assembleia**, juntando Apuração, Acompanhar e Urnas.
- Link para os **acordos coletivos** da fonte.

## Fases de implementação (sem SQL previsto)

| Fase | Entrega | Esforço |
|---|---|---|
| A | Trilha com nomes reais + contexto `?fonte=` + página da **assembleia** (abas, contagem regressiva, votantes) + redirecionamento do "Acompanhar" | médio |
| B | **Painel geral** novo: indicadores, alertas, "Agora e a seguir", lista de fontes com filtros | médio |
| C | Página da **fonte pagadora** (indicadores, gráfico, campanhas) | médio |
| D | **Campanha** com linha do tempo, indicadores e próxima ação | pequeno |
| E | **Rodada** em abas + setas entre rodadas | pequeno |
| F | Manual (Votações), ajustes de celular e conferência ponta a ponta | pequeno |

**Cuidados**
- Os indicadores agregados (participação por fonte, por campanha) somam muitas
  rodadas. Usar contagens no banco e leituras em lotes (teto de 1.000 linhas do
  PostgREST).
- Se ficar lento, criar uma visão no banco na fase C.
- O resultado nunca aparece antes do fim da assembleia, em nenhum nível.
- Nada muda nas telas do eleitor (`/votar`, portal) nem do mesário.

## Decisões para confirmar

1. Campanha com várias fontes aparece **em todas elas** (recomendado), com o selo
   "também: X".
2. Apuração, Acompanhar e Urnas viram **abas da página da assembleia**
   (recomendado). As rotas antigas continuam funcionando.
3. Rodada **em abas** (recomendado) ou continua numa página só, com as duas colunas
   de hoje.
4. Por onde começar: **A** (assembleia + navegação) traz o maior ganho de uso no dia
   a dia; **B** é a mudança mais visível.
