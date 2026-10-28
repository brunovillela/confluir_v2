# Avaliação da Oposição à Contribuição Assistencial (27/10/2026)

Pente fino pedido antes de um processo grande. Três frentes: dados e esquema de
produção, fluxo do trabalhador (portal) e painel da entidade. Nenhum arquivo foi
alterado na avaliação. Cada achado foi conferido no código; o que depende de
teste externo está marcado **a confirmar**.

## Situação de partida

- Sindipetro-NF: só as 2 campanhas migradas do Bubble, as duas **encerradas**
  (2024/2025: 5.824 opositores; pós-greve 2026: 3.743). Nenhuma campanha criada
  no Confluir ainda; a do processo novo será a primeira de verdade.
- Legado: 4.908 dos 9.587 opositores **sem CPF**; 52 CPFs inválidos; 261 CPFs
  repetidos na mesma campanha (747 linhas); 1.705 reprovações sem motivo; 35 com
  empregador fora das fontes. Nenhum evento de auditoria (o legado não tinha).
- O que está bem: permissão em toda action do painel; isolamento por entidade
  (RLS); comprovante/carta/PDF só abrem para o próprio CPF; identidade vem de
  `auth_identidades`, não de `user_metadata`; prazo no fuso de SP; fonte do
  formulário validada contra a campanha; não se desiste depois de se opor;
  upload não desfaz avaliação em curso; listas do trabalhador sem teto de 1.000.

## Críticos — resolver antes de abrir a campanha

| # | Achado | Onde | Efeito no processo |
|---|---|---|---|
| C1 | **Protocolo max+1 sem trava**, sem unique (campanha, protocolo) | `db/oposicao.ts:837-852` | No pico, pessoas diferentes com o mesmo protocolo no comprovante/carta |
| C2 | **Mesmo CPF pode se opor duas vezes** (check-then-insert, sem unique) | `db/oposicao.ts:870-930` | Lista do empregador em dobro; comprovante "não encontrado" para uma das linhas |
| C3 | **Checklist da avaliação sempre verde** ("dentro do prazo", "CPF único") | `opositor/[opositorId]/page.tsx:121,129` | Avaliador aprova carta fora do prazo ou duplicata vendo ✓ |
| C4 | **Declaração não é guardada no ato** — comprovante/carta leem o texto atual da campanha, que pode ser editado com ela aberta | `db/oposicao.ts:1193,1244`, `:395-410` | Comprovantes emitidos mudam de texto; prova frágil |
| C5 | **Avaliador não vê o PDF assinado nem a validação da assinatura** | `obterOpositorDetalhe` (`:1371`), página do opositor | Aprovação sem examinar a prova (modos assinatura/híbrido) |
| C6 | **Sem avaliação em lote** (uma página por oposição) | `avaliarOpositor` (`:1388`) | Milhares de oposições não fecham a tempo do desconto |
| C7 | **Sem exportação** (CSV/XLSX), **sem lista por empregador**, **sem dossiê** | todo o módulo | A entidade não consegue mandar ao RH quem deixa de ter desconto nem se defender em juízo |

## Altos

