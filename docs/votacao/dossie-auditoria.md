# Dossiê de auditoria da votação

> **Onda C** (`docs/plano-documentacao.md`), 18/10/2026; pontos C-1 a C-5 tratados em 19/10/2026 (migração `20261019083424_votacao_integridade`). Para a comissão eleitoral, a diretoria, o jurídico e quem precisar demonstrar, perante uma impugnação ou a Justiça, que uma votação feita no Confluir foi **secreta, única, íntegra e corretamente apurada**. Cada garantia aponta para onde está implementada e para como conferir. Complementa a RIPD da votação (`docs/lgpd/ripd-votacao.md`). Abreviações: VP = `src/lib/db/votacao-portal.ts`; VM = `src/lib/db/votacao-mesarios.ts`; LU = `src/lib/db/votacao-link-unico.ts`; PA = `src/lib/db/votacao-primeiro-acesso.ts`.

## 1. Como a votação funciona

```
Campanha → Rodada → Assembleias (uma por fonte pagadora/empregador) → Perguntas → Opções
Lista de aptos por rodada (nome, CPF, matrícula, e-mail corporativo)
```

**Canais de voto** (uma pessoa usa um só canal por rodada):

| Canal | Como o eleitor se identifica | Onde está |
|---|---|---|
| Portal do associado | Login no portal; ser filiado ativo, apto e fora de carência | VP:637-669 |
| Link pessoal por e-mail | Link assinado (HMAC) do apto; antes da cédula, confirma CPF, nome e nascimento | `src/lib/acesso-eleitor.ts`; `src/app/votar/[id]/actions.ts:290-300` |
| Código por e-mail | CPF + código no e-mail do cadastro (ou e-mail da lista) | `src/app/votar/[id]/actions.ts:69-239` |
| Link único (e-mail pessoal ou Telegram) | Código no e-mail pessoal; vínculo exige CPF, nome completo, nascimento e e-mail da empresa | LU:253-472 |
| Urna digital com mesário | Mesário (login por código) localiza o apto; o terminal pareado libera a cédula | VM:375-630, 1024-1095 |
| Urna física | Cédula de papel; apuração por apurador com lacres | `src/lib/db/votacao-apuracao.ts` |
| Voto em separado | Mesário registra a pessoa fora da lista; a comissão defere ou indefere | VM:1563-1611 |

## 2. Garantias e evidências

### G1. Sigilo: ninguém liga o voto à pessoa

| Controle | Evidência | Como conferir |
|---|---|---|
| O voto (`voto_online`) **não tem coluna de pessoa preenchida**: o banco recusa | CHECK `voto_online_sem_eleitor` (migração `20261018171028`) | `votacao:auditar` C3 |
| O voto **não tem hora**, só o mês: nada cruza com a hora em que a pessoa votou | Trigger `voto_online_hora_secreta` (migração `20261018175736`) trunca `created_at` e `updated_at` em todo insert/update | C3 ("com hora 0") |
| **Participação separada do voto**: quem votou fica em `voto_assembleias_aptos` (e `voto_participacao_legado` para o histórico do Bubble); o que votou fica em `voto_online` | Inserts em VP:710-720, VP:1278-1288, VM:1359-1421 (todos com `eleitor_id: null`) | Leitura do código; C3 |
| **Voto em separado é desligado da pessoa** ao encerrar a apuração | Trigger `voto_assembleias_apuracao_desvinculo` e trigger `voto_online_em_separado_aberto` (migração `20261018181729`) | C3 ("em separado ligado após encerrar 0") |
| **Comprovante não contém o voto**: código, hash e hora ficam só na participação | `src/lib/db/voto-comprovante.ts:36-92` | Abrir um comprovante |
| **Nenhum log registra a escolha** | `console.*`, Sentry (`src/lib/sentry-filtro.ts`) e auditoria conferidos na B3 | RIPD da votação, seção 3 |
| Votos legados do Bubble ligados ao eleitor foram **desligados** em 18/10/2026 (6.895 votos) | Migração `20261018171028` | C3 ("com eleitor 0") |

**Limite conhecido:** numa rodada com **um único votante**, o próprio resultado revela o voto. Recomendação: não divulgar o resultado por pergunta abaixo de 5 votantes.

### G2. Unicidade: um voto por eleitor

