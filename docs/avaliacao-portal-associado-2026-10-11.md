# Avaliação do Portal do Associado — 11/10/2026

Varredura de layout e funcionalidades da área logada do filiado (`src/app/portal`), feita
pela ótica de **quem paga a conta**: o associado que tem a contribuição descontada todo mês
e espera transparência, serviços e ser bem informado.

**Como foi feita.** 19 revisores independentes (12 por grupo de páginas + 7 lentes
transversais: navegação/largura, celular, avisos, perspectiva do pagante, acessibilidade,
consistência, bugs) leram o código e as capturas de tela reais (800 px, 1920 px e 375 px,
tenant demo). Saíram **280 achados brutos → 204 únicos → 187 confirmados** por dois
verificadores céticos por achado (um checa a evidência no código, o outro julga o valor para
o associado); **17 foram rejeitados** (premissa errada, já existe, ou preciosismo). Os 187
estão na tabela do fim; a versão completa (descrição, evidência, proposta e ajustes de cada
um, mais os rejeitados com o motivo) está em
[avaliacao-portal-associado-2026-10-11-anexo.md](avaliacao-portal-associado-2026-10-11-anexo.md).

Resumo por severidade: **29 altas · 115 médias · 43 baixas**. Por esforço: **120 pequenos
(< 1 h) · 64 médios · 3 grandes**. Por categoria: funcionalidade 45 · bug 32 · conteúdo 22 ·
consistência 22 · navegação 18 · layout 17 · avisos 16 · acessibilidade 15.

---

## 1. Diagnóstico em cinco linhas

1. **A casca não cabe na tela nem usa a tela.** O menu de 15 itens é uma linha com
   `overflow-x-auto` presa a um container de 1024 px (`max-w-5xl`), então estoura em 800 px
   **e também em 1920 px** — o limite é o container, não o monitor. Em 1920 o conteúdo ocupa
   ~53 % da largura; entre 768 e 1023 px (tablets) a barra inferior some e sobra só a linha
   estourada com alvos de 32 px (A18, A27, A117, A137).
2. **O portal esconde o dinheiro.** A página inicial não diz se a contribuição está em dia;
   Contribuição e Carteirinha nem aparecem na grade de serviços; "Contribuição" e
   "Atendimento" ficam atrás de "Mais" no celular. E quando a pessoa chega à Contribuição,
   a regra de faltas **mente**: compara com remessas de toda a entidade (inclusive a
   competência corrente e futura — a captura de 10/10 acusa "11/2026") e a situação
   "Em dia/Em atraso" vem de um cache global sem chave de tenant (A2, A5, A22, A24, A55, A57).
3. **Os avisos cobrem o secundário e pulam o essencial.** Há sino e e-mail para reserva de
   hotel e assembleia, mas nada para "sua contribuição não veio na remessa", resposta
   iniciada no atendimento, resultado da oposição, cancelamento de reserva pela equipe ou
   não comparecimento. Push existe só para a gestão; o manifest do PWA manda o associado
   para `/painel` (A20, A21, A52, A56, A58).
4. **Vários fluxos terminam em beco sem saída.** Login promete link e entrega código sem
   campo para digitar; quem cancela inscrição nunca se reinscreve; "Desistir da oposição"
   tranca o trabalhador fora da campanha; votar não mostra comprovante; link do e-mail cai
   no login e depois no Início (A1, A10, A14, A46, A30).
5. **Falta a espinha dorsal técnica da área:** não há `layout.tsx` nem `loading.tsx` em
   `/portal` — cada página monta o `PortalShell` à mão (a prop `preview` foi esquecida em
   3 delas e expulsa o atendente do "Ver como filiado"), a tela de erro perde o menu e nada
   acontece entre o clique e a página (A29, A65, A67).

---

## 2. Decisão: navegação e largura (a queixa principal)

**Recomendação única: sidebar fixa a partir de `lg` (1024 px), barra inferior até `lg`,
container de 1280 px (1536 px em telas 2xl), menu em grupos.**

Por quê, e não as alternativas:

| Opção | Prós | Contras | Veredito |
|---|---|---|---|
| **Sidebar em lg+** (reaproveitar `components/ui/sidebar.tsx`, já usado pelo painel) | 15 itens cabem com folga (~700 px em coluna); página atual sempre visível; libera o cabeçalho; colapsa em ícone com tooltip; tokens navy prontos (`bg-sidebar`) | 256 px de largura (mitigado pelo colapso e pelo container maior); lembra o painel (mitigado por grupos em linguagem do associado e sem busca global) | **Adotar** |
| Grupos com dropdown na linha horizontal | Pouca mudança | Esconde 10 itens atrás de um clique a mais; fraco para descoberta; ainda estoura em `md` | Descartar |
| Prioridade + overflow ("mais" dinâmico) | Cabe em qualquer largura | Exige `ResizeObserver` no cliente (pisca no SSR) e muda itens de lugar conforme a largura, quebrando a memória espacial de quem usa todo mês | Descartar |

### Como fica por breakpoint

| Largura | Navegação | Conteúdo |
|---|---|---|
| < 1024 px (celular e tablet) | Barra inferior (56 px de alvo) + folha "Mais" **agrupada**. Trocar `md:hidden` por `lg:hidden` em `PortalNavInferior`; apagar `PortalNav` | `max-w-7xl px-4 md:px-6` |
| ≥ 1024 px | `<Sidebar collapsible="icon">` com grupos, badge de não lidos em Avisos, Ajuda e conta no rodapé | `max-w-7xl` dentro de `SidebarInset` (256 + 1280 = 80 % de 1920) |
| ≥ 1536 px | idem | `2xl:max-w-8xl` (declarar `--container-8xl: 96rem` no `@theme` do `globals.css`) |

### Esboço da casca

```tsx
// src/app/portal/layout.tsx  (novo — hoje não existe; resolve A29, A65, A67 de uma vez)
<SidebarProvider cookieName="portal_sidebar">          {/* cookie próprio: não herdar o estado do painel */}
  <div className="hidden lg:contents">                  {/* nada de sidebar entre md e lg */}
    <PortalSidebar grupos={GRUPOS} naoLidos={naoLidos} entidade={entidade} />
  </div>
  <SidebarInset>
    {vis?.preview && <FaixaVisualizacao … />}          {/* derivada de getVisualizacaoPortal(), sem prop */}
    <header className="bg-background sticky top-0 z-(--z-sticky) flex h-14 items-center gap-2 border-b px-4">
      <Marca variante="completa" tenant={entidade} />  {/* nome do sindicato, não só "Confluir" (A31) */}
      <span className="lg:hidden font-medium">{tituloDaSecao}</span>   {/* celular sabe onde está (A174) */}
      <div className="ml-auto flex items-center gap-1"> sino · tema · Sair </div>
    </header>
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:px-6 md:py-8 lg:pb-8 pb-28 2xl:max-w-8xl">
      {children}
    </main>
    <PortalNavInferior fixos={fixos} grupos={GRUPOS} className="lg:hidden" />
  </SidebarInset>
</SidebarProvider>
```

Cuidados apontados pela verificação: (1) o primitivo `Sidebar` vira `Sheet` abaixo de 768 px —
**nunca** expor `SidebarTrigger` no portal, a barra inferior continua sendo a única navegação
do celular; (2) o cookie `sidebar_state` é o mesmo do painel — usar nome próprio; (3) páginas
que hoje chamam `PortalShell` passam a devolver só o conteúdo; a página de login
(`/portal/page.tsx`) fica fora do layout (route group `(logado)` ou checagem no layout).

### Grupos e rótulos do menu (A116, A118, A125)

| Grupo | Itens | Observações |
|---|---|---|
| — | Início | |
| **Eu** | Meu cadastro · Carteirinha · Contribuição | |
| **Serviços** | Hospedagem · Convênios · Saúde | Hospedagem e Convênios somem quando o tenant não tem hotel/convênio vigente (A57) |
| **Participar** | Votação · Eventos · Notícias | |
| **Falar com o sindicato** | Atendimento · Avisos | |
| **Mais** | Oposição à contribuição → "Contribuição assistencial" (só com campanha aberta/relevante) · LGPD → "Privacidade e dados" · Ajuda | A Oposição precisa rodar **dentro** da casca para o filiado logado (A17) |