| # | Achado | Onde |
|---|---|---|
| A1 | Re-decisão livre e **trilha sem autor** (`oposicao_eventos` sem `usuario_id`; nenhum trigger de auditoria nas tabelas `oposicao_*`) | `:1418-1430` |
| A2 | **Robô de segurança gasta o código**: o e-mail do código leva um link de uso único verificado no GET (`/auth/confirm`) — mesmo padrão da Halliburton (29/30 cliques eram robô) | `codigo-acesso.ts:93-107`, `auth/confirm/route.ts:40-47` |
| A3 | Não filiado que entra pelo **link** do e-mail volta à tela de entrada (o `portal_nao_filiado` só é criado no caminho do código); erro de vínculo cai na tela do filiado | `auth/confirm/route.ts:90-113`, `portal/oposicao/actions.ts:188-209` |
| A4 | **Desfiliado/inativo pela aba "Sou filiado"** recebe o código, entra e volta sem mensagem | `actions.ts:70-75`, `auth.ts:206-207` |
| A5 | Filiado sem acesso ao e-mail do cadastro **não tem saída** (um e-mail só; aba trabalhador recusa filiado) | `contas.ts:77-79`, `actions.ts:132-137` |
| A6 | **CPF autodeclarado** na aba trabalhador: quem declarar primeiro "fica dono" do CPF; dá para registrar oposição ou desistência no CPF de outro | `actions.ts:58-59,138-141`, índice `auth_identidades_cpf_unico` |
| A7 | Formulário **revela se um CPF é filiado** (dado sensível) | `actions.ts:71-75,133-136` |
| A8 | Validação da assinatura **nunca testada com PDF real do gov.br**; raízes ICP vazias — risco de toda carta correta aparecer como "inválida" (**a confirmar**) | `assinatura-pdf.ts`, `icp-brasil/raizes.ts` |
| A9 | E-mail do não filiado só com regex — sem MX, sem "você quis dizer gmail.com", sem barrar corporativo, sem dica do lixo eletrônico (a votação já tem tudo isso) | `actions.ts:127`, `oposicao-portal-forms.tsx:209-222` |
| A10 | Limite de verificação de código por IP: o `verifyOtp` roda no servidor (IP da Vercel) — 30 por 5 min no `config.toml`; conferir o de produção (**a confirmar**) | `supabase/config.toml:208-209` |
| A11 | **Primeira carta aceita depois do prazo**, sem marca para a gestão | `subirDocumentoAssinado` (`:1062-1075`) |
| A12 | Oposições `aguardando_documento` **não podem ser encerradas** depois do prazo | `:1418`, página do opositor `:40-42` |
| A13 | Edição da campanha (prazo, modo, fontes, declaração) e do questionário **sem trilha**; `gravarFontes` apaga e reinsere sem checar erro — falha no meio deixa a campanha sem fonte, e sem fonte ela vale para todos | `:352-410,595` |
| A14 | Dois avaliadores ao mesmo tempo: vale o último, e o trabalhador recebe os dois e-mails ("aceita" e "não aceita") | `:1401-1418` |

## Médios

- M1 Falhas ao gravar evento/respostas são engolidas (`:811-819`, `:934-941`).
- M2 `oposicao_eventos` não é append-only no banco (update/delete permitidos; FK com `ON DELETE CASCADE` apaga a trilha junto com a oposição).
- M3 Upload confia no MIME do navegador (JPEG renomeado passa); bucket sem limite de tipo/tamanho; arquivo > 4 MB dá erro genérico.
- M4 Banner da home do filiado mostra campanha de outra empresa (`oposicoesParaFiliado` não filtra fontes, `:529-553`).
- M5 Campanha sem fonte: o não filiado nem vê o campo e a oposição sai sem empregador.
- M6 Campanha encerrada some da lista do portal (o trabalhador perde o comprovante).
- M7 Depois de entrar, o link "abrir o comprovante" do e-mail cai na lista, não no comprovante.
- M8 Vídeo com tempo mínimo (cronômetro só no navegador, conta do carregamento) e exigência de gov.br prata/ouro sem alternativa — **conferir com o jurídico** se pode ser lido como obstáculo ao direito de oposição.
- M9 Não registra visualização do comprovante, download da carta nem acesso.
- M10 Lista da campanha: ordenação só por `created_at` (no legado, repetido) — linhas pulam entre páginas; busca por CPF depende da máscara; **busca com vírgula derruba a página** (confirmado).
- M11 Contagem de "opositores" inclui os desistentes.
- M12 Situação da campanha troca livre (encerrada → aberta), sem validar datas.
- M13 Data da avaliação só como dia (sem hora), exibida crua.
- M14 Uma permissão só para configurar, avaliar e ver (sem segregação).

## Baixos

