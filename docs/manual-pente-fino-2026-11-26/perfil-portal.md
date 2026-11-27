# Meu perfil (painel/perfil), portal do associado, meus-dados, sem-acesso, privacidade, tenant-*

Rotas conferidas: 61 (27 em `painel/perfil` + `painel/sem-acesso`; 30 em `portal`; 2 em `meus-dados`; `privacidade`, `tenant-suspenso`, `tenant-inexistente`).

Artigos lidos: `introducao/meu-perfil` (versão da pasta em 26/11), `introducao/index`, `introducao/avisos`, `introducao/telegram`, `introducao/celular`, `introducao/seguranca`, `introducao/busca`, `introducao/indicadores`, `introducao/suporte`; todos os 15 de `src/conteudo/portal/*`; e, para as telas do perfil, os trechos de autosserviço em `pessoal/{ferias,faltas,ponto,diarias,reembolsos,contracheques,informes,treinamentos,atestados-aso,anuenios-niveis,plano-saude}`, `financeiro/{caixa,cartoes}`, `viagens/index`, `ferramentas/projetos`, `representacao/acordos`, `fluxos-publicos/evento` (Meus dados) e `institucional/lgpd`. Também conferi `docs/manual-auditoria-2026-11.md` e `docs/manual-entregas-2026-11-14.md`.

**Resumo.** O portal está bem documentado: quase todo rótulo de tela aparece no artigo da seção. No Meu perfil, cada subpágina tem explicação em algum artigo de área (Pessoal, Financeiro, Viagens, Ferramentas). O problema maior é outro: o "Ajuda desta tela" de 18 subpáginas leva ao artigo genérico `introducao/meu-perfil`, que só lista os nomes das áreas e não aponta para onde está a explicação. As lacunas de efeito jurídico estão na oposição: a fonte pagadora e a matrícula, a troca do arquivo enviado e "Não quero me opor".

## Telas sem nenhum artigo

| Rota | O que a tela faz | Artigo sugerido (novo ou existente) | Prioridade |
|---|---|---|---|
| `/tenant-suspenso` | Tela "Organização suspensa": acesso bloqueado, manda falar com o responsável pela conta (`src/app/tenant-suspenso/page.tsx:12-17`) | `introducao/index`, em "Erros comuns": uma linha para cada mensagem | P3 |
| `/tenant-inexistente` | Tela "Organização não encontrada", que aparece com endereço errado (`src/app/tenant-inexistente/page.tsx`) | Idem | P3 |

As demais têm artigo: `/painel/sem-acesso` está em `introducao/index.mdx:130`, `/privacidade` em `institucional/lgpd.mdx:82-84`, `/meus-dados` em `fluxos-publicos/evento.mdx:81-115` e `/portal/ajuda/*` é o próprio manual.