Definir os grupos no próprio `NAV` (campo `grupo`) e reutilizar na sidebar e na folha "Mais".

### Barra inferior do celular (A57)

Hoje: Início · Carteirinha · Hospedagem · Avisos · Mais. **Proposto:** Início · **Contribuição** ·
Carteirinha · **Atendimento** · Mais — Avisos já tem o sino com badge no cabeçalho em todas as
larguras; Hospedagem só entra se houver hotel (calcular `fixos` no servidor, onde o shell já
roda consultas em paralelo).

---

## 3. Plano por ondas

Códigos referem-se à tabela do fim. Cada onda é independente e entregável sozinha.

### Onda 0 — bugs que mentem para quem paga (hoje; quase tudo "pequeno")

- **A5 + A22 + A72 + A24 — Contribuição.** `minhaContribuicao` (`src/lib/db/carteirinha.ts:149-181`): (a) só considerar `ordem < ordemHoje` (competência corrente e futura nunca contam como falta — a captura de 10/10 acusa 11/2026); (b) uma remessa só "chegou" para a pessoa se tem linha de uma fonte em que ela tem vínculo aberto (refatorar `fontesAbertas` para devolver ids e consultar `filiacao_recebe` por `remessa_id` + `fonte_pg_id`), devolvendo dois estados — "a remessa da sua fonte ainda não chegou" (informativo) e "chegou e você não consta" (ação); (c) trocar o `let cache` global de `filiacao-inadimplencia.ts:61` por `Map` chaveado por tenant; (d) criar `inadimplenciaDoCpf(cpf)` para o portal não apurar a entidade inteira a cada abertura (e não mostrar "Em dia" quando a apuração falha).
- **A19 — e-mail de cobrança Pix no tick** busca o filiado no tenant padrão (`portal-avisos.ts:102-109`): passar `email` nos selects de `gerarCobrancas`/`baixarCobranca` e resolver o cadastro com o `client`/`tenantId` já em mãos; só carimbar `avisada_em` quando o e-mail saiu.
- **A3 + A89 — Votação.** Banner da home e cédula tratam "ainda não abriu" e "carência" como abertas: extrair `estadoVotacao(a)` e usar nos dois lugares.
- **A11 — híbrida** sem voto online: `const online = temVotoOnline(modalidade)` em `votacao-portal.ts:398` e `:957`.
- **A10 — reinscrição** após cancelar: tratar `cancelada` como "não inscrito" em `eventosParaFiliado` e fazer `update` em `inscreverFiliado` (não reabrir `recusada`).
- **A12 — anexo "até 10 MB" corta em 4 MB** (`next.config.ts` `bodySizeLimit`): hoje, checar `file.size` no `onChange`, alinhar as três promessas a 4 MB e reduzir fotos no navegador (reaproveitar `prepararArquivo` de compras); depois, envio direto ao Storage como em `representacao-reunioes.ts`.
- **A9 + A133 + A141 + A29 — "Ver como filiado".** Saúde expõe especialidade do atendimento à equipe de filiação (não chamar `meusAtendimentos` em preview); Declaração PDF e "Baixar meus dados" ficam clicáveis e devolvem 401 ou os dados do gestor; e o `PortalShell` deve derivar o banner de `getVisualizacaoPortal()` em vez da prop `preview` esquecida em 3 páginas (notícia e ajuda usam `requireSessaoPortal` e expulsam o atendente para o login).
- **A56 — PWA aponta para `/painel`.** Manifest próprio em `src/app/portal/manifest.webmanifest/route.ts` (`start_url: /portal/inicio`, `scope: /portal`, nome da entidade) e fallback do `sw.js` para `/`.
- **A14 — "Desistir da oposição"** sem confirmação grava registro permanente: confirmação (`confirmarEnvio`), rótulo "Não quero me opor", e `registrarOposicao` atualiza a linha desistente dentro do prazo.

### Onda 1 — casca e navegação (1 a 2 dias)

- **A18 + A27 + A116 + A57 + A65 + A67 + A31 + A174** — tudo o que está na seção 2: `layout.tsx`, sidebar em lg+, container 7xl/8xl, grupos, barra inferior nova, `loading.tsx` com esqueleto (há `components/layout/esqueleto-hub.tsx` para copiar), `error.tsx` dentro da casca, nome da entidade no cabeçalho, seção atual no cabeçalho do celular.
- **A17 + A125** — as três páginas da Oposição dentro do `PortalShell` quando a sessão é de filiado (mínimo em 30 min: trocar "Sair" por "Voltar ao portal").
- **A28 + A119 + A137** — `components/ui/select-nativo.tsx` com a classe do `Input` (foco visível, `pointer-coarse:h-11`) substituindo as cinco constantes `SELECT`; botões de ação com 28–40 px nas hospedagens, votação e eventos sobem para o `Button` padrão (DESIGN.md: 44 px no toque).
- **A127** — link "Pular para o conteúdo" antes do cabeçalho.
- **A136** — link de ajuda contextual no cabeçalho de cada página (o manifesto da ajuda já sabe o artigo por área).

### Onda 2 — quem paga: contribuição, avisos e atendimento (3 a 5 dias)

**Contribuição**
- **A2** — faixa "Minha situação" na home (badge em dia/faltas/atraso, última contribuição, cobrança Pix em aberto) reaproveitando `minhaContribuicao` e `cobrancasDoFiliado` com `.catch(() => null)`; extrair `situacaoContribuicao(c)` para home e página não divergirem.
- **A6 + A124** — "Em atraso" com as competências em falta, último pagamento reconhecido, se os benefícios **já** estão suspensos ou só em risco, e a regra da entidade em uma linha.
- **A23** — botão "Avisar o sindicato" nos dois alertas → `/portal/atendimento?assunto=contribuicao&titulo=Desconto de MM/AAAA não localizado`; novo assunto "Contribuição" em `ASSUNTOS_ATENDIMENTO`; rótulo do anexo "Anexe o contracheque do mês".
- **A60 + A126 + A74** — "quanto e como você paga" (forma de recebimento e valor previsto já existem no banco), previsão do primeiro desconto para recém-filiado, histórico de cobranças Pix pagas.
- **A61 + A177** — extrato/declaração anual em PDF (há `@react-pdf/renderer` e a declaração de filiação como modelo); histórico com filtro por ano; "Últimos 12 meses" só da mensalidade.
- **A64 + A161 + A147** — tirar informação financeira de `text-xs` apagado; vocabulário ("remessa", "competência") explicado ou trocado; badge de situação com variantes do design system.

**Avisos** — ver a matriz da seção 4. Em ordem: **A20** (folha: "não localizada na remessa" ao fechar a remessa), **A21** (hospedagem: cancelamento pela equipe e não comparecimento, com e-mail), **A30** (`?next=` do login para o link do e-mail cair no item certo), **A59** (avisos levam ao item, não à lista), **A33** (home mostra o que a entidade respondeu), **A49/A58/A121/A122** (votação: último dia e resultado; decisões sobre a pessoa; atendimento: recibo com prazo; eventos: recibo e véspera), **A102** (lembrete de Pix vencendo e de vaga expirando), **A52** (push para o associado: coluna `cpf` em `push_assinaturas`, rota `/api/portal/push/assinar` com `getSessaoPortal`, card "Receber no celular" em preferências).

**Atendimento**
- **A13** — sincronizar a Demanda com a solicitação: "Fazendo" → `em_andamento` + sino; "Feito" sem resposta → bloquear com link para responder.
- **A50** — erro de validação não pode apagar o que o associado escreveu (`useActionState` devolvendo os valores).
- **A51 + A94 + A96** — marcos de situação na conversa, "Resposta até" some depois de respondida, mais de um anexo e `capture="environment"` no celular.
- **A95 + A97** — respondidas sobem na lista e a home destaca resposta pendente; associado pode encerrar/reabrir.