Virada da meia-noite no último dia (quem clica 23:59:59 pode receber "fora do prazo"); CPF por igualdade exata no comprovante (legado com máscara não abre); `lineHeight` no estilo da Page dos dois PDFs (preventivo); texto da carta repete o desconto quando não há detalhe, e não leva CNPJ; vídeo de agradecimento nunca aparece; "por página" sem efeito; página além do total dá erro; motivo digitado e "Aprovar" descarta o motivo sem aviso; protocolo se repete entre campanhas (usar código da campanha + número); CPF completo na lista; "Enviada em" do empregador usa `created_at` (no legado, a data da migração) e o protocolo não aparece ali.

## Plano em ondas

**Onda 0 — integridade (antes de abrir a campanha)** — FEITA em 27/10/2026 (4999cf28, migração 20261027083817_oposicao_integridade); de brinde, a concorrência entre avaliadores (item 16).
1. Protocolo atômico por campanha + `unique (campanha_id, protocolo)`.
2. `unique (campanha_id, cpf)` parcial para as linhas novas (legado fora) + insert com conflito; normalizar CPF (só dígitos) nas linhas novas.
3. Guardar no opositor a declaração aceita (com hash), o modo e o prazo vigentes no ato; travar a edição desses campos com a campanha aberta e com opositores.
4. Trilha: `usuario_id` nos eventos; append-only (trigger recusando update/delete; FK sem cascade); auditoria em `oposicao_opositor`, `oposicao_campanha`, `_fontes`, `_perguntas`; `gravarFontes` atômico; erros de gravação do evento logados.
5. Checklist real na avaliação (prazo, duplicidade, fonte) + carta fora do prazo marcada.

**Onda 1 — acesso (o que gera reclamação em massa)** — FEITA em 27/10/2026, menos o item 11 (conferência no painel do Supabase, sem acesso pela máquina). Sem migração. Como ficou: o e-mail leva só o código; a aba do filiado responde igual para qualquer CPF e manda o código a todos os e-mails do cadastro (até 3), achando depois em qual deles está o código digitado; a aba do trabalhador não recusa filiado antes do código e a recusa depois dele não afirma a filiação; o desfiliado entra pela aba do filiado e segue como trabalhador (sessão cai para `portal_nao_filiado`, criado na hora); o link antigo recusado volta a `/portal/oposicao` com o motivo; o e-mail do trabalhador passa pela conferência da votação (MX, "você quis dizer", domínio de empresa ou com histórico "não chega" pede confirmação) e a tela do código traz a dica da caixa. Filiado sem acesso a nenhum e-mail do cadastro: a tela orienta a usar "Sou trabalhador" (se desfiliado) ou procurar o sindicato.
6. E-mail do código **sem link** na oposição (ou confirmação por POST) — robô não gasta mais o código.
7. `portal_nao_filiado` criado também no caminho do link; erro volta para `/portal/oposicao`.
8. Desfiliado/inativo orientado para "Sou trabalhador"; respostas neutras que não revelam filiação.
9. Validação do e-mail como na votação (MX, sugestão de domínio, barrar corporativo, dica do lixo eletrônico).
10. Alternativa para filiado sem acesso ao e-mail (escolher entre os e-mails do cadastro; atendimento).
11. Conferir o limite de verificação de código em produção e elevar se preciso.

**Onda 2 — trabalho da entidade em escala** — FEITA em 27/10/2026 (migração 20261027221836_oposicao_lote_envios; módulo `lib/db/oposicao-gestao.ts`). Avaliação em lote (marcadas ou todas as não avaliadas do filtro; aprovar passa pelo checklist e devolve as puladas com o motivo; decisão gravada com guarda de situação e autor; aviso na fila `aviso_avaliacao_pendente_em`, esvaziada por /api/oposicao/tick a cada 15 min, até 300 por volta); "ir para a próxima"; PDF assinado e selo da assinatura no painel, com conferência obrigatória para aprovar assinatura inválida/ausente/não verificada/CPF divergente ("ressalva" não barra até a onda 3); encerrar em lote, depois do prazo, as que não mandaram a carta (viram reprovadas com o motivo); exportação XLSX com os filtros; relação por empregador em PDF/XLSX com registro de envio imutável (`oposicao_envios_empregador`, snapshot dos ids; mostra novas e saídas desde o último envio); dossiê em PDF; lista com ordem estável, busca por CPF nas duas grafias/protocolo/e-mail, vírgula sem quebrar, filtro por fonte e total sem desistentes.
12. Avaliação em lote (selecionadas / todas as filtradas) com guarda de situação, evento por oposição e e-mails com vazão controlada; "salvar e ir para a próxima".
13. Ver o PDF assinado e a validação no painel; bloquear/confirmar aprovação com CPF divergente.
14. Encerrar em lote as `aguardando_documento` depois do prazo ("carta não enviada").
15. Exportação CSV/XLSX completa; lista/ofício por empregador com registro de envio; dossiê por oposição em PDF.
16. Concorrência entre avaliadores (situação vista na guarda).
17. Correções da lista: ordenação estável, busca por CPF nas duas grafias, busca com vírgula, total sem desistentes.