## Lacunas em telas que têm artigo

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| `/portal/oposicao/[id]` | "Escolha a fonte pagadora desta oposição", "Sua fonte pagadora", "Outra (não está na lista)", "Matrícula na fonte pagadora" / "(se souber)" | ausente | O artigo diz só "escolha a empresa". Falta dizer: (1) a carta sai com a fonte e a matrícula escolhidas; (2) a lista é a das fontes da campanha (sem elas, os vínculos do cadastro), com pré-seleção quando há uma fonte sua; (3) a matrícula acompanha a fonte até ser digitada à mão; (4) para não filiado, a matrícula é **obrigatória** quando a campanha exige essa prova; (5) o que fazer quando a empresa não está na lista | portal/oposicao | **P1** | `src/app/portal/oposicao/[id]/oposicao-flow.tsx:116-142,324,387-431` |
| `/portal/oposicao/comprovante/[id]` | "Enviou o arquivo errado? Enviar outro" / "Enviar outro arquivo" | ausente | A carta enviada pode ser trocada **só enquanto a entidade não a avaliou e o prazo está aberto**. Depois disso, só se a entidade pedir uma nova carta. Hoje o artigo fala só do pedido de nova carta. Quem mandou o arquivo errado não sabe que ainda pode corrigir dentro do prazo | portal/oposicao | **P1** | `src/app/portal/oposicao/comprovante/[id]/page.tsx:117,689,734-745` |
| `/portal/oposicao/[id]` | "Não quero me opor" (confirmação "Seguir sem registrar oposição?") e o aviso "Você optou por não se opor em …" | ausente | Explicar que o botão registra a escolha de **não** se opor, e não é um "cancelar"; que dá para voltar e registrar a oposição enquanto o prazo estiver aberto; e o aviso que aparece depois | portal/oposicao | P2 | `src/app/portal/oposicao/[id]/oposicao-flow.tsx:101-114,306-317`; `src/app/portal/oposicao/[id]/page.tsx:172-180` |
| `/portal/oposicao/comprovante/[id]` | "Baixar comprovante (PDF)", "Baixar comprovante do registro (PDF)", "Imprimir", "Baixar a carta assinada" / "Ver o PDF enviado", link `/verificar/<certificado>` | parcial | O artigo diz só que o comprovante "chega por e-mail". Faltam o PDF e a impressão pela tela, e a conferência pública da assinatura feita pelo Confluir | portal/oposicao | P3 | `src/app/portal/oposicao/comprovante/[id]/page.tsx:322,396-397,714-731` |
| `/portal/hospedagem` | "Você não pode pedir hospedagem agora" (bloqueio por não comparecimento); bloco "Não comparecimento" em Regras de utilização | parcial | O artigo diz só que a falta "pode gerar punição". Faltam as penalidades que o sistema aplica (suspensão por um período, direito desabilitado, cota do período consumida), que o bloqueio aparece no formulário com o motivo e onde ler a regra (Regras de utilização, "Não comparecimento"). Também falta que o hotel de reserva na hora bloqueia o pedido quando falta o sexo no cadastro, com o link para pedir a correção | portal/hospedagem | P2 | `src/app/portal/hospedagem/cupom-portal.tsx:163-169,214-235`; `src/app/portal/hospedagem/direito.ts:44-72`; `src/app/portal/hospedagem/regras-utilizacao.tsx:53-57` |
| `/portal/hospedagem` e `/portal/hospedagem/reserva/[id]` | Cartão "O que você ainda pode cancelar"; botão "Compartilhar" (ao lado de "Copiar link") | parcial | O artigo manda cancelar "em Minhas reservas", mas o cartão se chama "O que você ainda pode cancelar". O "Compartilhar" do celular não é citado | portal/hospedagem | P3 | `src/app/portal/hospedagem/page.tsx:721-728`; `src/app/portal/hospedagem/reserva/[id]/compartilhar-reserva.tsx:56-63` |
| `/portal/avisos/preferencias` | Cartão "Comunicados da entidade" (parar de receber as mensagens por e-mail da entidade) | ausente no artigo de Avisos | O artigo de Avisos não cita o cartão. Ele está só em Privacidade e dados, como "Comunicados por e-mail". Basta uma frase com link | portal/avisos | P3 | `src/app/portal/avisos/preferencias/page.tsx:149-172` |
| `/portal/noticias` | Selo "Nova" nas notícias novas desde a última visita | ausente | O selo fica guardado no navegador: some na visita seguinte e não aparece em aba anônima nem em outro aparelho | portal/noticias | P3 | `src/app/portal/noticias/novas-desde.tsx:8-16,85-87` |
| `/portal/eventos` | "Este evento foi cancelado. …" e "Este evento pede foto para a entrada", que aparece antes de "Quero participar" | parcial | O artigo trata o evento adiado, mas não o cancelado (o que acontece com a inscrição) | portal/eventos | P3 | `src/app/portal/eventos/page.tsx:310-315,395-398` |
| `/portal/convenios` | Atalhos por categoria ("Categorias de convênio"), "Ligar para", "Escrever para", "Ver no mapa", "Abrir site", "Limpar busca" | parcial | O artigo cita a busca, mas não os atalhos de categoria nem os botões de contato de cada unidade | portal/convenios | P3 | `src/app/portal/convenios/convenios-lista.tsx:100-140,242-260` |
| `/portal` (entrada) | "Só quero entrar, sem criar senha"; "Usar outro CPF" | ausente | No fluxo "Esqueci minha senha / criar senha", dá para entrar sem criar senha | portal/visao-geral | P3 | `src/app/portal/entrada-por-codigo.tsx:141,183` |
| `/painel/perfil/*` (18 subpáginas) | Contracheques, Controle de ponto, Informes, Acordos, Minha carreira, Minhas férias, Ausências e atestados, Faltas justificadas, Meus ASOs, Meus treinamentos, Minhas diárias, Diárias anteriores, Meu caixa, Despesas em caixas, Meu cartão, Minhas viagens, Minhas tarefas, Meu plano de saúde | parcial (o artigo aberto pelo "Ajuda desta tela" não explica) | `meu-perfil` só lista os nomes. A explicação de cada área está em outro artigo, sem link a partir dali (ver a seção de rotas abaixo). Exemplo: a pendência de 14/11 ("Cancelar férias até o dia do início; cancelar falta enquanto aguarda") já está em `pessoal/ferias.mdx:115-118` e `pessoal/faltas.mdx:21-45`, mas quem clica no "?" em Minhas férias cai em `meu-perfil`, que não diz isso. Sugestão: em "Áreas de funcionário e de diretor", transformar cada item em link para o artigo da área | introducao/meu-perfil | P2 | `src/app/painel/perfil/page.tsx:86-238`; `src/lib/ajuda/rota.ts:31` |
| `/painel/perfil` | Cartão "Minhas tarefas" em Conexões e atalhos | ausente | Não está na lista de Conexões e atalhos do artigo. Só aparece quando há tarefas **suas** em aberto (com a contagem de pendentes e atrasadas) | introducao/meu-perfil | P2 | `src/app/painel/perfil/page.tsx:653-662` |
| `/painel/perfil` | Cartão "Pedidos a outros setores" (abre `/painel/pedidos`) | ausente | Aparece para todos e não está na lista do artigo | introducao/meu-perfil | P3 | `src/app/painel/perfil/page.tsx:702-707` |
| `/painel/perfil` | "Meu plano de saúde" em Conexões e atalhos, para quem está no plano e não é funcionário (diretor) | parcial | O artigo coloca o cartão só em "Saúde e segurança", que é do funcionário | introducao/meu-perfil | P3 | `src/app/painel/perfil/page.tsx:624,680-686` |
| `/painel/perfil` | "E-mail principal (recebe os avisos)", no lápis de Dados pessoais | parcial | O artigo diz que é o e-mail que recebe os avisos. Não diz se trocá-lo muda o e-mail de **entrada** no Confluir. A gravação altera só `usuarios.email` | introducao/meu-perfil | P2 | `src/app/painel/perfil/perfil-forms.tsx:63-66`; `src/lib/db/perfil.ts:131-142` |
| `/painel/perfil` | Funcionário **desligado** | ausente | Quem sai do quadro e mantém o login continua vendo Meus relatórios e documentos (contracheques, ponto, informes, férias…), menos o grupo Financeiro e os alertas do topo. O artigo não diz isso, e é o caminho para o ex-funcionário pegar o informe de rendimentos | introducao/meu-perfil | P2 | `src/app/painel/perfil/page.tsx:265,609-618`; `src/lib/db/perfil.ts:82-87` |
| `/painel/perfil` | Faixa azul ao voltar de uma área que não se aplica ("…são áreas de funcionário do sindicato — elas não se aplicam ao seu usuário" / "Diárias e reembolsos do acordo coletivo são pedidos de funcionário com vínculo em vigor") | ausente | Explicar a mensagem em "Erros comuns" | introducao/meu-perfil | P3 | `src/app/painel/perfil/page.tsx:361-369`; `src/lib/db/perfil.ts:85` |
| `/painel/perfil` | "Remover foto"; foto em JPG, PNG ou WEBP de até 3 MB, recortada em quadrado | ausente | O artigo cita só a câmera para trocar a foto | introducao/meu-perfil | P3 | `src/app/painel/perfil/foto-perfil.tsx:16-18,89-120`; `src/lib/db/perfil.ts:173-175` |
| `/painel/perfil/avisos` | Grupos da tabela: "Notificações sobre você" (também no sino), "Quando chega uma pendência para você" (não vão para o sino) e "Lembrete e resumos" | ausente | O artigo explica sino × caixa de entrada, mas não os três grupos da tabela nem o que cada um faz com o sino | introducao/avisos | P3 | `src/app/painel/perfil/avisos/avisos-form.tsx:17-31` |