### Onda 3 — serviços (hospedagem, votação, eventos, saúde, convênios)

- **Hospedagem:** A7 (oferta da lista de espera em destaque no topo, botão na linha da reserva), A8 (tarifa antes de pedir — atenção: `hospedagem_tarifas` não tem tenant, filtrar pelos hotéis do tenant), A37 (formulário antes da parede de regras — regras em `Accordion`), A38 (cota/suspensão/sexo antes de enviar), A39/A40/A41 (o que o hotel confirmou, próximo passo, contato do hotel, horário de check-in), A75 (hotel com convênio vencido no seletor), A134 (fila de espera executada no GET).
- **Votação:** A46 (comprovante aparece ao votar), A47 (link da sala virtual), A48 (horário das presenciais), A90/A91 (página sem assembleia começa pela explicação, e-mail de votação vira seção secundária), A92 (confirmação antes do voto irreversível), A93 (contagem a zero desabilita "Votar").
- **Eventos/Notícias:** A44 (foto obrigatória pendente), A45 (código de entrada dentro do portal), A81/A132 (desistir de pendente/espera com confirmação), A82 ("Não vou poder ir" libera a vaga ou muda o texto), A84 (adicionar ao calendário `.ics`), A135 (eventos passados filtrados; corte pelos mais recentes), A86/A87 (notícias com paginação, data com ano, compartilhar).
- **Saúde/Convênios:** A42 (próximos agendamentos), A76 (botão para falar com o serviço de saúde), A77 (CAT e afastamentos), A43 (`tel:`/`maps`/site clicáveis), A78 (busca e índice por categoria), A79 (URLs assinadas de logo que nunca aparece), A164 (categoria "Outros").

### Onda 4 — entrada e cadastro

- **A1** — fechar o circuito do código: passo "Digite o código de 6 dígitos" no próprio formulário (`verifyOtp` + `consumirVinculoPendente`), aba renomeada "Código por e-mail". Mínimo em 30 min: e-mail do filiado com o botão "Entrar no portal" primeiro e sem a caixa de código.
- **A66 + A68 + A158** — "Esqueci minha senha"/criar senha; não revelar se o CPF é de filiado; CPF compartilhado entre as abas.
- **A25** — trocar o e-mail de acesso exige confirmação (hint sob o campo hoje; código ao novo endereço depois).
- **A34 + A130 + A70** — Meu cadastro mostra onde a pessoa trabalha, matrícula e data de filiação; `autoComplete`/`type=tel`, UF em select, CEP com ViaCEP (já existe em `/filiar`); validação de telefone/CEP.
- **A4 + A26** — desistência da filiação coletiva inalcançável (portal só entra "Ativo"): preferir rota pública `/desistir/<token>` enviada no e-mail do lote; desfiliação fora do prazo leva ao Atendimento com assunto pré-preenchido e explica quando o desconto para.
- **A35 + A71** — "Desconto em folha: Sem registro" explicado; termo LGPD exibido = termo versionado aceito.

### Onda 5 — consistência, acessibilidade e polimento

A131 (sucesso sempre pelo `sonner`, nunca `?salvo=1`), A140 (estados vazios num padrão), A128 (`CardTitle` como `h2`), A139 (erros ligados ao campo com `aria-describedby`), A138/A154 (radio/checkbox do sistema na cédula e na oposição), A173 (`VoltarLista` nas seis subpáginas), A182/A183/A184 (datas/dinheiro por `formatar*`, `<title>` com um sufixo só, cabeçalho de página padronizado), A178/A175 (fontes 10–11 px e z-index crus), A179 ("Close" → "Fechar"), A110–A115 e A169–A172 (ajuda: índice depois do artigo no celular, busca no corpo dos artigos, área "Agenda" fantasma, "Manual" × "Ajuda").

---

## 4. Avisos: matriz de gatilhos

Canais hoje: **sino** (tabela `portal_avisos`, badge no cabeçalho) e **e-mail** (preferência por tipo em `/portal/avisos/preferencias`). **Push** existe só para usuários do painel.

| Evento | Importa para quem paga? | Hoje | Proposta | Achado |
|---|---|---|---|---|
| Contribuição **não localizada** na remessa da fonte | Máximo — risco de suspensão | Nada; só vê abrindo a página | Sino + e-mail ao fechar a remessa (`avisarFaltasDaRemessa`), link para Contribuição com botão "Avisar o sindicato" | A20, A23 |
| Contribuição recebida (folha) | Médio (mensal, pode ser ruído) | Nada | Evento `contribuicao_recebida` com e-mail **desligado por padrão** | A20 |
| Cobrança Pix gerada / recebida | Alto | Sino + e-mail — mas o e-mail do tick cai no tenant errado | Corrigir tenant; lembrete 3 dias antes do vencimento | A19, A102 |
| Resposta do atendimento | Alto | Sino + e-mail | Manter; e-mail para o endereço **atual** do cadastro | A152 |
| Atendimento aberto (recibo com prazo) / equipe começou / prazo estourou | Alto | Nada | Sino ao abrir (com prazo) e ao mudar a Demanda para "Fazendo"; aviso de prazo vencido | A13, A121 |
| Hotel reservou / reserva confirmada | Alto | Sino + e-mail | Manter; aviso leva à **página da reserva**, não à lista | A59 |
| Vaga liberada na lista de espera (prazo de horas) | Máximo | Sino + e-mail; no portal está em texto discreto | Destaque no topo da Hospedagem com botão; lembrete antes de expirar; push quando existir | A7, A102 |
| Reserva cancelada pela equipe / não comparecimento (punição) | Máximo | Nada | Sino + e-mail com link para pedir abono | A21 |
| Assembleia aberta | Alto | Sino + e-mail, mas só se a gestão disparar o lote | Automático ao abrir; último dia; resultado publicado | A49 |
| Oposição registrada / carta pendente / avaliada | Máximo (prazo legal) | Nada | E-mail com protocolo e comprovante; sino + e-mail no resultado; lembrete da carta por cron | A16, A58 |
| Filiação ativada / desfiliação concluída | Alto | Nada | Sino + e-mail | A58 |
| Inscrição em evento (recibo) / véspera / RSVP | Médio | Só RSVP por e-mail | Recibo no sino; lembrete na véspera; RSVP no sino | A122 |
| Convênio novo / notícia nova | Baixo–médio | Nada | Sino sem e-mail (marcar "novo" no portal) | A80, A123 |
| CAT vinculada ao associado | Alto | Nada | Sino + e-mail; CAT aparece em Saúde | A77 |
| **Push no celular** (qualquer evento acima) | Alto | Só gestão | `push_assinaturas.cpf` + `/api/portal/push/assinar` + card em preferências; `avisarFiliado` chama `enviarPushWeb` | A52 |

UX dos avisos: abrir a lista hoje marca **tudo** como lido antes de ver (A100); lista plana de
até 200 sem filtro (A101); interruptores "Votações" e "Eventos" não desligam nada (A120);
preferências de contato espalhadas entre Avisos e LGPD (A176).

---

## 5. O que foi visto ao vivo (capturas, tenant demo, tema escuro)

- **800 px:** menu com barra de rolagem cinza e itens cortados ("Votação / At…"); a página
  inicial usa toda a largura, mas o menu não cabe.
- **1920 px:** faixa de ~1024 px centralizada com ~450 px vazios de cada lado; o menu
  **ainda** estoura ("Ate" cortado); tabela da contribuição espremida; grade de serviços com
  cartão órfão. Avisos: duas linhas numa faixa estreita com o selo "Novo" solto à direita.
- **375 px:** cabeçalho de 64 px com "Sair" e tema, sem nome da seção; sete cartões de
  serviço de ~280 px cada antes de qualquer novidade; Contribuição empilha três cartões de
  indicador com um número cada; Carteirinha funciona bem (QR, declaração); folha "Mais" com 15
  itens em duas colunas, "Oposição à co…" truncado; o alerta de faltas acusa **11/2026 em
  10/10/2026**.