**Onda 3 — prova da assinatura e acabamento** — FEITA em 27/10/2026 (migração 20261027232028_oposicao_bucket_pdf). Item 18 testado com 150 cartas reais do legado: o Assinador gov.br grava o CMS em BER de comprimento indefinido, que o leitor (só DER) não lia — 23 de 24 cartas assinadas saíam "inválidas"; corrigido, e a cadeia do gov.br (AC Final → Intermediária → Raiz do Governo Federal v1, de repo.iti.br) e as raízes ICP-Brasil v5/v10/v11/v12 (acraiz.icpbrasil.gov.br) entraram em `lib/icp-brasil/raizes.ts`. Resultado: 120 válidas (119 gov.br + 1 e-CPF), 9 inválidas por motivo real (certificado sem CPF ou de outra pessoa), 17 sem assinatura, 3 não-PDF. A carta do legado (coluna `carta`) passou a aparecer no painel, com "Reverificar assinatura". Item 19: conteúdo conferido pelos bytes (%PDF-), limite de 3,8 MB avisado na tela, bucket só PDF até 10 MB. Item 20: banner só da empresa da campanha, campanha encerrada com oposição continua na lista, volta ao comprovante depois do código (`?voltar`), eventos `comprovante_visto`/`comprovante_pdf_baixado`/`carta_baixada` na trilha. Item 21: fonte para o não filiado em campanha sem fonte (M5), datas da campanha validadas (M12), hora da decisão (M13), "por página" e página além do total, CPF parcial na lista, CPF nas duas grafias no comprovante, motivo digitado com "Aprovar" vira observação, carta com CNPJ e sem repetir o desconto, vídeo de agradecimento depois do registro, "Enviada em" do empregador pela data da oposição. Ficaram de fora, de propósito: virada da meia-noite (o prazo é o prazo), protocolo por campanha (mudaria comprovantes emitidos), lineHeight dos PDFs de uma página, M8 e M14 (decisões).
18. Testar a validação com PDF real do gov.br e ajustar extração do CPF e raízes.
19. Upload por bytes (%PDF), limite de tamanho com mensagem, bucket restrito a PDF.
20. Banner só para a empresa da campanha; comprovante acessível depois do encerramento; voltar ao comprovante após o login; eventos de acesso/visualização/download.
21. Médios e baixos restantes.

**Decisões do usuário/jurídico** — viraram configuração em 28/10/2026 (migração 20261028021018_oposicao_decisoes_juridicas): padrão da entidade em Oposição › Decisões jurídicas (`oposicao_regras`) e decisão própria por campanha (`oposicao_campanha.regra_*`); a campanha só abre — e o portal só recebe — com as cinco decididas, e ao abrir as vigentes ficam gravadas nela. Decisões: carta depois do prazo (aceitar/recusar), vídeo com tempo mínimo (exigir/dispensar), assinaturas aceitas (só gov.br / gov.br ou e-CPF), prova do não filiado (nenhuma/matrícula/carta assinada) e permissões (única/separadas, com `oposicao_configurar` e `oposicao_avaliar`). Texto original: aceitar ou não carta depois do prazo; tempo mínimo do vídeo e exigência de gov.br; prova adicional para não filiado (nascimento? matrícula? só a carta gov.br?); segregação de permissões.