| Controle | Evidência | Como conferir |
|---|---|---|
| **Reserva da participação antes do voto**: `update … where hora_voto is null`; zero linhas = já votou; se o voto falhar, a reserva é desfeita | VP:688-728, VP:1252-1295; VM:1346-1429 | Teste da Onda 0: 10 reservas simultâneas, 1 vence |
| **Um voto por CPF na rodada, no banco** | Índice único parcial `voto_aptos_rodada_cpf_votou_idx` em (rodada, CPF só com dígitos) com `hora_voto` preenchida (migração `20261019083424`) | C4 |
| Reserva marca no máximo uma linha por CPF e recusa se outra linha do mesmo CPF já votou | `reservarParticipacao` (VP) | C4 |
| Mesmo CPF em outro apto já votado: bloqueia e marca conflito | PA:255-283; LU:401-425 | C4 |
| Presença na urna conta como voto da rodada (não vota online depois) | VP:383-389, VP:1144-1146 | — |
| Comprovante com código único | Índice único `voto_aptos_comprovante_codigo_idx` | C4 |

### G3. Elegibilidade: só vota quem pode

| Controle | Evidência |
|---|---|
| Lista de aptos por rodada; votação "somente filiados" fecha os canais de e-mail | VP:357-363, VP:1160-1163 |
| Filiado ativo, empregador ativo da campanha, fora da carência | VP:648-669, VP:307-337 |
| Barreira ao e-mail corporativo no link único (o empregador lê o e-mail corporativo) | `src/app/votar/actions.ts:48-61`; LU:527-550 |
| Anti-robô (Turnstile) e cadência de códigos (1/min, 5/h) | `src/lib/turnstile.ts`; `src/lib/codigo-acesso.ts:137-170` |
| Janela de votação conferida no servidor ao gravar | VP:660 |

### G4. Integridade e apuração correta

| Controle | Evidência | Como conferir |
|---|---|---|
| A contagem digital só acontece **depois do término** | `dadosApuracao` em `src/lib/db/assembleias.ts` | — |
| **Voto imutável**: o banco recusa UPDATE, DELETE e TRUNCATE em `voto_online`, de qualquer papel; a única mudança aceita é o desvínculo do voto em separado feito pelo trigger de encerramento (`em_separado_id` → nulo e `valido`), reconhecido por vir de dentro de outro trigger (`pg_trigger_depth() > 1`) | Trigger `voto_online_imutavel` (migração `20261019083424`) | Tentar alterar um voto: erro "Voto registrado não pode ser alterado nem apagado" |
| **Resultado congelado** no encerramento (`voto_resultado_final`) antes de marcar a apuração como encerrada; com a apuração encerrada o banco recusa mexer nele | `encerrarApuracao` em `src/lib/db/assembleias.ts`; trigger `voto_resultado_final_congelado` | C5 compara o congelado com os votos atuais |
| **Hash publicado**: no encerramento o banco calcula o SHA-256 do texto canônico do resultado e grava em `voto_assembleias.resultado_hash`; aparece na apuração (com o texto), no relatório PDF e no portal | Trigger `voto_assembleias_apuracao_livro`; `voto_resultado_texto()`; `src/lib/votacao-integridade.ts` | C6 recalcula em JS, fora do banco |
| **Livro da apuração**: cada encerramento e reabertura com quem, quando, motivo (obrigatório na reabertura), resultado congelado do momento e hash; só acrescenta | Tabela `voto_apuracao_eventos` (trigger `voto_apuracao_eventos_imutavel`) | Aba Apuração › Integridade do resultado |
| **Conferência automática** no encerramento (C1–C6 da rodada), gravada no evento de encerramento; não impede o encerramento, registra FALHA | `votacao_conferencia()`; trigger `voto_assembleias_conferencia_encerramento` | Aba Apuração › Integridade do resultado |
| Participação = votos (cada participante gerou exatamente um voto por pergunta) | Invariante do desenho | C1 e C2 |
| Urna física: apurador só nas urnas atribuídas, atesto de lacres, contagem por opção, branco e nulo | `src/lib/db/votacao-apuracao.ts:231-460`; lacres e ata em VM:798-996 | Ata da urna |
| Em separado só conta se deferido; decisão travada após encerrar | `dadosApuracao` e `encerrarApuracao` em `src/lib/db/assembleias.ts`; trigger `voto_em_separado_decisao_definitiva` | — |
| Schema vigiado contra mudança fora das migrações | Cron `/api/schema/deriva/tick` (Onda A3) | `npm run db:deriva` |

## 3. Ameaças e respostas

