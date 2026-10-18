# RIPD 2: Assembleias e votação online

> **Relatório de Impacto à Proteção de Dados Pessoais** (LGPD, arts. 5º XVII e 38), no modelo da ANPD. **Rascunho técnico** da Onda B3, de 18/10/2026. As evidências citam o código. Abreviações: VP = `src/lib/db/votacao-portal.ts`; VM = `src/lib/db/votacao-mesarios.ts`; LU = `src/lib/db/votacao-link-unico.ts`; PA = `src/lib/db/votacao-primeiro-acesso.ts`.

## 1. Identificação

| | |
|---|---|
| Controladora | Cada entidade sindical que realiza assembleias pelo Confluir |
| Operador | Confluir |
| Suboperadores | Supabase, Vercel, Sentry, Brevo/Resend (e-mail), Telegram, Cloudflare Turnstile |
| Encarregado | _a indicar pela entidade_ |
| Processo do ROPA | P05 |

## 2. Por que este RIPD é necessário

- **Participação e voto são dados sindicais sensíveis**: participar revela a filiação ou a atuação sindical, e o voto revela opinião.
- O **sigilo do voto** é um requisito do processo. Uma falha nele invalida a assembleia e expõe o trabalhador ao empregador.
- O volume é grande e há público externo: 175 rodadas, 352 assembleias, **63.248 aptos** (com CPF e contatos), 1.123 participações registradas no sistema novo e 8.018 votos.
- Há vários canais de identificação, inclusive sem login: link pessoal, código por e-mail, Telegram, urna e mesário.

## 3. Descrição do tratamento

| Elemento | Situação |
|---|---|
| **Dados** | Lista de aptos (nome, CPF, matrícula, e-mail corporativo, e-mail de contato, telefone, chat do Telegram, nascimento informado); participação (`hora_voto`, canal, comprovante); voto (`voto_online`: pergunta, resposta, rodada, **sem pessoa e sem hora**); voto em separado (nome, CPF, nascimento, contato); mesários e apuradores; lacres, terminais e atas. |
| **Separação voto × participação** | A participação fica em `voto_assembleias_aptos` (e `voto_participacao_legado` para o histórico do Bubble). O voto fica em `voto_online`, sem eleitor: CHECK `voto_online_sem_eleitor` (migração `20261018171028`), data truncada para o mês pelo trigger `voto_online_hora_secreta` (migração `20261018175736`). |
| **Identificação** | Portal (sessão + aptidão + carência, VP:637-669); link pessoal HMAC (`src/lib/acesso-eleitor.ts:14-37`); código por e-mail com CPF ou e-mail da lista (`src/app/votar/[id]/actions.ts:69-239`); link único com conferência de nome, nascimento e CPF (LU:253-472), com barreira contra e-mail corporativo (`src/app/votar/actions.ts:48-61`); Telegram com contato do próprio usuário (`src/app/api/telegram/webhook/route.ts:128`); mesário por OTP + busca do apto (VM:375-630). |
| **Unicidade** | A participação é reservada **antes** do voto, com `update … where hora_voto is null` e conferência das linhas afetadas; se o voto falhar, a reserva é desfeita (VP:688-728, 1252-1295; VM:1346-1429). Teste da Onda 0: 10 reservas simultâneas, 1 vence. |
| **Apuração** | Digital: contagem por resposta só após o término (`src/lib/db/assembleias.ts:2318-2391`). Física: apurador por OTP, lacres e contagem por urna (`src/lib/db/votacao-apuracao.ts:231-460`). Encerramento grava `voto_resultado_final`. |
| **Retenção** | _Proposta (B4)_: voto anônimo e atas permanentes; participação por 5 anos; contatos até a apuração mais o prazo de impugnação. |

## 4. Necessidade e proporcionalidade

| Princípio | Avaliação |
|---|---|
| **Base legal** | Art. 11, II, a (CLT art. 612 e estatuto) e d (prova da regularidade). _Proposta._ |
| **Necessidade** | A lista de aptos com CPF é necessária para verificar a aptidão. Os contatos são necessários para entregar o link. **A guarda deles após a apuração não é necessária** (R4). |
| **Sigilo (segurança por desenho)** | Forte depois de 18/10/2026: sem eleitor nem hora no voto, garantido no banco. A escolha do voto não aparece em nenhum log (conferido nos `console.*`, no Sentry e na auditoria). |
| **Transparência** | Comprovante sem o voto (`src/lib/db/voto-comprovante.ts`), por e-mail e Telegram; resultado agregado no portal. |
| **Direitos do titular** | Participação consultável pelo comprovante. O voto, por ser anônimo, não é mais dado pessoal e não entra em pedido de acesso ou eliminação. |

## 5. Riscos

Escala como na RIPD 1. **Já corrigidos em 18/10/2026**: o voto legado ligado ao eleitor (6.895 votos, migração `20261018171028`) e a hora exata em `updated_at` (1.050 votos religáveis, migração `20261018175736`).