---

## 6. Rejeitados na verificação (17) — os que valem registro

- "Cabeçalho deveria ter avatar/menu de conta no lugar do Sair" — para este público, o botão
  visível é melhor; os três botões de área só aparecem para contas da gestão.
- "Saudação sem contexto / filiação não ativa passa em silêncio" — filiação não ativa nunca
  chega à home (o login recusa antes).
- "Sem avaliação do atendimento ao concluir" — métrica para a entidade, não problema do
  associado; decidir como feature, na versão mínima.
- "Convite para avaliar hospedagem só por e-mail" — o cartão já aparece acima do formulário
  de pedido.
- "Linha do aviso sem ícone e com data absoluta" — a palavra "Novo" é mais clara que um ponto
  para este público; data absoluta serve de registro.
- Os demais: premissa errada ou já implementado (lista completa com motivo no anexo).

---

## 7. Tabela completa dos achados confirmados (187)

Ordenados por severidade e valor para o associado. Detalhes de cada um no
[anexo](avaliacao-portal-associado-2026-10-11-anexo.md).

| Cód. | Achado | Categoria | Sev. | Valor | Esforço | Arquivo |
|---|---|---|---|---|---|---|
| A1 | Login por e-mail promete "link", mas o e-mail entrega um código que não tem onde ser digitado | conteudo | alta | alto | medio | `src/app/portal/actions.ts:104` |
| A2 | Home não mostra a situação da contribuição — a informação que o pagante mais quer | funcionalidade | alta | alto | medio | `src/app/portal/inicio/page.tsx:98` |
| A3 | Banner de assembleia na home convida a 'Votar' em votação que ainda não abriu ou está em carência | bug | alta | alto | pequeno | `src/app/portal/inicio/page.tsx:152` |
| A4 | Desistência online da filiação coletiva é inalcançável: o portal só deixa entrar quem está "Ativo" | bug | alta | alto | medio | `src/lib/auth.ts:147` |
| A5 | Aviso de falta dispara para o mês corrente e até para mês futuro (11/2026 em 10/10/2026) | bug | alta | alto | pequeno | `src/lib/db/carteirinha.ts:171` |
| A6 | 'Em atraso' sem dizer quais meses faltaram, último pagamento nem se a suspensão já está valendo | funcionalidade | alta | alto | pequeno | `src/app/portal/contribuicao/page.tsx:51` |
| A7 | Oferta da lista de espera (ação com prazo de horas) escondida em texto discreto | avisos | alta | alto | medio | `src/app/portal/hospedagem/page.tsx:249` |
| A8 | Tarifa (quanto o associado paga) não aparece antes de pedir o cupom | conteudo | alta | alto | pequeno | `src/app/portal/hospedagem/page.tsx:344` |
| A9 | Saúde em modo visualização expõe a especialidade do atendimento à equipe de filiação | bug | alta | alto | pequeno | `src/app/portal/saude/page.tsx:30` |
| A10 | Quem cancela a inscrição nunca mais consegue se inscrever no mesmo evento | bug | alta | alto | pequeno | `src/lib/db/eventos-portal.ts:143` |
| A11 | Assembleia híbrida não oferece voto online no portal (e o e-mail de aviso manda para ela) | bug | alta | alto | pequeno | `src/lib/db/votacao-portal.ts:398` |
| A12 | Anexo promete "até 10 MB", mas a server action corta em 4 MB | bug | alta | alto | medio | `src/app/portal/atendimento/formularios.tsx:49` |
| A13 | Situação no portal não acompanha a Demanda: equipe trabalha e o associado vê "Aberta — ainda sem resposta" | funcionalidade | alta | alto | medio | `src/lib/db/portal-atendimentos.ts:299` |
| A14 | "Desistir da oposição" grava registro permanente e tranca o trabalhador fora da campanha dentro do prazo | bug | alta | alto | medio | `src/app/portal/oposicao/[id]/oposicao-flow.tsx:84` |
| A15 | Oposição reprovada sem motivo e comprovante que nunca reflete o resultado da avaliação | funcionalidade | alta | alto | medio | `src/app/portal/oposicao/comprovante/[id]/page.tsx:132` |
| A16 | Nenhum e-mail ou aviso no portal ao registrar, ao faltar a carta e ao ser avaliada a oposição | avisos | alta | alto | grande | `src/app/portal/oposicao/actions.ts:253` |
| A17 | Filiado logado cai fora da casca do portal: some o menu e não há caminho de volta (só "Sair", que derruba a sessão) | navegacao | alta | alto | medio | `src/app/portal/oposicao/page.tsx:56` |
| A18 | Nav horizontal de 15 itens estoura em qualquer largura: trocar por sidebar fixa em lg+ e manter barra inferior até lg | layout | alta | alto | grande | `src/app/portal/portal-nav.tsx:68` |
| A19 | E-mail do aviso de cobrança Pix gerado pelo cron busca o filiado no tenant errado | bug | alta | alto | pequeno | `src/lib/db/portal-avisos.ts:104` |
| A20 | Contribuição descontada em folha: 'recebida' e 'não localizada na remessa' nunca viram aviso | avisos | alta | alto | medio | `src/lib/portal-avisos-eventos.ts:28` |
| A21 | Hospedagem: cancelamento pela equipe, cupom desvinculado, cupom emergencial e não comparecimento não avisam | avisos | alta | alto | pequeno | `src/lib/db/hospedagem-garantida.ts:609` |
| A22 | Alerta de 'faltas' compara com remessas de toda a entidade, não com as da fonte do filiado (falso alarme) | bug | alta | alto | pequeno | `src/lib/db/carteirinha.ts:149` |
| A23 | 'O desconto não veio': o portal só diz 'avise o sindicato', sem botão, sem assunto e sem anexo do contracheque | funcionalidade | alta | alto | pequeno | `src/app/portal/contribuicao/page.tsx:55` |
| A24 | Situação "Em dia / Em atraso" da Contribuição pode vir do cache de OUTRA entidade (cache global, não por tenant) | bug | alta | alto | medio | `src/lib/db/carteirinha.ts:177` |
| A25 | Trocar o e-mail em "Meu cadastro" pode trancar o próprio acesso, sem aviso nem confirmação | funcionalidade | alta | medio | medio | `src/app/portal/cadastro/cadastro-form.tsx:65` |
| A26 | Desfiliação fora do prazo manda "procurar o sindicato" sem link, e a desistência não diz quando o desconto para | conteudo | alta | medio | pequeno | `src/app/portal/desfiliacao/page.tsx:104` |
| A27 | Container max-w-5xl em cabeçalho, banner e main usa 53% da tela em 1920px | layout | alta | medio | pequeno | `src/app/portal/portal-shell.tsx:133` |
| A28 | Selects e inputs 'crus' removem o foco visível e ficam com 36px no toque | acessibilidade | alta | medio | pequeno | `src/app/portal/hospedagem/cupom-portal.tsx:26` |
| A29 | Prop `preview` copiada à mão em 15 páginas e esquecida em 3: banner some e a gestão é expulsa para o login | bug | alta | baixo | pequeno | `src/app/portal/portal-shell.tsx:61` |
| A30 | Link do aviso por e-mail cai no login e, depois, no Início — o destino se perde | navegacao | media | alto | pequeno | `src/proxy.ts:275` |
| A31 | Portal se apresenta como "Confluir", não como o sindicato: sem nome da entidade, sem nome do associado, logo sem link | conteudo | media | alto | pequeno | `src/app/portal/portal-shell.tsx:99` |
| A32 | A home não mostra os compromissos que o próprio associado já assumiu (inscrições feitas, hospedagem reservada) | funcionalidade | media | alto | medio | `src/app/portal/inicio/page.tsx:105` |
| A33 | Avisos não lidos ficam escondidos no sino; a home não mostra o que a entidade respondeu | avisos | media | alto | pequeno | `src/app/portal/inicio/page.tsx:128` |
| A34 | "Meu cadastro" não mostra onde a pessoa trabalha, a matrícula na fonte nem a data de filiação | funcionalidade | media | alto | medio | `src/app/portal/cadastro/page.tsx:91` |
| A35 | "Desconto em folha: Sem registro" sem explicação nem ação — soa como "estão descontando sem eu autorizar" | conteudo | media | alto | medio | `src/app/portal/lgpd/page.tsx:112` |
| A36 | Carteirinha no celular: QR de 128 px dividindo a linha com texto e sem modo 'apresentar' | layout | media | alto | pequeno | `src/app/portal/carteirinha/page.tsx:82` |
| A37 | Ordem da página: parede de regras antes do formulário e das ações | layout | media | alto | pequeno | `src/app/portal/hospedagem/page.tsx:132` |
| A38 | Cota, suspensão por falta e sexo no cadastro só são descobertos no erro após enviar | funcionalidade | media | alto | medio | `src/app/portal/hospedagem/actions.ts:161` |
| A39 | Cupom 'Reservado' não mostra o que o hotel confirmou (datas, pessoas no quarto, código) | funcionalidade | media | alto | medio | `src/lib/db/filiado-portal.ts:116` |
| A40 | Depois do pedido, o associado não sabe o próximo passo, nem tem contato do hotel, nem é avisado quando a reserva sai | avisos | media | alto | medio | `src/app/portal/hospedagem/page.tsx:124` |
| A41 | Página da reserva: sem horário de check-in, sem link para guardar/compartilhar e mensagem de e-mail falsa quando não há e-mail | funcionalidade | media | alto | pequeno | `src/app/portal/hospedagem/reserva/[id]/page.tsx:101` |
| A42 | Associado não vê seus próximos agendamentos de saúde | funcionalidade | media | alto | medio | `src/app/portal/saude/page.tsx:35` |
| A43 | Telefone, endereço e site das unidades não são acionáveis no celular | acessibilidade | media | alto | pequeno | `src/app/portal/convenios/page.tsx:84` |
| A44 | Evento com foto obrigatória: o portal diz "confirmada" sem avisar que falta a foto | funcionalidade | media | alto | medio | `src/app/portal/eventos/page.tsx:148` |
| A45 | "Ver meu código de entrada" tira o associado do portal e não tem caminho de volta | navegacao | media | alto | medio | `src/app/portal/eventos/page.tsx:173` |
| A46 | Depois de votar, o comprovante não aparece — a tela vira um beco sem saída | funcionalidade | media | alto | medio | `src/app/portal/votacao/[id]/cedula-form.tsx:29` |
| A47 | Link da sala virtual (reunião online) não aparece em nenhuma tela do portal | funcionalidade | media | alto | medio | `src/lib/db/votacao-portal.ts:330` |
| A48 | Datas da rodada: sem horário das assembleias presenciais e 'Descrição' exibida como se fosse local | conteudo | media | alto | pequeno | `src/app/portal/votacao/rodada/[id]/page.tsx:85` |
| A49 | Avisos de votação: um só disparo no envio da lista; nada no último dia nem quando o resultado sai | avisos | media | alto | medio | `src/lib/db/votacao-aviso.ts:364` |
| A50 | Erro de validação do servidor apaga tudo o que o associado escreveu | bug | media | alto | pequeno | `src/app/portal/atendimento/formularios.tsx:41` |
| A51 | Conclusão silenciosa e conversa sem marcos de situação | avisos | media | alto | pequeno | `src/lib/db/portal-atendimentos.ts:381` |
| A52 | Push no celular existe só para o painel: o portal registra o service worker mas não tem como assinar | funcionalidade | media | alto | grande | `src/lib/db/portal-avisos.ts:97` |
| A53 | Upload da carta assinada não devolve o resultado da validação e o trabalhador não vê o PDF que enviou | funcionalidade | media | alto | medio | `src/lib/db/oposicao.ts:862` |
| A54 | Contribuição — o dinheiro do associado — não tem artigo próprio, e a página mostra estados que a ajuda não explica; Desfiliação não tem ajuda nenhuma | conteudo | media | alto | medio | `src/conteudo/portal/carteirinha/index.mdx:18` |
| A55 | Hub do Início: grade própria, cartão órfão e faltam Contribuição, Carteirinha, Convênios e Saúde | navegacao | media | alto | medio | `src/app/portal/inicio/page.tsx:49` |
| A56 | PWA: o manifest é o do painel — associado que instala o app cai em /painel | bug | media | alto | pequeno | `src/app/manifest.ts:13` |
| A57 | Barra inferior: Avisos duplica o sino do cabeçalho enquanto Contribuição e Atendimento ficam escondidos em "Mais"; Hospedagem é fixo mesmo sem hotel | navegacao | media | alto | pequeno | `src/app/portal/portal-nav.tsx:58` |
| A58 | Decisões sobre a pessoa (oposição avaliada, filiação ativada, desfiliação concluída) não geram aviso | avisos | media | alto | medio | `src/lib/db/oposicao.ts:1096` |
| A59 | Avisos levam à lista, não ao item (reserva, cédula de votação, oferta de vaga) | navegacao | media | alto | pequeno | `src/lib/db/hospedagem-garantida.ts:492` |
| A60 | Não há 'quanto e como você paga': forma de recebimento e valor previsto existem no banco mas não chegam ao portal | funcionalidade | media | alto | medio | `src/lib/db/filiado-portal.ts:49` |
| A61 | Sem extrato/comprovante anual em PDF; o histórico corta em 36 linhas sem filtro por ano | funcionalidade | media | alto | medio | `src/app/portal/contribuicao/page.tsx:26` |
| A62 | Hospedagem só mostra 'Sua tarifa': o associado nunca vê quanto o sindicato pagou por ele (valor recebido) | funcionalidade | media | alto | medio | `src/app/portal/hospedagem/page.tsx:309` |
| A63 | Canais oficiais e endereço do sindicato não aparecem no portal (só um e-mail escondido na LGPD) | conteudo | media | alto | pequeno | `src/app/portal/portal-shell.tsx:133` |
| A64 | Instruções e informação financeira em 12px apagado (text-xs + muted) | conteudo | media | alto | pequeno | `src/app/portal/contribuicao/page.tsx:76` |
| A65 | Nenhum loading.tsx no portal (o painel tem 30+): entre o clique no menu e a página, nada acontece | consistencia | media | alto | pequeno | `src/app/portal/inicio/page.tsx:98` |
| A66 | Aba "CPF e senha" é um beco: sem "Esqueci minha senha" e sem lugar para criar a senha | funcionalidade | media | medio | medio | `src/app/portal/portal-login-form.tsx:88` |
| A67 | Casca montada dentro de cada página: a tela de erro perde o menu e não há loading com a casca | consistencia | media | medio | medio | `src/app/portal/error.tsx:5` |
| A68 | Pedido de código por e-mail revela se o CPF é de um filiado (dado sensível) | bug | media | medio | pequeno | `src/app/portal/actions.ts:110` |
| A69 | Qualquer consulta secundária que falhe derruba a home inteira; busca de notícias externas não tem timeout | bug | media | medio | pequeno | `src/app/portal/inicio/page.tsx:98` |
| A70 | Telefone e CEP são aceitos com qualquer quantidade de dígitos, e o erro aparece longe do botão | funcionalidade | media | medio | pequeno | `src/app/portal/cadastro/actions.ts:47` |
| A71 | O termo LGPD exibido no portal é um parágrafo fixo, mas o aceite é registrado contra o termo versionado da entidade | bug | media | medio | pequeno | `src/app/portal/lgpd/page.tsx:167` |
| A72 | Abrir 'Minha contribuição' roda a apuração de inadimplência do tenant inteiro — e, se falhar, mostra 'Em dia' | bug | media | medio | medio | `src/lib/db/carteirinha.ts:174` |
| A73 | Carteirinha sem acesso rápido nem uso sem internet (atalho do app, imagem salva) | funcionalidade | media | medio | medio | `src/app/manifest.ts:26` |
| A74 | Quem paga por Pix não vê as cobranças pagas (data, identificador) nem quando sai a próxima | funcionalidade | media | medio | medio | `src/app/portal/contribuicao/page.tsx:30` |
| A75 | Hotel com convênio vencido aparece no seletor e a data de check-in não tem limite máximo | bug | media | medio | pequeno | `src/lib/db/filiado-portal.ts:141` |
| A76 | Saúde não dá caminho para falar com o serviço de saúde ou pedir atendimento | funcionalidade | media | medio | pequeno | `src/app/portal/saude/page.tsx:105` |
| A77 | 'Saúde' ignora acidentes de trabalho (CAT) e afastamentos do associado | funcionalidade | media | medio | medio | `src/app/portal/saude/page.tsx:44` |
| A78 | Convênios sem busca nem índice por categoria: 21 cards numa coluna só | funcionalidade | media | medio | medio | `src/app/portal/convenios/page.tsx:49` |
| A79 | Convênios gera URLs assinadas de logo que nunca aparece, em série, a cada abertura | bug | media | medio | pequeno | `src/lib/db/filiacao-convenios.ts:106` |
| A80 | Convênio novo não gera aviso ao associado | avisos | media | medio | medio | `src/lib/db/filiacao-convenios-edicao.ts:233` |
| A81 | Inscrição pendente ou em lista de espera não pode ser desistida pelo associado | funcionalidade | media | medio | pequeno | `src/app/portal/eventos/page.tsx:180` |
| A82 | "Não vou poder ir" promete liberar a vaga, mas nada é liberado | conteudo | media | medio | pequeno | `src/app/portal/eventos/formularios.tsx:85` |
| A83 | Card do evento mostra menos que a página pública: sem término, endereço e imagem, e descrição cortada sem "ver mais" | layout | media | medio | pequeno | `src/app/portal/eventos/page.tsx:95` |
| A84 | Não existe "adicionar ao calendário" para inscrições e agenda | funcionalidade | media | medio | medio | `src/app/portal/eventos/page.tsx:171` |
| A85 | Agenda: compromisso de evento não leva à inscrição, e o card "Agenda de atividades" do início não é clicável | navegacao | media | medio | pequeno | `src/lib/db/filiado-portal.ts:165` |
| A86 | Lista de notícias: 20 fixas sem paginação nem busca, data sem ano e só o título | layout | media | medio | medio | `src/app/portal/noticias/page.tsx:16` |
| A87 | Notícia não tem compartilhar nem copiar link — e o link exige login | funcionalidade | media | medio | medio | `src/app/portal/noticias/[id]/page.tsx:30` |
| A88 | Ao tocar "Quero participar", o card some do topo e a confirmação nunca aparece | funcionalidade | media | medio | pequeno | `src/app/portal/eventos/formularios.tsx:30` |
| A89 | Cédula abre antes da abertura e em carência — o bloqueio só aparece depois de preencher | bug | media | medio | pequeno | `src/app/portal/votacao/[id]/page.tsx:70` |
| A90 | Sem assembleia aberta, a página começa pelo formulário de e-mail e não explica nada | layout | media | medio | pequeno | `src/app/portal/votacao/page.tsx:61` |
| A91 | Card 'E-mail de votação' é tarefa técnica rara ocupando o centro da página, sem atalho para o e-mail do portal | funcionalidade | media | medio | medio | `src/app/portal/votacao/page.tsx:154` |
| A92 | Voto irreversível sem passo de confirmação — um toque errado no celular é definitivo | funcionalidade | media | medio | medio | `src/app/portal/votacao/[id]/cedula-form.tsx:76` |
| A93 | Contagem regressiva chega a zero, diz 'encerrada', mas o botão 'Votar agora' continua — e nunca diz a hora exata do fim | funcionalidade | media | medio | pequeno | `src/components/portal/contagem-regressiva.tsx:28` |
| A94 | "Resposta até" fica na tela depois de respondida e o selo "prazo vencido" não chega ao portal | conteudo | media | medio | pequeno | `src/app/portal/atendimento/page.tsx:77` |
| A95 | Formulário de nova solicitação sempre aberto no topo esconde "Minhas solicitações" | layout | media | medio | pequeno | `src/app/portal/atendimento/page.tsx:40` |
| A96 | Lista sem prioridade (respondidas não sobem) e Início não destaca resposta pendente | navegacao | media | medio | medio | `src/lib/db/portal-atendimentos.ts:237` |
| A97 | Associado não pode encerrar nem reabrir a própria solicitação | funcionalidade | media | medio | medio | `src/app/portal/atendimento/[id]/page.tsx:75` |
| A98 | Um anexo por mensagem e sem atalho para a câmera do celular | funcionalidade | media | medio | medio | `src/app/portal/atendimento/formularios.tsx:49` |
| A99 | Prazos numa linha densa e opções do seletor longas demais para o celular | conteudo | media | medio | pequeno | `src/app/portal/atendimento/page.tsx:44` |
| A100 | Abrir a lista marca tudo como lido antes de a pessoa ver; não há lido por item nem "marcar tudo" | funcionalidade | media | medio | medio | `src/app/portal/avisos/page.tsx:29` |
| A101 | Lista plana de até 200 avisos, sem filtro por tipo nem paginação | navegacao | media | medio | medio | `src/app/portal/avisos/page.tsx:60` |
| A102 | Sem lembrete de vencimento do Pix nem de oferta de vaga prestes a expirar | avisos | media | medio | medio | `src/lib/db/cobrancas.ts:231` |
| A103 | Formulário pede fonte pagadora e matrícula que o sistema já conhece do filiado | funcionalidade | media | medio | medio | `src/app/portal/oposicao/[id]/oposicao-flow.tsx:112` |
| A104 | Etapa do vídeo sem explicação, contador sem contexto e confirmação sem mostrar quem está se opondo | conteudo | media | medio | medio | `src/app/portal/oposicao/[id]/oposicao-flow.tsx:48` |
| A105 | Passos do gov.br sem link nem requisitos; documento-modelo cadastrado pela gestão nunca chega ao trabalhador | conteudo | media | medio | pequeno | `src/app/portal/oposicao/comprovante/[id]/page.tsx:61` |
| A106 | Prazo mostrado sem urgência e sem explicar o que acontece depois do registro | avisos | media | medio | pequeno | `src/app/portal/oposicao/page.tsx:190` |
| A107 | Comprovante impresso sai sem identificação da entidade e não existe PDF do comprovante | layout | media | medio | medio | `src/app/portal/oposicao/comprovante/[id]/page.tsx:37` |
| A108 | Vocabulário interno e frases soltas vazam para o associado | conteudo | media | medio | pequeno | `src/app/portal/oposicao/page.tsx:200` |
| A109 | Data por extenso da carta usa o fuso do servidor e pode sair com o dia seguinte; hojeSP duplicado em três arquivos | bug | media | medio | pequeno | `src/lib/pdf/carta-oposicao.tsx:36` |
| A110 | No celular, o índice inteiro do manual (28 linhas) empilha ANTES do artigo | layout | media | medio | pequeno | `src/app/portal/ajuda/layout.tsx:29` |
| A111 | A busca ignora o corpo dos artigos: 'pix', 'atraso', 'endereço', 'telefone', 'cancelar' não acham nada | funcionalidade | media | medio | medio | `src/app/portal/ajuda/page.tsx:15` |
| A112 | Nav lateral mostra dois rótulos por página e o título da área não é clicável | navegacao | media | medio | pequeno | `src/components/ajuda/ajuda-nav.tsx:66` |
| A113 | 'Todas as interfaces' tira o associado do portal e o leva a um hub da gestão com paredes de login | navegacao | media | medio | pequeno | `src/components/ajuda/ajuda-nav.tsx:40` |
| A114 | 'Bem-vindo ao portal' descreve um menu que não existe mais e um jeito de entrar que não é o da tela de login | conteudo | media | medio | pequeno | `src/conteudo/portal/visao-geral/index.mdx:27` |
| A115 | Busca: só na página inicial da ajuda, dropdown sem teclado/fechamento, e beco sem saída quando não acha | acessibilidade | media | medio | medio | `src/components/ajuda/ajuda-busca.tsx:53` |
| A116 | Menu plano sem grupos; "LGPD" é jargão e "Oposição à contribuição" é o maior rótulo e o mais ambíguo | navegacao | media | medio | pequeno | `src/app/portal/portal-shell.tsx:17` |
| A117 | Enquanto a sidebar não entra: a rolagem da nav não tem affordance e o item ativo fica fora da tela | layout | media | medio | pequeno | `src/app/portal/portal-nav.tsx:68` |
| A118 | Sheet "Mais": 15 itens em duas colunas, "Oposição à contribuição" truncado, sem agrupamento e repetindo os 4 fixos | layout | media | medio | pequeno | `src/app/portal/portal-nav.tsx:165` |
| A119 | Alvos de toque de 28–40px nas ações que mais importam: Votar agora, Confirmar reserva, Cancelar, QR Code, estrelas de avaliação | acessibilidade | media | medio | pequeno | `src/app/portal/hospedagem/cupom-portal.tsx:253` |
| A120 | Interruptores 'Votações' e 'Eventos' nas preferências não desligam nada | consistencia | media | medio | pequeno | `src/lib/portal-avisos-eventos.ts:13` |
| A121 | Atendimento: sem recibo com prazo ao abrir, sem aviso ao reabrir nem quando o prazo estoura | avisos | media | medio | pequeno | `src/lib/db/portal-atendimentos.ts:217` |
| A122 | Eventos: inscrição pelo portal sem recibo, nenhum lembrete na véspera e RSVP fora do sino | avisos | media | medio | medio | `src/lib/db/eventos-portal.ts:160` |
| A123 | Notícia nova não avisa ninguém e o portal não marca o que é novo | avisos | media | medio | medio | `src/lib/db/noticias.ts:80` |
| A124 | 'Isso pode suspender benefícios' sem dizer quais, nem qual é a regra da entidade | conteudo | media | medio | pequeno | `src/app/portal/contribuicao/page.tsx:55` |
| A125 | 'Oposição à contribuição' aparece no menu para todos e tira o filiado da casca do portal sem caminho de volta | navegacao | media | medio | pequeno | `src/app/portal/portal-shell.tsx:68` |
| A126 | Recém-filiado vê 'Em dia' e 'Nenhuma contribuição registrada' sem previsão de quando o primeiro desconto aparece | conteudo | media | medio | pequeno | `src/app/portal/contribuicao/page.tsx:131` |
| A127 | Sem 'pular para o conteúdo': ~21 paradas de Tab antes do conteúdo em toda página | navegacao | media | medio | pequeno | `src/app/portal/portal-shell.tsx:97` |
| A128 | Páginas sem h2: CardTitle é <div>, o leitor de tela só vê o h1 | acessibilidade | media | medio | medio | `src/components/ui/card.tsx:36` |
| A129 | Oposição: botão 'Prosseguir' desabilitado durante a contagem, sem explicar nem anunciar a liberação | acessibilidade | media | medio | pequeno | `src/app/portal/oposicao/[id]/oposicao-flow.tsx:93` |
| A130 | Meu cadastro: campos sem autocomplete, UF em texto livre e CEP sem busca (que já existe na ficha pública) | funcionalidade | media | medio | medio | `src/app/portal/cadastro/cadastro-form.tsx:67` |
| A131 | Mensagem de sucesso por cinco mecanismos diferentes e nunca pelo sonner; `?salvo=1` reaparece no F5 | consistencia | media | medio | medio | `src/app/portal/cadastro/page.tsx:72` |
| A132 | Confirmação de ação destrutiva em três comportamentos: cancelar inscrição não pergunta nada | funcionalidade | media | medio | pequeno | `src/app/portal/eventos/formularios.tsx:93` |
| A133 | "Declaração de filiação (PDF)" fora do AcaoVisualizacao: no modo visualização abre 401 em texto cru ou gera a declaração do gestor | bug | media | medio | pequeno | `src/app/portal/carteirinha/page.tsx:97` |
| A134 | GET de /portal/hospedagem executa a fila de espera (reservas, cancelamentos e e-mails) a cada visita, com trava não atômica | bug | media | medio | medio | `src/app/portal/hospedagem/page.tsx:94` |
| A135 | Lista de eventos do portal corta em 50 pelos MAIS ANTIGOS e nunca filtra eventos passados | funcionalidade | media | medio | pequeno | `src/lib/db/eventos-portal.ts:49` |
| A136 | Nenhuma página do portal aponta para o artigo de ajuda dela — a ajuda só existe para quem vai até o menu 'Ajuda' | navegacao | media | baixo | medio | `src/app/portal/portal-shell.tsx:97` |
| A137 | Alvos de toque abaixo de 44px: nav horizontal em tablets, tema (32px) e Sair (36px) no cabeçalho | acessibilidade | media | baixo | pequeno | `src/app/portal/portal-nav.tsx:78` |
| A138 | Cédula de votação e declaração de oposição usam radio/checkbox nativos em vez dos componentes do sistema | acessibilidade | media | baixo | pequeno | `src/app/portal/votacao/[id]/cedula-form.tsx:62` |
| A139 | Erros de formulário não são anunciados nem ligados ao campo (Meu cadastro, hospedagem, e-mail de votação) | acessibilidade | media | baixo | medio | `src/app/portal/hospedagem/cupom-portal.tsx:208` |
| A140 | Estados vazios em sete desenhos; no Início as seções somem em vez de dizer que estão vazias | consistencia | media | baixo | medio | `src/app/portal/inicio/page.tsx:295` |
| A141 | "Baixar meus dados" continua clicável no modo visualização (disabled num <a> não desabilita) e baixa os dados do PRÓPRIO gestor | bug | media | baixo | pequeno | `src/app/portal/lgpd/page.tsx:136` |
| A142 | Envio de código do e-mail de votação sem limite: qualquer filiado dispara e-mails ilimitados para qualquer endereço | funcionalidade | media | baixo | pequeno | `src/app/portal/votacao/actions.ts:15` |
| A143 | Ação "desistir" da oposição grava registro para campanha arbitrária (até de outro tenant) e fora do prazo | bug | media | baixo | pequeno | `src/app/portal/oposicao/actions.ts:273` |
| A144 | Fonte pagadora da oposição não é validada contra as fontes da campanha | bug | media | baixo | pequeno | `src/app/portal/oposicao/actions.ts:238` |
| A145 | Notícias sem data e sem 'ver todas'; agenda sem link — o card é um beco sem saída | funcionalidade | baixa | medio | pequeno | `src/app/portal/inicio/page.tsx:301` |
| A146 | Página sem títulos de seção; pendências, destaque de inscrições e cards comuns têm o mesmo peso visual | layout | baixa | medio | pequeno | `src/app/portal/inicio/page.tsx:130` |
| A147 | Badges e alertas com classes manuais em vez das variantes do design system; 'Situação' quase invisível no cartão | consistencia | baixa | medio | pequeno | `src/app/portal/contribuicao/page.tsx:120` |
| A148 | Avaliação sai do portal e não oferece caminho de volta | navegacao | baixa | medio | pequeno | `src/app/portal/hospedagem/avaliacoes-pendentes.tsx:46` |
| A149 | Erro do formulário aparece no topo do cartão, longe do botão que o associado acabou de tocar | acessibilidade | baixa | medio | pequeno | `src/app/portal/hospedagem/cupom-portal.tsx:74` |
| A150 | "Outros eventos" não diz quando as inscrições vão abrir nem a nova data do adiado | funcionalidade | baixa | medio | pequeno | `src/app/portal/eventos/page.tsx:212` |
| A151 | 'Ver comprovante' tira o associado do portal sem caminho de volta | navegacao | baixa | medio | pequeno | `src/app/portal/votacao/page.tsx:224` |
| A152 | E-mail da resposta vai para o endereço da época da abertura, não para o cadastro atual | avisos | baixa | medio | pequeno | `src/lib/db/portal-atendimentos.ts:413` |
| A153 | Nomes desencontrados: "Preferências de e-mail" vs "Preferências de avisos", e o e-mail aponta o caminho sem link | consistencia | baixa | medio | pequeno | `src/app/portal/avisos/page.tsx:47` |
| A154 | Controles crus fora do design system no formulário mais sensível do portal (select, input, checkbox de 16px, Input file) | consistencia | baixa | medio | pequeno | `src/app/portal/oposicao/[id]/oposicao-flow.tsx:163` |
| A155 | O associado não vê quem o representa: diretoria vigente existe no sistema e não aparece no portal | conteudo | baixa | medio | pequeno | `src/lib/db/diretoria.ts:675` |
| A156 | Botão dentro de link nos cartões de assembleia/oposição: tab stop morto para teclado | acessibilidade | baixa | medio | pequeno | `src/app/portal/inicio/page.tsx:177` |
| A157 | Alternador de áreas vira três ícones iguais sem nome entre 640 e 767px e três botões de texto disputando o header acima disso | acessibilidade | baixa | baixo | pequeno | `src/app/portal/portal-shell.tsx:106` |
| A158 | CPF digitado numa aba do login não vale na outra, e a aba padrão ignora quem tem senha | layout | baixa | baixo | pequeno | `src/app/portal/portal-login-form.tsx:60` |
| A159 | Listas dentro dos cards usam px-6 e ficam desalinhadas do título (card usa 16px) | consistencia | baixa | baixo | pequeno | `src/app/portal/inicio/page.tsx:300` |
| A160 | Desfiliação estreita a página ainda mais (max-w-2xl) e os títulos de aba variam entre "— Confluir", "— Portal" e "— Portal do Associado" | consistencia | baixa | baixo | pequeno | `src/app/portal/desfiliacao/page.tsx:49` |
| A161 | Termos internos ('remessa', 'competência', 'Associativa'), subtítulos em 12 px e nenhum link para a ajuda da seção | conteudo | baixa | baixo | pequeno | `src/app/portal/contribuicao/page.tsx:40` |
| A162 | 'Lista de espera' acumula pedidos mortos e 'Minhas reservas' cresce sem limite nem separação | layout | baixa | baixo | pequeno | `src/app/portal/hospedagem/page.tsx:227` |
| A163 | Logo do conveniador, validade e e-mails das unidades existem no dado e somem na tela | conteudo | baixa | baixo | pequeno | `src/app/portal/convenios/page.tsx:55` |
| A164 | Categoria 'Outros' abre a página de Convênios em vez de fechá-la | bug | baixa | baixo | pequeno | `src/app/portal/convenios/page.tsx:25` |
| A165 | Paginação de 10 numa página dedicada à lista de atendimentos | consistencia | baixa | baixo | pequeno | `src/app/portal/saude/page.tsx:38` |
| A166 | Hash SHA-256 inteiro em cada item do histórico — 64 caracteres de ruído por votação no celular | layout | baixa | baixo | pequeno | `src/app/portal/votacao/page.tsx:237` |
| A167 | Visualização pela gestão desliga o formulário inteiro, contra o contrato do AcaoVisualizacao | consistencia | baixa | baixo | pequeno | `src/app/portal/atendimento/page.tsx:49` |
| A168 | Trabalhador não-filiado digita CPF sem máscara e o código sem orientação de validade/reenvio | acessibilidade | baixa | baixo | pequeno | `src/app/portal/oposicao/oposicao-portal-forms.tsx:116` |
| A169 | Área 'Agenda' na ajuda é um fantasma: a página virou redirect, mas o índice ainda mostra dois cards iguais | consistencia | baixa | baixo | pequeno | `src/lib/ajuda/manifesto-portal.ts:136` |
| A170 | 'Manual' × 'Ajuda': três nomes para a mesma coisa na tela do associado | consistencia | baixa | baixo | pequeno | `src/components/ajuda/ajuda-nav.tsx:57` |
| A171 | Nav lateral sticky entra por baixo do cabeçalho ao rolar (top-24 < altura real do header) | layout | baixa | baixo | pequeno | `src/app/portal/ajuda/layout.tsx:31` |
| A172 | A mesma captura de tela aparece duas vezes no artigo de Votação, com legenda que promete o que a imagem não mostra | bug | baixa | baixo | pequeno | `src/conteudo/portal/votacao/index.mdx:27` |
| A173 | Botão "voltar" reimplementado seis vezes com espaçamento e altura inconsistentes; VoltarLista existe e não é usado | consistencia | baixa | baixo | pequeno | `src/app/portal/atendimento/[id]/page.tsx:38` |
| A174 | No celular o cabeçalho fixo não diz em que seção o associado está | navegacao | baixa | baixo | pequeno | `src/app/portal/portal-shell.tsx:97` |
| A175 | Polimento da casca: botão fechar do Sheet com 28px, z-index cru em vez dos tokens e padding inferior fixo do main | consistencia | baixa | baixo | pequeno | `src/components/ui/sheet.tsx:72` |
| A176 | Preferências de contato espalhadas (avisos num lugar, mala direta na LGPD) e e-mail sem link de ajuste | consistencia | baixa | baixo | pequeno | `src/app/portal/avisos/preferencias/page.tsx:36` |
| A177 | 'Últimos 12 meses' soma todos os tipos de contribuição como se fosse só a mensalidade | consistencia | baixa | baixo | pequeno | `src/lib/db/carteirinha.ts:168` |
| A178 | Tamanhos de fonte fora da escala (10px e 11px) na navegação, nos badges e no código Pix | consistencia | baixa | baixo | pequeno | `src/app/portal/portal-nav.tsx:133` |
| A179 | Botão de fechar da folha 'Mais seções' é lido como 'Close' (em inglês) | conteudo | baixa | baixo | pequeno | `src/components/ui/sheet.tsx:80` |
| A180 | 'Sou trabalhador / Sou filiado' na Oposição: seleção só por cor, sem estado acessível | acessibilidade | baixa | baixo | pequeno | `src/app/portal/oposicao/oposicao-portal-forms.tsx:26` |
| A181 | Páginas da Oposição sem landmark <main> | acessibilidade | baixa | baixo | pequeno | `src/app/portal/oposicao/page.tsx:56` |
| A182 | Datas e dinheiro formatados por quatro caminhos; lista de notícias mostra data sem ano | consistencia | baixa | baixo | pequeno | `src/app/portal/contribuicao/page.tsx:77` |
| A183 | Título da aba com quatro sufixos diferentes; o Início não diz 'Início' | consistencia | baixa | baixo | pequeno | `src/app/portal/carteirinha/page.tsx:16` |
| A184 | Cabeçalho de página: ícone só em duas, subtítulo em dois tamanhos, ação só numa, h1 diferente do rótulo do menu | consistencia | baixa | baixo | pequeno | `src/app/portal/carteirinha/page.tsx:32` |
| A185 | Contagem regressiva da oposição usa data sem fuso: encerra no horário do aparelho, não no de Brasília | bug | baixa | baixo | pequeno | `src/app/portal/inicio/page.tsx:221` |
| A186 | Rota "meus dados" redireciona sessão vencida para a origem fixa NEXT_PUBLIC_SITE_URL, não para o subdomínio do tenant | bug | baixa | baixo | pequeno | `src/app/portal/lgpd/meus-dados/route.ts:13` |
| A187 | Falhas de "Inscrições abertas" e "Avalie sua hospedagem" no Início são engolidas sem nenhum sinal | bug | baixa | baixo | pequeno | `src/app/portal/inicio/page.tsx:104` |