| Ameaça | Controle principal | Risco residual |
|---|---|---|
| Empregador descobrir como o trabalhador votou | G1 inteira; barreira ao e-mail corporativo | Rodada com votante único |
| Alguém votar no lugar de outro | Identificação por canal (G3); "não sou eu" derruba o link; trava de 5 falhas | Link pessoal sem expiração por tempo (V3 da RIPD) |
| Voto duplo | Reserva antes do voto e índice único por (rodada, CPF) (G2) | Apto sem CPF (só e-mail) ou da lista legada sem rodada fica fora do índice |
| Robô ou ataque em massa | Turnstile, cadência, mensagens genéricas | Turnstile cai aberto se a Cloudflare falhar (V3) |
| Gestor alterar votos | `voto_online` imutável no banco; resultado congelado travado; hash publicado + C5/C6; deriva do schema | Quem tem o papel dono do banco pode desligar um trigger: vira deriva de schema (`db:deriva`) e o hash publicado deixa de conferir |
| Gestor ver quem votou em quê | Não existe dado que permita (G1) | — |
| Reabrir a apuração para mudar o resultado | Reabertura exige motivo e usuário; o livro guarda o resultado anterior e o hash dele; o novo encerramento publica outro hash | A reabertura continua possível (por desenho): o livro a torna visível a quem conferir |

## 4. Documentos que a votação produz

| Documento | Onde | Conteúdo |
|---|---|---|
| Relatório de votantes (PDF) | Apuração › Relatório (`src/app/painel/representacao/votacoes/apuracao/[id]/relatorio/route.ts`) | Nome, CPF, matrícula, hora e canal de quem participou, **sem o voto**. Exportação registrada no livro de exportações (M5) |
| Resultado final | `voto_resultado_final` + tela de apuração, relatório PDF e portal | Totais por opção, branco e nulo, com o **hash SHA-256** do resultado |
| Livro da apuração | Aba Apuração › Integridade do resultado (`voto_apuracao_eventos`) | Encerramentos e reaberturas: quem, quando, motivo, resultado e hash; conferência C1–C6 no encerramento |
| Ata da urna | Mesário › Urna › Ata | Abertura, lacres, primeiro eleitor, fechamento, anomalias |
| Comprovante do eleitor | E-mail, Telegram e `/comprovante/[codigo]` | Código, hash e hora, sem o voto |
| **Conferência independente** | `npm run votacao:auditar -- --rodada=<id> --saida=conferencia.md` | C1 a C5, só números (seção 5) |

## 5. Conferência independente (`votacao:auditar`)

`scripts/auditar-votacao.mjs` lê o banco (sem alterar nada) e devolve OK/FALHA para:

| # | O que confere |
|---|---|
| C1 | Em cada rodada, número de participações = número de eleitores que os votos mostram |
| C2 | Toda pergunta de uma assembleia tem o mesmo total de votos |
| C3 | Nenhum voto com pessoa, nenhum voto com hora, nenhum em separado ligado após o encerramento |
| C4 | Nenhum CPF com duas participações na rodada; comprovantes únicos |
| C5 | Resultado congelado no encerramento = contagem atual |
| C6 | Hash publicado no encerramento = SHA-256 recalculado pelo script sobre o resultado congelado |

O relatório não traz nome, CPF nem voto: pode ir para a comissão e para o processo. O tenant de demonstração fica de fora (`--incluir-demo` para incluir). Em C1, os votos em separado saem da conta (quem votou em separado não está na lista de aptos), antes e depois do desvínculo.

**No encerramento, automaticamente:** a função `votacao_conferencia(assembleia)` roda as mesmas verificações (C1–C6) na rodada da assembleia e o resultado fica gravado no evento de encerramento do livro, visível na aba Apuração. O script continua sendo a conferência **independente**: lê as tabelas e recalcula o hash em JS, sem usar funções do banco.

**Texto canônico do hash (C-3):** uma linha por registro de `voto_resultado_final`, `assembleia;pergunta;opção|branco|nulo;quantidade` (ids em minúsculas, quantidade em inteiro), em ordem de bytes por pergunta, tipo e opção, separadas por `\n`, sem `\n` no fim; hash = SHA-256 em hexadecimal do texto em UTF-8. A tela de apuração mostra o texto; `sha256sum` sobre ele (sem quebra final) devolve o hash publicado.