| # | Risco | P | I | Nível | Medidas existentes | Medidas recomendadas | Residual | Dono |
|---|---|---|---|---|---|---|---|---|
| V1 | **Voto em separado continua ligado à pessoa depois da apuração**: `voto_online.em_separado_id` nunca é anulado (grep em `src` sem resultado), embora o desenho diga "até a apuração"; o apurador vê os nomes dos deferidos (`src/lib/db/votacao-apuracao.ts:313-322`) | M | A | **Alto** | Só existe com `voto_em_separado = true`; hoje há 0 casos | No encerramento da apuração, anular `em_separado_id` e apagar os dados de contato do em separado; CHECK que impeça `em_separado_id` em assembleia encerrada; apurador sem os nomes | Baixo | Dev |
| V2 | **Reidentificação por inferência** em rodadas muito pequenas: com um único votante, o resultado revela o voto | B | M | Baixo | Data do voto por mês | Política: não divulgar o resultado por pergunta se houver menos de 5 votantes, ou avisar a gestão | Baixo | Entidade |
| V3 | **Personificação do eleitor**: link pessoal sem expiração por tempo (`src/lib/acesso-eleitor.ts:24-26`); Turnstile desligado sem variável e liberado se a Cloudflare falhar (`src/lib/turnstile.ts:34-53`); confirmação do código do e-mail de votação sem limite de tentativas (VP:161-201) | M | A | **Alto** | Link derrubado pelo "não sou eu" e após o voto; trava de 5 falhas por conta ou chat; cadência de códigos (`src/lib/codigo-acesso.ts:137-170`); mensagens genéricas | Expiração do link no fim da janela; limite de tentativas na confirmação do código; alerta se o Turnstile estiver desligado em produção | Baixo | Dev |
| V4 | **Contatos dos aptos guardados indefinidamente**: e-mail de contato, telefone, chat do Telegram, nascimento informado; `votacao_email_verificado`; `votacao_telegram_confirmacoes` | A | M | **Alto** | Nenhuma | Rotina pós-apuração (ex.: 90 dias após o encerramento) que limpa os contatos e mantém só a participação | Baixo | Dev + entidade (prazo) |
| V5 | **Participação nominal com permissão ampla**: `assembleias` cobre lista de votantes com CPF, relatório PDF de votantes, decisão de em separado e reabertura de apuração, sem trilha (`src/lib/db/assembleias.ts:2634-2645`; `src/app/painel/representacao/votacoes/apuracao/[id]/relatorio/route.ts:32`) | M | M | Médio | Permissão própria do módulo | Separar "acompanhar participação" de "apurar e reabrir"; auditoria do deferimento, do encerramento e da reabertura | Baixo | Dev |
| V6 | **Comprovante público consultável** revela participação a quem tiver o código, com nome e CPF parciais e sem limite de consultas (`src/lib/db/voto-comprovante.ts:213-274`) | B | M | Baixo | Código aleatório de 8 caracteres em 30 símbolos; `noindex` | Limite de consultas por IP; mostrar só "comprovante válido para a assembleia X", sem nome | Baixo | Dev |
| V7 | **Unicidade só na aplicação**: sem UNIQUE de apto por (rodada, CPF/e-mail) (`src/lib/db/assembleias.ts:1948-1970`); presença na urna física sem guarda de concorrência (VM:1098-1107) | B | M | Baixo | Reserva antes do voto | UNIQUE parcial por (rodada, CPF) quando houver CPF; `.is("hora_voto", null)` na presença física | Baixo | Dev |
| V8 | **Identificação na urna é procedimental**: o código não registra conferência de documento | M | M | Médio | Busca do apto pelo mesário; lacres e ata | Registrar "documento conferido" (sim/não, tipo) na presença | Baixo | Dev + entidade |
| V9 | **Rastros técnicos**: backups do Supabase anteriores a 18/10 ainda têm as horas exatas; traces do Sentry podem levar filtros de CPF em URL do PostgREST (sem `beforeSendTransaction`) | B | M | Baixo | Sentry filtra eventos (`src/lib/sentry-filtro.ts`) | Esperar o ciclo de expiração dos backups; filtrar também as transações no Sentry | Baixo | Operação + dev |

## 6. Plano de ação

1. **V1**: desfazer o vínculo do em separado ao encerrar a apuração (antes da próxima assembleia com voto em separado).
2. **V4**: limpeza dos contatos após a apuração.
3. **V3**: expiração do link, limite de tentativas e alerta do Turnstile.
4. **V5, V8**: separação de permissões, trilha e conferência de documento.
5. **V2, V6, V7, V9**: melhorias de baixo risco.

## 7. Conclusão

Depois das correções de 18/10/2026, o desenho do sigilo é sólido e garantido no banco: sem eleitor, sem hora, com participação separada e reserva antes do voto. Os riscos altos restantes são **V1** (em separado), **V3** (personificação) e **V4** (contatos sem prazo). **Recomendação:** manter o uso; corrigir V1 antes de qualquer votação com voto em separado e V4 antes do próximo ciclo de assembleias.

## 8. Aprovação

| Papel | Nome | Data | Decisão |
|---|---|---|---|
| Encarregado da entidade | | | |
| Representante legal / comissão eleitoral | | | |
| Operador (Confluir) | | | |