### Defasado

| Rota | Feature | Situação | O que o manual diz × o que a tela faz | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| `/meus-dados/[token]` | Tela do código ("Confirme que o e-mail é seu") | defasado | O artigo manda, em "Não recebi o código", usar "o botão de reenviar". A tela do código só tem "Entrar": não há reenviar. O caminho é voltar a `/meus-dados` e informar o e-mail de novo. Com o acesso vencido, aparece "Começar de novo" | fluxos-publicos/evento | P2 | `src/conteudo/ajuda/fluxos-publicos/evento.mdx:108-109`; `src/app/meus-dados/formularios.tsx:55-80`; `src/app/meus-dados/[token]/page.tsx:127-158` |

## Rotas sem "Ajuda desta tela"

**Painel, com artigo genérico.** Estas rotas casam pelo prefixo `/painel/perfil` e levam a `introducao/meu-perfil`, que não explica a tela. Sugestão de entradas em `EXTRAS` (`src/lib/ajuda/rota.ts:22-88`):

- `/painel/perfil/ferias` → `/painel/ajuda/pessoal/ferias`
- `/painel/perfil/faltas` → `/painel/ajuda/pessoal/faltas`
- `/painel/perfil/ponto` → `/painel/ajuda/pessoal/ponto`
- `/painel/perfil/carreira` → `/painel/ajuda/pessoal/anuenios-niveis`
- `/painel/perfil/asos` e `/painel/perfil/ausencias` → `/painel/ajuda/pessoal/atestados-aso`
- `/painel/perfil/treinamentos` → `/painel/ajuda/pessoal/treinamentos`
- `/painel/perfil/informes` → `/painel/ajuda/pessoal/informes`
- `/painel/perfil/plano-saude` → `/painel/ajuda/pessoal/plano-saude`
- `/painel/perfil/diarias` (e `/historico`) → `/painel/ajuda/pessoal/diarias`
- `/painel/perfil/caixa` e `/painel/perfil/despesas-caixa` → `/painel/ajuda/financeiro/caixa`
- `/painel/perfil/cartao` → `/painel/ajuda/financeiro/cartoes`
- `/painel/perfil/viagens` (e `/[id]`) → `/painel/ajuda/viagens`
- `/painel/perfil/tarefas` → `/painel/ajuda/ferramentas/projetos`
- `/painel/perfil/acordos`: fica em meu-perfil, porque o artigo `representacao/acordos` é do cadastro, para a gestão