**Execução de 18/10/2026 (produção, todas as rodadas do sistema novo):** C1–C5 **OK** em 9 rodadas e 4 assembleias encerradas com resultado gravado. Com o demo incluído, C4 acusava um CPF com duas participações na "Rodada de teste" (dados fictícios de 29/08, anteriores à regra de CPF único); a migração `20261019083424` passou essa participação a outra pessoa fictícia (votos e contagem iguais) antes de criar o índice único. As 4 assembleias já encerradas recebem o hash na aplicação da migração, sem evento no livro (o encerramento delas foi anterior a ele); em teste, o hash do banco conferiu com o recalculado em JS nas 4.

## 6. Pontos a fortalecer

Os cinco pontos abaixo foram tratados em 19/10/2026 pela migração `20261019083424_votacao_integridade` (testada em transação) e pelo código do mesmo commit. A coluna "Como ficou" diz onde.

| # | Ponto | Proposta | Como ficou |
|---|---|---|---|
| C-1 | `voto_online` pode ser alterado ou apagado pelo servidor **antes** do encerramento (RLS por tenant permite ALL); C5 só pega alteração depois | Trigger que recusa UPDATE/DELETE em `voto_online`, exceto `valido` na decisão de em separado, e livro de apuração imutável | Triggers `voto_online_imutavel` (UPDATE/DELETE/TRUNCATE; só passa o desvínculo do em separado) e `voto_resultado_final_congelado`. A decisão do em separado não mexe em `voto_online` (a contagem lê o status); quem muda `valido` é o desvínculo no encerramento. Nenhum código do `src` alterava ou apagava voto |
| C-2 | Reabrir apuração sem trilha | Registrar quem reabriu, quando e por quê; guardar o congelado anterior | `reabrirApuracao(id, motivo)` manda motivo e usuário na mesma instrução; o trigger `voto_assembleias_apuracao_livro` recusa sem eles e grava em `voto_apuracao_eventos` o resultado que deixa de valer e o hash dele |
| C-3 | Sem prova criptográfica externa do resultado | Publicar no encerramento o hash do resultado e da contagem (ex.: na ata e no portal), para qualquer pessoa conferir depois | `voto_assembleias.resultado_hash`, calculado pelo banco; na aba Apuração (com o texto canônico), no relatório PDF (seção Resultado) e em Minhas votações no portal |
| C-4 | Unicidade só na aplicação | UNIQUE parcial por (rodada, CPF) com `hora_voto` preenchida | `voto_aptos_rodada_cpf_votou_idx` com o CPF só em dígitos (a lista guarda CPF com e sem máscara) e de 11 dígitos; reserva do portal, presença na urna física e unificação de aptos repetidos ajustadas para não colidir |
| C-5 | Conferência só manual | Rodar `votacao:auditar` automaticamente ao encerrar a apuração e anexar o resultado à ata | `votacao_conferencia()` roda no encerramento e fica no livro; a aba Apuração mostra C1–C6. Anexar à ata da urna fica para quando a ata for gerada pelo sistema |

## 7. Roteiro de resposta a impugnação

1. **Registrar** o pedido (quem, quando, o que alega) e avisar a comissão eleitoral.
2. **Congelar:** não reabrir a apuração, não excluir aptos, não mexer na rodada enquanto a impugnação estiver aberta.
3. **Rodar a conferência:** `npm run votacao:auditar -- --rodada=<id> --saida=conferencia-<data>.md` e anexar ao processo.
4. **Reunir os documentos** da seção 4: relatório de votantes, resultado, atas de urna e decisões de em separado com data. Usar a trilha da auditoria e o livro de exportações para mostrar quem acessou o quê.
5. **Responder por alegação:**
   - "Votaram por mim": localizar a participação do CPF (hora, canal, comprovante) e o caminho de identificação usado (seção 1). O conteúdo do voto não existe ligado à pessoa e **não pode ser anulado individualmente**, só a participação pode ser discutida.
   - "Votei e não contou": conferir o comprovante (`/comprovante/[codigo]`) e C1 (participações = votos).
   - "O resultado foi alterado": C5 (congelado = atual), C6 (hash publicado = recalculado), o livro da apuração (houve reabertura? por quê? qual era o resultado antes?) e `db:deriva`.
   - "Quebraram o sigilo": C3 e a seção 2/G1 deste dossiê; as migrações de 18/10/2026 documentam as correções feitas.
6. **Parecer** técnico do operador (Confluir) a pedido da entidade, com este dossiê, a conferência e o hash dos arquivos entregues.
7. **Registrar o desfecho** e as melhorias que vierem dele (seção 6).
