# Institucional, Gestão, Comunicação e transversais

Rotas conferidas: 96 no total. São 45 do Institucional sem Viagens, mais as 7 de Viagens, das quais só o "Ajuda desta tela" foi conferido. Somam-se 30 de Gestão, indicadores, novidades, notificações, ajuda, home, tv, comunicados, oficio e admin, e 21 de Comunicação. Também foram conferidos os componentes de `src/components/layout/*` e o bot do Telegram.

Artigos lidos: institucional/{index, diretoria, ajudas, custeios, lgpd}; gestao/{index, usuarios, ia, api, auditoria, email, controle-acesso}; noticias/{index, noticias, resumo-ia, assistente-redacao, qrcodes, slides-tv, pagina-links, etiquetas, aniversariantes, mala-direta}; introducao/{index, avisos, busca, celular, indicadores, meu-perfil, seguranca, suporte, telegram}. Também `manifesto.ts`, `rota.ts` e as auditorias de 04/11 e 14/11.

O relatório tem três partes, cada uma no formato do brief:
1. Institucional
2. Gestão, indicadores, transversais, rotas públicas e o bot do Telegram
3. Comunicação

## Resumo consolidado

| Parte | Telas sem artigo | P1 | P2 | P3 | Defasados | Rotas com ajuda errada/ausente |
|---|---|---|---|---|---|---|
| Institucional | 0 (+1 artigo fantasma no índice) | 0 | 8 | 12 | 10 | 4 (atas, deliberações, viagens/solicitacoes, viagens/configuracoes) |
| Gestão e transversais | 3 (/admin/**, só super-admin) | 2 | 4 | 8 | 3 | 2 (gestao/email; indicadores) |
| Comunicação | 0 | 0 | 1 | 15 | 1 | 2 grupos (textos/*, aniversariantes/*) |
| **Total** | **3** | **2** | **13** | **35** | **14** | **8** |

As lacunas P1 e as P2 de maior efeito são estas:
- **P1:** **Unificar cadastros** (Gestão › Usuários › pessoa) não aparece no manual. A ação não tem volta: fica o cadastro com login, e o outro fica inativo.
- **P1:** A **alçada** está defasada. O manual diz que o ajuste individual sobrepõe a do perfil, mas o código usa a maior entre as duas. O ajuste individual nunca reduz, e um perfil com a alçada em branco não tem teto (`permissoes-resolver.ts:85-108`).
- **P2:** Na LGPD, a regra **RT38** (anonimiza os e-mails enviados) não está no artigo.
- **P2:** O índice do Institucional ainda descreve Usuários, API, Auditoria e Controle de acesso como áreas dele, com a permissão errada. Desde 19/11 essas áreas estão na Gestão.
- **P2:** No Custeio, o envio do **documento fiscal por parcela**, que tem um campo de valor corrigível, não aparece no artigo.
- **P2:** Na Diretoria, o manual manda "ligar a pessoa a um usuário no lápis", mas esse campo não existe: a ligação é pelo CPF.
- **P2:** O botão **Interromper envio** da mala direta não pede confirmação e não tem volta.

---

# Institucional (`src/app/painel/institucional/**`)

Rotas conferidas: 45 do Institucional sem Viagens. São elas: hub, organizacao (+ departamentos, departamentos/[id], sedes, sedes/[id]), diretoria (+ [id], [id]/[integranteId], [id]/atas, [id]/instancias, [id]/liberacoes, instancias, instancias/[id], diarias, diarias/[id], diarias/remessas, diarias/remessas/[id]), atas (+ novo, [id]), deliberacoes, registro-mte (+ novo, [id]), emails, linhas (+ [id]), ramais, ajudas (+ novo, [id], entidades, entidades/novo, entidades/[id]), custeios (+ novo, [id], finalidades, convidados, convidados/novo, convidados/[id]) e lgpd. As 7 rotas de `viagens/**` só tiveram o "Ajuda desta tela" conferido: o conteúdo delas é da área de manual Viagens (`ajuda/viagens/*`), que fica fora desta fatia.

Os **ofícios** não ficam em `institucional/**`: estão em `/painel/ferramentas/oficios`, com o artigo `ferramentas/oficios`, e ficaram fora desta parte. Desta fatia, só entram a página pública `/oficio/[id]` (ver parte Gestão/transversais) e o vínculo das liberações com o ofício, que está coberto.

Artigos lidos inteiros: institucional/index, diretoria, ajudas, custeios e lgpd. Também conferidos `src/lib/ajuda/manifesto.ts` (áreas institucional e gestao), `rota.ts` e o catálogo de permissões.

Panorama: Diretoria, Atas/Deliberações, Ajudas e Custeio estão bem escritos e detalhados. O que mais falta é **defasagem da mudança de 19/11**: Usuários, API, Auditoria e Controle de acesso saíram do Institucional e foram para a Gestão, mas o índice do Institucional e o manifesto não acompanharam. Também ficaram para trás a **regra RT38 da LGPD**, que é nova, e a forma de ligar o diretor a uma conta de usuário.

## Telas sem nenhum artigo

Nenhuma rota fica sem texto. Mas o **índice do manual** lista um artigo fantasma:

| Rota | O que a tela faz | Artigo sugerido (novo ou existente) | Prioridade |
|---|---|---|---|
| /painel/ajuda/institucional/auditoria | O manifesto lista "Auditoria" na área Institucional, mas não existe `institucional/auditoria.mdx`. A página abre o aviso de artigo "em produção" | Tirar a entrada do manifesto (o artigo é `gestao/auditoria`) | P2 |

## Lacunas em telas que têm artigo

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/institucional | Hub: "Usuários, integrações e IA ficam em Gestão." | defasado | O artigo apresenta **Usuários, LGPD, Auditoria e API** e **Controle de acesso** como áreas do Institucional e diz que o Controle de acesso "Exige a permissão de Organização". No hub só resta o cartão **LGPD: retenção e descarte**. Usuários, Auditoria, API e Controle de acesso estão em Gestão, e o Controle de acesso exige **Gestão do sistema (IA, integrações e revisão de acessos)**. Reescrever a introdução e os dois passos | institucional/index | P2 | institucional/index.mdx:1-5,33-45; src/app/painel/institucional/page.tsx:33-136,169; src/app/painel/gestao/controle-acesso/page.tsx:96 |
| /painel/institucional | Erros comuns: "Vejo uma área e não as outras" | defasado | Diz "**API e webhooks** e **LGPD** exigem a de Organização" e lista Usuários e Auditoria entre as áreas do módulo. API exige **Gestão do sistema**, e Auditoria aceita Auditoria, Gerenciar usuários ou Gestão do sistema. Faltam na lista as permissões que abrem cartões aqui: **Registro sindical (MTE)**, **E-mails institucionais** e **Linhas institucionais** (que também abre Ramais) | institucional/index | P2 | institucional/index.mdx:200-202; gestao/api/page.tsx:29; gestao/auditoria/page.tsx:42; src/lib/permissoes-catalogo.ts:209-212 |
| (manual) | Área Gestão, artigo "Auditoria das ordens" | defasado | O título e o resumo no manifesto ("Regras que o sistema confere antes de criar cada ordem") não batem com o artigo, que trata de Alterações, Exportações e API. O índice da Gestão engana quem procura a auditoria de acessos | manifesto (gestao/auditoria) | P3 | src/lib/ajuda/manifesto.ts:803-805; src/conteudo/ajuda/gestao/auditoria.mdx:1-2 |
| /painel/institucional/lgpd | Regra **RT38 · Registro dos e-mails enviados** | defasado (ausente) | A tabela "As regras" tem 5 regras, e a tela tem 6. A RT38 **não apaga, anonimiza**: tira o destinatário e quem disparou dos e-mails antigos e mantém processo, módulo, departamento, domínio e resultado. Prazo padrão de 365 dias, com mínimo de 180. Ligada, ela é sem volta como as outras. A página Gestão › E-mail perde a busca por destinatário nos envios mais velhos que o prazo | institucional/lgpd | P2 | src/lib/lgpd/retencao-regras.ts:92-103 (acao "anonimizar"); institucional/lgpd.mdx:20-26 |
| /painel/institucional/lgpd | Erros comuns: "A simulação mostrou zero…" | defasado | "Só as três regras acima são executadas por esta tela": hoje são seis (RT30, RT31, RT02, RT36, RT37, RT38) | institucional/lgpd | P3 | institucional/lgpd.mdx:115-116; retencao-regras.ts:32-93 |
| /painel/institucional/diretoria/[id] | Lápis do integrante: **Pessoa (busque nos filiados para vincular)** | defasado | O manual manda "Ligue a pessoa a um usuário no lápis dela, no mandato" e cita "a conta de usuário ligada a ele no mandato (o lápis do integrante)". O lápis **não tem campo de usuário**. A ligação é pelo CPF: busca-se o filiado e o sistema cruza com a conta que tem o mesmo CPF. Para o diretor aparecer no formulário de diária, como responsável de linha, e-mail ou ramal, ou num departamento, ele precisa ter conta de usuário com o mesmo CPF (Gestão › Usuários › Nova pessoa). Dizer isso | institucional/diretoria; institucional/index | P2 | diretoria.mdx:347-349; institucional/index.mdx:203-206; diretoria/[id]/integrante-linha.tsx:166-175; diretoria/diretoria-forms.tsx:119-128 |
| /painel/institucional/diretoria/[id] | Lixeira do integrante ("Remover este integrante do mandato?") × **Situação no mandato: Excluído** | parcial / defasado | O artigo não diz quando remover (apaga o integrante do mandato) e quando marcar Excluído (fica na lista, riscado, com data e motivo). Em Erros comuns, manda "Encerre o **mandato** ou o **vínculo do integrante**", mas não existe o botão de encerrar vínculo. Os caminhos reais são a Situação Excluído/Licenciado, a lixeira ou o **Término** do mandato no lápis dos dados | institucional/diretoria | P2 | diretoria.mdx:343-344; diretoria/diretoria-forms.tsx:244-260; diretoria/actions.ts:51-190 (não há ação de encerrar) |
| /painel/institucional/diretoria/[id] | **Novo grupo** e o botão Remover grupo ("Remover este grupo? Os integrantes ficam sem grupo (não são apagados).") | parcial | O artigo diz só que os grupos são configuráveis "em **Grupos de membros**". Falta como criar e remover, e o que acontece com os integrantes | institucional/diretoria | P3 | diretoria/diretoria-forms.tsx:187-227 |
| /painel/institucional/diretoria/[id] | **Assina ofícios** já vem marcado em Adicionar integrante | parcial | O artigo diz "se ela assinar, **Assina ofícios**". Avisar que vem marcado e deve ser desmarcado para quem não assina, porque todo integrante novo entra como assinante | institucional/diretoria | P3 | diretoria/diretoria-forms.tsx:155-162; diretoria.mdx:21-23 |
| /painel/institucional/diretoria/instancias/[id] | Cartão **Dados da instância** com lápis (nome e descrição) | defasado | O artigo diz que a página da instância é "só para consulta". Os **vínculos** são só consulta, mas o nome e a descrição se editam ali | institucional/diretoria | P3 | diretoria/instancias/[id]/page.tsx:51-74; diretoria.mdx:90-91,340-342 |
| /painel/institucional/atas | Busca "Título ou órgão", filtros **Todos os tipos** e **Todos os mandatos**, aviso "Ata excluída." | parcial | O artigo só diz que "há também uma visão geral das atas na área própria", sem os filtros e sem dizer que o Exportar XLSX segue o filtro. Esta segunda parte está escrita, mas noutra seção | institucional/diretoria | P3 | atas/page.tsx:74,104-118 |
| /painel/institucional/organizacao/sedes/[id] | **Editar sede** (Logradouro, Complemento, Bairro, Cidade, Telefones, CEP) | parcial | Não há como **criar, renomear ou excluir sede** pela tela. Só se editam endereço e telefones das sedes que já existem. O artigo não diz isso, e quem precisa cadastrar uma subsede nova não sabe que precisa pedir a quem administra o sistema | institucional/index | P2 | organizacao/organizacao-forms.tsx:223-302; organizacao/actions.ts:122-143; organizacao/page.tsx:167-178 (sem botão de nova sede) |
| /painel/institucional/organizacao | Linha "Legados (fora das listas de escolha):", com os nomes como link, e o botão **Reativar** na página do departamento | defasado | O artigo diz que o departamento legado "fica em **Departamentos legados**, onde pode ser **reativado**". Não há seção com esse nome: é uma linha de links abaixo dos cartões, e o Reativar fica dentro da página do departamento | institucional/index | P3 | organizacao/page.tsx:228-241; departamentos/[id]/page.tsx:68-76; departamento-forms.tsx:268-277; index.mdx:99-101 |
| /painel/institucional/organizacao | **Página de notícias** e **Feed RSS de notícias** | parcial | O artigo só lista os campos. Falta dizer para que servem: alimentam as notícias do painel (a coluna do dia) | institucional/index | P3 | organizacao-forms.tsx:110-127; src/lib/db/painel.ts:297,383 |
| /painel/institucional/ajudas/entidades/[id] | **Inativar** / **Reativar** ("Inativar esta entidade? Ela sai das buscas de ajuda.") e os selos **Inativa** e **Bloqueada para ajuda** | ausente | O artigo só fala em excluir. Inativar é a saída para a entidade que tem ajuda cadastrada e não pode ser excluída. O selo "Bloqueada para ajuda" não é explicado (quem bloqueia e o que impede) | institucional/ajudas | P3 | ajudas/entidades/[id]/page.tsx:158-186; ajudas/entidades/page.tsx:135 |
| /painel/institucional/ajudas/[id] | **Editar** no cartão Dados da ajuda | ausente | O artigo cita aditivo e exclusão, mas não diz que a ajuda se edita. Também não diz se mudar valor ou vigência altera as ordens já geradas (a edição não mexe nelas) | institucional/ajudas | P3 | ajudas/[id]/page.tsx:210-236; ajudas/actions.ts:77-98 |
| /painel/institucional/custeios/[id] | Ordem em **Aguardando documento fiscal**: arquivo, **Valor do documento** ("altere se veio diferente da parcela") e **Enviar** | ausente | O artigo diz que a parcela recorrente "espera só o documento fiscal", mas não diz **onde** enviá-lo. Faltam: o campo fica na coluna Situação da ordem; o valor pode ser corrigido; a auditoria pode abrir a confirmação; o resultado é "seguiu para pagamento" (parcela já autorizada) ou "seguiu para autorização" | institucional/custeios | P2 | custeios/[id]/page.tsx:661-666; custeios/[id]/custeio-pagamentos.tsx:232-289; custeios/actions.ts:519-557 |
| /painel/institucional/custeios/novo | **Centro de custo** ("Usar o padrão da finalidade"), **Evento (opcional)**, **Formalização** e boleto já no cadastro | parcial | O artigo diz que o centro "é herdado automaticamente", mas não que pode ser trocado no cadastro. Também não cita o campo Evento nem que a formalização pode ir junto já no cadastro | institucional/custeios | P3 | custeios/custeio-form.tsx:230-256,405-431 |
| /painel/institucional/custeios/finalidades | **Tipo de beneficiário sugerido**, **Ordem de exibição**, **Finalidade ativa (aparece ao criar custeios)** | parcial | O artigo só diz "crie outras em Finalidades". Falta: desmarcar "Finalidade ativa" tira a finalidade das escolhas, mas os custeios antigos continuam com ela; o tipo sugerido pré-escolhe o beneficiário; a ordem define a posição na lista | institucional/custeios | P3 | custeios/finalidades/finalidade-form.tsx:48-121 |

Conferido e coberto, sem lacuna: Regras de filiação; departamentos (pessoas, coordenador, tornar legado); Linhas (filtros, cartões, Remover linha); Ramais; E-mails institucionais; Registro MTE (campos, Editar, Excluir, documento vazio mantém); Diretoria (mandato, ficha que reflete a filiação, situação, instâncias, liberações individual e em lote); Atas (IA, numeração, sigilo, Exportar XLSX); Deliberações (quadros, filtros, Sob minha responsabilidade, histórico, avisos de prazo, níveis de sigilo); Diárias da diretoria (Lançar diária, Remessas, Retirar); Ajudas (quadros, Gerar ordens, Anexar nota, contas arquivadas, Adicionar aditivo); Custeio (fluxo, Vincular a um projeto, Gerar ordens, Excluir marcadas, Editar e Excluir ordem, cancelar, CSV); LGPD (simular, prazo, Execução real ligada com confirmação, Novo bloqueio, Bloquear descarte, Encerrar, Livro de execuções).

## Rotas sem "Ajuda desta tela" (ou com o artigo errado)

- **/painel/institucional/atas** (e `/novo`, `/[id]`) e **/painel/institucional/deliberacoes** caem no **índice** do Institucional, que só tem uma linha e um link sobre elas. O texto está em `institucional/diretoria` (seções Atas de reunião e Deliberações). Sugestão: entradas em EXTRAS para as duas rotas → `/painel/ajuda/institucional/diretoria`. Evidência: src/lib/ajuda/rota.ts:56-61 (regra slug = segmento; não há artigo "atas" nem "deliberacoes"), :20-88 (sem EXTRAS).
- **/painel/institucional/viagens/solicitacoes** e **/viagens/configuracoes** caem no índice de Viagens (o pedido da pessoa), e não em `viagens/atendimento`, que explica Solicitações e Configurações. Só `/viagens/faturas` tem EXTRAS. Evidência: rota.ts:15-16,72; src/lib/permissoes.ts:388 (só `/painel/institucional/viagens` em MODULOS).
- Organização, Registro MTE, E-mails, Linhas e Ramais caem no índice do Institucional, onde está o texto deles: aceitável.

## Prints sugeridos (só os críticos)

| Tela | Por quê | Arquivo sugerido |
|---|---|---|
| /painel/institucional (hub) | O print atual mostra os cartões **Usuários e permissões** e **Auditoria**, que saíram para a Gestão (o texto alternativo também os cita) | institucional/painel.png (refazer) |
| /painel/institucional/lgpd, cartão da RT38 em Só simulação | Regra nova, com efeito sem volta, ausente do artigo | institucional/lgpd-rt38.png (opcional; o print RT02 já cobre o mecanismo) |

## Possíveis defeitos vistos de passagem

1. **Cartões que levam a "sem acesso"** (já apontado em 04/11, segue igual). O hub mostra **Atas de reunião**, **Registro sindical (MTE)** e **E-mails institucionais** a quem tem só Organização (`chavesAlternativas: ["configuracoes"]`), mas as páginas recusam essa permissão. Evidência: institucional/page.tsx:57,73,81 × atas/page.tsx:45, registro-mte/page.tsx:44, emails/page.tsx:34.
2. **Artigo fantasma no manifesto:** `institucional/auditoria` sem `.mdx` gera a página "em produção" no índice do Institucional (manifesto.ts:752-756; ajuda/[area]/[topico]/page.tsx:33-38).
3. **Texto técnico para o usuário** em Organização: "rode supabase/empresa-filiacao-exige-fonte.sql" e "rode supabase/organizacao-diretoria.sql" (organizacao/page.tsx:126,164). No LGPD aparece o caminho da migração (lgpd/page.tsx, bloco `!dados.disponivel`). São da mesma família já apontada em 04/11, mas estes dois arquivos não estavam na lista.
4. **Assina ofícios marcado por padrão** ao adicionar integrante (diretoria-forms.tsx:155-162): conselheiro fiscal ou suplente entra como assinante de ofícios se ninguém desmarcar.

---

# Parte B — Gestão, indicadores, transversais, rotas públicas e bot do Telegram

Rotas conferidas: 30 (`painel/gestao/**` 15; `painel/indicadores/**` 4; `painel/novidades`, `painel/notificacoes`, `painel/ajuda/**` 3, `painel` (home, com `_painel/*`); `tv/[slug]`; `comunicados/sair/[token]`; `oficio/[id]`; `admin/**` 3), mais os componentes de `src/components/layout/*` (cabeçalho, barra lateral, busca, caixa de entrada, sino, ajuda/feedback, faixa fora do horário, redução de arquivos) e o bot (`api/telegram/webhook/route.ts`, `lib/telegram-*.ts`).

Artigos lidos inteiros: gestao/index, usuarios, ia, api, auditoria, email, controle-acesso; introducao/index, avisos, busca, celular, indicadores, meu-perfil (parcial, rotas fora desta parte), seguranca (sem rota nesta parte), suporte, telegram. Também conferidos noticias/slides-tv e noticias/mala-direta (para /tv e /comunicados/sair) e ferramentas/oficios (para /oficio).

Resumo: a Gestão está bem coberta (artigos de 19 a 26/11 acompanham IA, e-mail, inventário, revisão periódica). As lacunas graves estão em regras de acesso com efeito em dinheiro (alçada) e em ação sem volta (Unificar cadastros), e nos links da Introdução que levam a artigos que o leitor não pode abrir.

## Telas sem nenhum artigo

| Rota | O que a tela faz | Artigo sugerido (novo ou existente) | Prioridade |
|---|---|---|---|
| /admin, /admin/novo, /admin/[id] | Console da plataforma (super-admin): lista de organizações, criar organização com subdomínio, plano, status e o primeiro administrador (`admin/tenant-forms.tsx:41-129`; `admin/layout.tsx:11`) | Não é do manual da entidade. Se houver operador da plataforma além do desenvolvedor, um documento interno em `docs/` (fora do manual) | P3 |
| /painel/indicadores/amostra | Amostra de gráficos só em desenvolvimento; responde 404 em produção (`indicadores/amostra/page.tsx:16`) | Nenhum (não é tela de usuário) | — |

As demais rotas têm artigo: /painel/indicadores, /churn e /custos só redirecionam para `/painel?aba=gestao` (`indicadores/page.tsx:13`, `churn/page.tsx:5`, `custos/page.tsx:5`), coberto por introducao/indicadores; /tv/[slug] por noticias/slides-tv; /comunicados/sair/[token] por noticias/mala-direta (seção Descadastro); /oficio/[id] por ferramentas/oficios.

## Lacunas em telas que têm artigo

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/gestao/usuarios/[id] | Aviso "Esta pessoa tem outro cadastro no sistema…" com o botão **Unificar** e a confirmação "Unificar os cadastros?" | ausente | Quando aparece (mesmo CPF ou mesmo nome); qual cadastro fica (o que tem login); o que passa para ele (diretoria, permissões, vínculos, pedidos); o outro fica inativo, marcado como unificado; **não dá para desfazer pela tela**; com os dois com login, a tela pede para revogar o login de um antes. Quem só vê o aviso (sem Gerenciar usuários) lê "Quem administra os usuários (Gestão › Usuários) pode unificar". O mesmo aviso está na ficha do diretor (outra parte) | gestao/usuarios (nova seção "Cadastros repetidos da mesma pessoa") | P1 | src/components/outros-cadastros.tsx:44-86; src/components/unificar-cadastro-form.tsx:36-38,48; src/lib/usuarios-duplicados-regras.ts:43-50; src/app/painel/gestao/usuarios/[id]/page.tsx:111-117 |
| /painel/gestao/usuarios/[id] e /perfis/[id] | **Alçada de aprovação (R$)** (perfil) e **Alçada de aprovação em compras (R$)** (ajustes finos) | defasado | O manual diz "no ajuste individual você pode sobrepor" e, em Erros comuns, "Ajuste a alçada… no perfil ou no ajuste individual" para quem "autoriza acima do que devia". O código vale **a maior** entre a alçada individual e as dos perfis: o ajuste individual só aumenta, nunca reduz. E um perfil com a alçada **em branco** é "Sem teto" e faz a pessoa aprovar qualquer valor, por cima de tudo. Dizer isso, e que para baixar a alçada de alguém é preciso trocar o perfil | gestao/usuarios (aviso "Alçada de aprovação" e Erros comuns) | P1 | src/lib/permissoes-resolver.ts:85-108; perfis/perfil-forms.tsx:63-75 ("Vazio = sem teto (perfis de comando)"); usuarios/usuarios-forms.tsx:517-529; perfis/page.tsx:21-23; src/conteudo/ajuda/gestao/usuarios.mdx:241-245,318-319 |
| /painel/gestao/usuarios | Nova pessoa com nome já cadastrado: "Já há um cadastro com o nome …, sem este CPF", botões **É esta pessoa: conceder acesso** e **É outra pessoa: cadastrar mesmo assim** | ausente | O artigo só fala do CPF e do e-mail repetidos. Falta o terceiro caso (mesmo nome, sem CPF), o que cada botão faz (o primeiro completa o CPF no cadastro antigo e dá o acesso a ele) e que escolher errado cria duplicidade | gestao/usuarios (aviso "A Nova pessoa não duplica cadastros") | P2 | usuarios/usuarios-forms.tsx:383-413,421-440 |
| /painel/gestao/usuarios/[id] | Rótulo **Alçada de aprovação em compras (R$)** | parcial | O artigo chama de alçada para ordens de pagamento; a tela diz "em compras". Explicar que é a mesma alçada (vale para as ordens) ou corrigir o rótulo (ver Defeitos) | gestao/usuarios | P3 | usuarios/usuarios-forms.tsx:517 |
| /painel/gestao | Cartão **Revisão de acessos** e sinais da Saúde do sistema: revisão periódica em andamento/atrasada, "A chave de IA está guardada com uma chave de cifra antiga", IA desligada ou no teto | parcial | A tabela "As áreas" não lista Revisão de acessos (a tela tem o cartão); a lista da Saúde do sistema não cita os sinais da revisão periódica nem o da cifra antiga (estão espalhados em usuarios e ia) | gestao/index | P3 | src/app/painel/gestao/page.tsx:82-84,176-192,222-229 |
| /painel?aba=gestao (Indicadores) | Vista **Custos consolidados** | parcial | O artigo diz quem vê Churn, mas não quem vê Custos (Financeiro leitura/pagamento, filiação, receitas, mandatos ou Organização) | introducao/indicadores | P3 | src/app/painel/_painel/aba-indicadores.tsx:26,31 |
| /painel (aba Coordenação) | Férias da equipe só com **Autorizar** (faltas e diárias têm Recusar/Reprovar) | parcial | Dizer que férias não se recusam pela aba: para devolver, abrir no Pessoal (o artigo de avisos já diz isso para o Telegram) | introducao/celular (Coordenação) | P3 | src/app/painel/_painel/aba-coordenacao.tsx:157-162,175-180,218-219 |
| Todas as telas do painel (faixa amarela) | Faixa de uso fora do horário com **Informar o motivo**, **Trocar** e **Ver o meu uso e os dias anteriores** | parcial | A Introdução diz só que a faixa "não impede o uso" e manda a pessoal/atribuicoes-sst. O passo a passo do motivo está em pessoal/ponto, área que o funcionário comum **não pode abrir** (o manual segue as permissões). Pôr na Introdução: escolher o motivo (Urgência, Combinado com a chefia, Plantão ou sobreaviso, Compensação de horas, Outro), detalhe opcional, um por dia, trocar no dia, dias anteriores em Meu perfil → Ponto | introducao/index (Avisos que podem aparecer) | P2 | src/components/layout/alerta-fora-jornada.tsx:108-158; src/conteudo/ajuda/introducao/index.mdx:133-135; src/app/painel/ajuda/[area]/[topico]/page.tsx:30 |
| /painel (atalhos) | Links de **Solicitar veículo**, **Solicitar viagem** e da faixa fora do horário | parcial | A Introdução manda o leitor a veiculos/agendamentos, à área Viagens e a pessoal/atribuicoes-sst. Quem usa esses atalhos justamente não tem o módulo (o condutor "sem precisar de acesso ao módulo Veículos"): o link dá "sem acesso". Explicar o pedido na própria Introdução (ou em meu-perfil) | introducao/index; introducao/telegram (links para viagens e agendamentos) | P2 | src/conteudo/ajuda/introducao/index.mdx:135,143,147; introducao/telegram.mdx:85,155-156; src/app/painel/ajuda/[area]/[topico]/page.tsx:30; src/lib/ajuda/manifesto.ts:110,521 |
| Todos os campos de arquivo | Redução automática de fotos (no navegador) e de fotos/PDFs sem assinatura (no servidor), de 26/11 | ausente | Na Introdução, em Convenções: a foto grande é reduzida antes do envio, o botão espera a redução terminar, foto acima de 4 MB deixou de dar erro, e documento com assinatura digital (gov.br, ICP-Brasil) é guardado como veio. Vale conferir os artigos que ainda citam limite de 4 MB para foto | introducao/index (Convenções que se repetem) | P2 | src/components/layout/reducao-arquivos.tsx:5-17; src/lib/novidades.ts:34 |
| Cabeçalho | Botão de tema claro/escuro | ausente | Uma linha em "Como se orientar no painel" | introducao/index | P3 | src/components/layout/app-header.tsx:142 |
| Busca global | Grupo **Páginas** | defasado | O artigo diz "Cada grupo mostra até 6 resultados"; Páginas mostra até 8 | introducao/busca | P3 | src/components/layout/busca-global.tsx:79 |
| Bot do Telegram | **/devolver &lt;id da ordem&gt; &lt;motivo&gt;** | ausente | Devolver uma ordem de uma vez, sem os botões de /aprovar. A /ajuda do próprio bot também não lista /cancelar nem /devolver (já apontado em 04/11; segue igual) | introducao/telegram (Comandos) | P3 | src/lib/telegram-aprovacoes.ts:114-129; src/lib/telegram-pendencias-fluxo.ts:119-134 |
| Bot do Telegram | Sinônimos: /pendentes, /pendências, /aprovacoes, /aprovações, /férias, /diárias, /diária, /passagem, /hospedagem, /informe, /aso, /carro, /veiculos, /filiada, /filiacao, /filiação, /help | ausente | Uma linha: "o bot também entende…". Útil porque a pessoa digita com acento | introducao/telegram | P3 | src/app/api/telegram/webhook/route.ts:298,320,324,343,347,351,357,366,370,374,378-383 |
| Bot do Telegram | /carros: quem pode | parcial | O artigo diz "Quem tem acesso a Veículos"; o bot aceita também a permissão Condutores (permissão já apontada em 04/11 como sem efeito nas telas) | introducao/telegram | P3 | src/app/api/telegram/webhook/route.ts:588 |
| Bot do Telegram | /start sem código e conta não vinculada | coberto | Conferido: as respostas batem com Erros comuns | — | — | route.ts:241-283 |

Conferido e coberto (sem lacuna): Gestão → IA (chave, Testar e salvar/Testar e trocar, uso, planilha, configuração, cotas, modelo por processo, "Onde um modelo menor economizaria", Inventário com "Tempo de uma pessoa por operação"); E-mail (abas por processo/módulo/pessoa/departamento/situação/dia, histórico, planilha); API (Nova chave, Pode ler/Salvar escopos, Revogar, Novo webhook, Enviar evento de teste, Reenviar, Documentação); Auditoria (três abas, filtros, "Ver todo o histórico deste registro"); Controle de acesso; Usuários (Conceder acesso, Nova pessoa, conta de função, lote, Revogar, Encerrar sessões, MFA, Quadro, Perfis, Revisão e Revisão periódica); painel (Meu dia, Consulta de filiação, Gestão, Coordenação, Indicadores com Relatório (PDF) e Atualizar, churn com motivo em lote); caixa de entrada, sino e Notificações (Nova, Marcar todas como lidas); ajuda (Ajuda desta tela, Manual completo, O que há de novo, Relatar problema ou sugerir, Pergunte à IA); /tv; descadastro; os 14 comandos de COMANDOS_BOT, os 9 tipos de botão de pendência (`telegram-pendencias.ts:90-209` + ordens) e os três tipos de comprovante (`telegram-arquivo-fluxo.ts:24`).

## Rotas sem "Ajuda desta tela"

- **/painel/gestao/email**: não está em MODULOS nem em EXTRAS; o botão abre o índice da Gestão, não gestao/email (`src/lib/ajuda/rota.ts:22-88`; `src/lib/permissoes.ts` sem `/painel/gestao/email`).
- **Indicadores** (`/painel?aba=gestao&ver=…`): as entradas de EXTRAS para `/painel/indicadores`, `/churn` e `/custos` nunca casam, porque essas rotas redirecionam para `/painel` e o casamento ignora a query; o botão abre introducao/index, não introducao/indicadores (`rota.ts:24,27-28`; `rota.ts:107-111`; `indicadores/page.tsx:13`).
- /admin/**, /tv/[slug], /comunicados/sair/[token], /oficio/[id]: fora do painel, sem o botão (esperado: console da plataforma, tela pública, página pública e página de impressão).

## Prints sugeridos (só os críticos)

| Tela | Por quê | Arquivo sugerido |
|---|---|---|
| /painel/gestao/usuarios/[id] de quem tem outro cadastro: aviso amarelo com os dois cadastros (com login / sem login, mesmo CPF) e o botão Unificar, mais a confirmação aberta | Ação sem volta; quem fica e quem sai depende do login | gestao/usuarios-unificar.png |
| /painel/gestao/usuarios/perfis/[id]: campo Alçada de aprovação (R$) com a nota "Vazio = sem teto (perfis de comando)" | Campo em branco libera aprovação sem limite | gestao/perfil-alcada.png |

## Possíveis defeitos vistos de passagem

1. **Alçada individual não reduz** (o mais grave desta parte): `permissoes-resolver.ts:85-108` toma o maior valor entre a alçada da pessoa e as dos perfis, e qualquer perfil ativo com alçada vazia vira sem teto. Quem cria um perfil operacional e esquece a alçada dá aprovação ilimitada a todos que o têm, se também tiverem a permissão de avaliar ordens. Confirmar se é a regra pretendida.
2. **Rótulo "Alçada de aprovação em compras (R$)"** nos ajustes finos, enquanto o perfil diz só "Alçada de aprovação (R$)" e o valor vale para as ordens: `usuarios-forms.tsx:517` × `perfil-forms.tsx:63`.
3. **"Ajuda desta tela" leva a "sem acesso"** quando o artigo é de um módulo que a pessoa não tem: `/painel/solicitar-veiculo` → veiculos/agendamentos (o condutor não tem Veículos), `/painel/perfil/contracheques` e `/painel/perfil/reembolsos` → área Pessoal (o funcionário não tem Pessoal). `rota.ts:32,52-53` × `ajuda/[area]/[topico]/page.tsx:30`. Rotas de outra parte; o mecanismo é transversal.
4. **EXTRAS mortos**: `/painel/indicadores`, `/churn`, `/custos` em `rota.ts:24,27-28` nunca são a rota atual (redirecionam).
5. **Custos consolidados mostra viagens e diárias por pessoa, com valor**, a quem tem só filiação ou receitas (`aba-indicadores.tsx:26,31`; `indicadores-custos.tsx:143-180`), enquanto o cartão Viagens e hospedagens da ficha restringe os valores a quem atende viagens, diárias da diretoria ou Pessoal (`novidades.ts`, entrada de 25/11). Conferir se é intencional.
6. Ainda presentes, já apontados em 04/11: texto técnico "Falta rodar o SQL supabase/api-webhooks.sql" (`gestao/api/page.tsx:63`), "Rode supabase/auditoria.sql" (`gestao/auditoria/page.tsx:74`), e agora também `_painel/indicadores-churn.tsx:36` ("supabase/filiacao-motivo-desfiliacao.sql"); o bot manda a "Meu perfil → Telegram" (`webhook/route.ts:245,252,259,282,292`); a /ajuda do bot não lista /cancelar e /devolver.

---

# Comunicação (`src/app/painel/comunicacao/**`)

Rotas conferidas: 21 (comunicacao, aniversariantes, aniversariantes/mes, aniversariantes/mensagens, aniversariantes/mensagens/[id], mensagens, mensagens/[id], etiquetas, links, noticias, noticias/[id], qrcodes, qrcodes/[id], resumo, slides, slides/[id], textos, textos/[id], textos/canais, textos/novo, textos/politica). Também as rotas de apoio: etiquetas/pdf, etiquetas/csv, qrcodes/[id]/imagem, aniversariantes/whatsapp/[envioId].

Artigos lidos (inteiros): noticias/index, noticias/noticias, noticias/resumo-ia, noticias/assistente-redacao, noticias/qrcodes, noticias/slides-tv, noticias/pagina-links, noticias/etiquetas, noticias/aniversariantes, noticias/mala-direta. Também `src/lib/ajuda/rota.ts`, o trecho `noticias` de `src/lib/ajuda/manifesto.ts` e as auditorias de 04/11 e 14/11.

Panorama: é a área mais bem coberta da fatia. Os 10 artigos explicam quase todos os botões, rótulos e regras. As lacunas são de navegação (2 rotas levam ao artigo errado ou ao índice), de ações destrutivas sem confirmação e de detalhes de telas secundárias.

## Telas sem nenhum artigo

Nenhuma. Todas as 21 rotas têm conteúdo correspondente no manual. As rotas de `textos/*` têm artigo (`assistente-redacao`), mas o botão "Ajuda desta tela" não leva a ele (ver a seção de rotas).

## Lacunas em telas que têm artigo

| Rota | Feature (rótulo na tela) | Situação | O que falta dizer | Artigo | Prioridade | Evidência |
|---|---|---|---|---|---|---|
| /painel/comunicacao/mensagens/[id] | **Interromper envio** | parcial | A mensagem fica **Cancelada** ("Envio interrompido") e não há como retomar nem reenviar aos que ficaram na fila. Para mandar o restante, é preciso criar uma **Nova mensagem** e montar o recorte de novo. O botão age **sem pedir confirmação**. O artigo diz só "os que ainda estavam na fila não recebem". | noticias/mala-direta | P2 | mensagens/[id]/page.tsx:164-174; src/lib/db/comunicacao-mensagens.ts:1324-1334 (só troca para `cancelada`); page.tsx:143 |
| /painel/comunicacao/mensagens/[id] | Rascunho criado pela campanha de oposição, com o grupo **Fontes pagadoras (qualquer uma)** | ausente | A mala direta pode nascer pronta, vinda de **Preparar a mensagem aos filiados** na campanha de oposição. Nesse caso, aparece o filtro extra "Fontes pagadoras (qualquer uma)", e desmarcar todas tira o filtro. O artigo de oposição cita o botão, mas o de mala direta não explica o filtro. | noticias/mala-direta | P3 | mensagens/[id]/componentes.tsx:194-208; src/app/painel/representacao/oposicao/actions.ts:426; comunicacao-mensagens.ts:1586 |
| /painel/comunicacao/mensagens/[id] | **Condição sindical** (lista de opções) | ausente | "Falecido" e "Excluído(a) do quadro associativo" não aparecem na lista, e existe a opção **Sem condição informada** (cadastros antigos). | noticias/mala-direta | P3 | src/lib/comunicacao-mensagens-constantes.ts:130-136 |
| /painel/comunicacao/mensagens/[id] | **Agendar para** … **às** | parcial | Só aceita hora cheia (lista de 0h a 23h, padrão 9h). O artigo diz "dia e a hora". | noticias/mala-direta | P3 | mensagens/[id]/componentes.tsx:314-333; comunicacao-mensagens-constantes.ts:31 |
| /painel/comunicacao/mensagens/[id] | Situação **Enviando** do destinatário; título "Envio interrompido" | parcial | A lista de situações do e-mail não cita "Enviando" (processando). O título da mensagem cancelada é "Envio interrompido", mas o selo diz "Cancelada". | noticias/mala-direta | P3 | comunicacao-mensagens-constantes.ts:50-58; mensagens/[id]/page.tsx:139-145 |
| /painel/comunicacao/aniversariantes/mensagens/[id] | **Excluir esta mensagem** | ausente | O artigo não diz como apagar uma mensagem específica, e a exclusão não pede confirmação. O selo **Fora de uso** na lista corresponde a **Em uso** desmarcado. | noticias/aniversariantes | P3 | aniversariantes/mensagens/[id]/page.tsx:82-90; aniversariantes/mensagens/page.tsx:156-160 |
| /painel/comunicacao/aniversariantes | Selo **Com e-mail** na prévia dos dias seguintes | parcial | Nos dias futuros sem envio preparado, o selo é "Com e-mail", não "Na fila". O artigo lista só Na fila/Enviado/Falhou/Sem e-mail. | noticias/aniversariantes | P3 | aniversariantes/page.tsx:260-262 |
| /painel/comunicacao/etiquetas | Acesso por **Gestão da filiação** | parcial | Quem tem só Gestão da filiação não entra no módulo Comunicação (o hub exige Notícias, Etiquetas ou Mensagens) e chega às etiquetas pelo cartão **Etiquetas para os Correios** em Filiados › Relatórios. O artigo só ensina o caminho "Comunicação → Etiquetas para os Correios". | noticias/etiquetas | P3 | src/app/painel/comunicacao/page.tsx:20; src/app/painel/filiados/relatorios/page.tsx:84-90; etiquetas/page.tsx:98 |
| /painel/comunicacao/resumo | **Adicionar site** (abre o formulário), lixeira de cada site ("Remover este site?"), link **abrir** | parcial | O artigo diz "clique em Adicionar" sem citar o botão que abre o formulário (o botão já estava pendente em 14/11). Também não diz como remover um site. | noticias/resumo-ia | P3 | resumo/page.tsx:83-105; resumo-forms.tsx:253-284 |
| /painel/comunicacao/resumo | **Histórico de resumos** | ausente | A tela guarda todos os resumos gerados, com data, "automático" ou "manual", tamanho e as fontes de cada um. O artigo não fala do histórico. | noticias/resumo-ia | P3 | resumo/page.tsx:130-174 |
| /painel/comunicacao/links | **Editar** (sob cada link) e o **X** (Excluir link) | parcial | O artigo não diz como editar um link (o "Editar" recolhido sob a linha), nem que excluir é o X e acontece **sem confirmação**, levando junto o contador de cliques. | noticias/pagina-links | P3 | links/links-forms.tsx:228-272 |
| /painel/comunicacao/slides/[id] | **Orientação** no formulário Configuração | parcial | A orientação também pode ser trocada no próprio conjunto. O artigo só oferece **Duplicar**, sem dizer quando trocar e quando duplicar. | noticias/slides-tv | P3 | slides/slides-forms.tsx:187-190 |
| /painel/comunicacao/slides | Coluna Situação: **Publicado** / **Fora do ar**; coluna do último acesso | parcial | A lista mostra "Fora do ar" para um conjunto com Publicado desmarcado. O artigo não cita esse selo nem diz que o último acesso da TV também aparece na lista. | noticias/slides-tv | P3 | slides/page.tsx:119-137 |
| /painel/comunicacao/textos/canais | **Ordem**, **Excluir canal**, **Adicionar canal** (em "Novo canal") | parcial | O artigo não cita o campo Ordem (posição no formulário de pedido) nem os rótulos dos botões. **Excluir canal** não pede confirmação; ele é recusado se o canal já foi usado, e isso o artigo explica. | noticias/assistente-redacao | P3 | textos/canais/canais-forms.tsx:107-115, 136-140, 196-208; textos/canais/page.tsx:43-50 |
| /painel/comunicacao/textos/novo, /textos/politica, /textos/[id] | **Gerar texto**, **Salvar política**, **Copiar hashtags**, **Copiar meta descrição** | parcial | O artigo descreve os passos, mas não nomeia o botão final de cada formulário nem os botões de cópia do bloco "Otimização para busca". | noticias/assistente-redacao | P3 | textos/textos-forms.tsx:271, 555; textos/[id]/page.tsx:100-125 |
| /painel/comunicacao | Hub com 9 cartões | parcial | O resumo do artigo índice no manifesto ("Notícias, as duas áreas de IA, QR Codes e a página de links") e a descrição da área omitem Slides, Etiquetas, Aniversariantes e Mala direta. O print `noticias/painel.png` tem o alt "áreas de notícias e resumo por IA", anterior aos 9 cartões. | noticias/index; manifesto | P3 | src/lib/ajuda/manifesto.ts:812, 820; noticias/index.mdx:57; comunicacao/page.tsx:36-101 |

**Contagem:** 16 lacunas, das quais P1: 0, P2: 1 e P3: 15. Defasados: 1 (print e resumo do índice). O artigo de mala direta acerta o resto, mas é parcial sobre **Interromper envio**, pois não diz que o envio não volta.

## Rotas sem "Ajuda desta tela"

- `/painel/comunicacao/textos`, `/textos/novo`, `/textos/politica`, `/textos/canais` e `/textos/[id]` caem no **índice** da Comunicação (`/painel/ajuda/noticias`). Existe o artigo `assistente-redacao`, mas o slug não bate com o segmento `textos` e falta a entrada em EXTRAS. Sugestão: `"/painel/comunicacao/textos": "/painel/ajuda/noticias/assistente-redacao"`. Evidência: src/lib/ajuda/rota.ts:46-56 (regra slug = segmento) e :82-87 (EXTRAS sem textos).
- `/painel/comunicacao/aniversariantes` e suas sub-rotas (`/mes`, `/mensagens`, `/mensagens/[id]`) levam a **Mala direta**, não ao artigo próprio `aniversariantes`. A rota casaria sozinha com o artigo certo, mas a entrada em EXTRAS a sobrescreve. Sugestão: remover a linha. Evidência: src/lib/ajuda/rota.ts:87, aplicada depois da regra geral em :61.

As demais rotas casam com o artigo certo: noticias, resumo, qrcodes, slides, links, mensagens e etiquetas (esta pela regra geral, por estar em MODULOS).

## Prints sugeridos (só os críticos)

| Tela | Por quê | Arquivo sugerido |
|---|---|---|
| /painel/comunicacao/mensagens/[id], rascunho com "Conferir destinatários" respondido e a confirmação "Enviar agora para N e-mail(s)?" aberta | Envio em massa irreversível; o artigo não tem print (já apontado em 04/11) | noticias/mala-direta.png |
| /painel/comunicacao | Hub com os 9 cartões; o print atual é anterior a eles | noticias/painel.png (refazer) |
| /painel/comunicacao/etiquetas, com o modelo escolhido e a prévia da folha | Erro gasta folha (já apontado em 04/11) | noticias/etiquetas.png |

## Possíveis defeitos vistos de passagem

1. **Ajuda errada em Aniversariantes:** `EXTRAS` manda para mala-direta, embora exista o artigo próprio (rota.ts:87).
2. **Ações destrutivas sem confirmação:** **Interromper envio** (mensagens/[id]/page.tsx:166-173), **Excluir rascunho** (mensagens/[id]/page.tsx:101-107), **Excluir esta mensagem** (aniversariantes/mensagens/[id]/page.tsx:83-89), o X de **Excluir link**, que apaga também os cliques (links/links-forms.tsx:229-236), e **Excluir canal** (textos/canais/canais-forms.tsx:196-208). QR, notícia, site do resumo, conjunto e slide pedem confirmação, então o padrão está desigual.
3. **Mala direta cancelada não tem saída:** não há retomar, reenviar a fila nem duplicar a mensagem (comunicacao-mensagens.ts:1324-1334; mensagens/[id]/page.tsx:164-193).
4. **Texto técnico "rode supabase/….sql":** etiquetas, links, qrcodes, slides, textos e textos/novo já foram apontados em 04/11. Novos ou não citados antes:
   - textos/politica/page.tsx:55-56;
   - textos/canais/page.tsx:57 ("Se você já rodou o SQL");
   - `AVISO_SQL_MENSAGENS`, `AVISO_SQL_MODELOS` e `AVISO_SQL_VESPERA` (src/lib/db/comunicacao-mensagens.ts:51-52, 267-271), exibidos em aniversariantes/page.tsx:154, aniversariantes/mensagens/page.tsx:62-72 e mensagens/page.tsx:53.
5. **Hardcode de cliente num sistema multi-entidade:** o placeholder de "Endereços dos textos" usa `https://sindipetronf.org.br/noticia-1` (textos/textos-forms.tsx:481).