Já estão mapeadas corretamente: `/painel/perfil/reembolsos`, `contracheques`, `avisos`, `telegram`, `veiculos` e `dados-bancarios` (este pelo prefixo, e `meu-perfil` cobre a tela).

**Painel, só o índice.** `/painel/sem-acesso` cai no índice `/painel/ajuda` (`rota.ts:116-121`). Aceitável: a mensagem está em `introducao/index.mdx:130`.

**Portal.** `/portal/agenda` só fica de pé quando Eventos está desabilitado (`src/app/portal/agenda/page.tsx:31`). Nesse caso o artigo de eventos sai da ajuda, e o "?" leva ao índice. Todas as outras seções do portal estão no mapa, e `/portal/sindicato` já foi corrigido desde a auditoria de 11/2026.

**Páginas públicas, sem botão de ajuda.** `/portal` (tela de entrada), `/meus-dados`, `/meus-dados/[token]`, `/privacidade`, `/tenant-suspenso` e `/tenant-inexistente`. O caso grave é o de quem não consegue entrar no portal: a ajuda do portal exige login (`src/app/portal/ajuda/layout.tsx:69`, `requireVisualizacaoPortal`). A seção "Como entrar" e as mensagens da tela de entrada (`portal/visao-geral`) ficam fora do alcance justamente dessa pessoa. O `/manual` também aponta para `/portal/ajuda`.

## Prints sugeridos (só os críticos)

| Tela | Por quê | Arquivo sugerido |
|---|---|---|
| `/portal/oposicao/[id]`, passo "Seus dados e a confirmação", com "Sua fonte pagadora" aberta e o campo "Matrícula na fonte pagadora" | A escolha vai para a carta, que tem efeito jurídico. Pessoa sem treino | portal/oposicao-fonte-pagadora.png |
| `/portal/carteirinha`, modo "Apresentar carteirinha" | Já sugerido na auditoria de 11/2026 e ainda sem print (o artigo não tem nenhum) | portal/carteirinha-apresentar.png |
| `/portal/contribuicao`, com "Desconto não localizado" e o Pix com QR | Já sugerido na auditoria e ainda sem print: é dúvida de dinheiro | portal/contribuicao.png, portal/contribuicao-pix.png |

## Possíveis defeitos vistos de passagem

1. **A ajuda do portal exige login.** Quem não consegue entrar não lê "Como entrar", e a tela de entrada não tem link de ajuda (`src/app/portal/ajuda/layout.tsx:69`; `src/app/portal/page.tsx:28-38`).
2. **"O que você segue" sem caminho pelo Meu perfil.** O cartão "Minhas tarefas" só aparece com tarefa própria em aberto (`src/app/painel/perfil/page.tsx:653`). Quem só segue tarefas não chega à lista "O que você segue" (`src/app/painel/perfil/tarefas/page.tsx:115`), que `ferramentas/projetos.mdx:376` manda abrir por ali.
3. **Carteirinha (já reportado na auditoria de 11/2026, segue aberto).** O cartão diz "Quem ler o QR vê nome, matrícula e a condição atual da filiação. Nada mais.", mas a verificação também mostra "Filiado(a) desde" (`src/app/portal/carteirinha/page.tsx:165`; `src/app/carteirinha/[codigo]/page.tsx:49-52`).
4. **E-mail principal do Meu perfil.** A gravação muda só `usuarios.email` (`src/lib/db/perfil.ts:131-142`). Vale conferir se o e-mail de entrada (auth) fica dessincronizado, e decidir o que o rótulo deve prometer.
