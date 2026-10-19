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
| **Unicidade** | A participação é reservada **antes** do voto, com `update … where hora_voto is null` e conferência das linhas afetadas; se o voto falhar, a reserva é desfeita (VP:688-728, 1252-1295; VM:1346-1429). Teste da Onda 0: 10 reservas simultâneas, 1 vence. Desde a migração `20261019083424`, o banco também recusa duas participações do mesmo CPF na rodada (índice único `voto_aptos_rodada_cpf_votou_idx`, CPF só com dígitos) e a reserva marca no máximo uma linha por CPF (`reservarParticipacao`, VP). |
| **Apuração** | Digital: contagem por resposta só após o término (`src/lib/db/assembleias.ts:2318-2391`). Física: apurador por OTP, lacres e contagem por urna (`src/lib/db/votacao-apuracao.ts:231-460`); os envelopes em separado deferidos aparecem pelo código do envelope, sem o nome. Encerramento grava `voto_resultado_final` e, no banco, desliga o voto em separado do eleitor (trigger `voto_assembleias_apuracao_desvinculo`, migração `20261018181729`). **Integridade (migração `20261019083424`, dossiê de auditoria C-1 a C-5):** `voto_online` não aceita UPDATE/DELETE (só o desvínculo acima); o resultado congelado não muda com a apuração encerrada; o encerramento grava o SHA-256 do resultado (publicado na apuração, no relatório PDF e no portal) e roda a conferência C1–C6; encerramentos e reaberturas ficam no livro `voto_apuracao_eventos` (quem, quando, motivo obrigatório na reabertura, resultado anterior), que só acrescenta. |
| **Retenção** | Contatos dos aptos (e-mail de contato, telefone, Telegram, nascimento informado, e-mail do aviso) e as verificações de e-mail e Telegram: apagados pelo cron `/api/votacao/tick` (`votacao_expurgar_contatos`) quando todas as assembleias da rodada estão apuradas há `contatos_reter_dias` (padrão 90, ajustável na rodada); cada execução fica em `votacao_expurgo_contatos`. Contatos do voto em separado: apagados no encerramento da apuração. _Proposta (B4)_: voto anônimo e atas permanentes; participação (nome, CPF, `hora_voto`, comprovante) por 5 anos. |

## 4. Necessidade e proporcionalidade

| Princípio | Avaliação |
|---|---|
| **Base legal** | Art. 11, II, a (CLT art. 612 e estatuto) e d (prova da regularidade). _Proposta._ |
| **Necessidade** | A lista de aptos com CPF é necessária para verificar a aptidão. Os contatos são necessários para entregar o link. A guarda deles após a apuração não é necessária: desde 18/10/2026 eles saem depois do prazo de impugnação (V4). |
| **Sigilo (segurança por desenho)** | Forte depois de 18/10/2026: sem eleitor nem hora no voto, garantido no banco. A escolha do voto não aparece em nenhum log (conferido nos `console.*`, no Sentry e na auditoria). |
| **Transparência** | Comprovante sem o voto (`src/lib/db/voto-comprovante.ts`), por e-mail e Telegram; resultado agregado no portal. |
| **Direitos do titular** | Participação consultável pelo comprovante. O voto, por ser anônimo, não é mais dado pessoal e não entra em pedido de acesso ou eliminação. |

## 5. Riscos

Escala como na RIPD 1. **Já corrigidos em 18/10/2026**: o voto legado ligado ao eleitor (6.895 votos, migração `20261018171028`) e a hora exata em `updated_at` (1.050 votos religáveis, migração `20261018175736`). **Tratados em 18/10/2026, migração `20261018181729_votacao_pos_apuracao`** (aplicada em produção): V1 e V4. **Tratados em 19/10/2026, migração `20261019083424_votacao_integridade`** (testada em transação): V7 e a trilha de encerramento e reabertura de V5.

| # | Risco | P | I | Nível | Medidas existentes | Medidas recomendadas | Residual | Dono |
|---|---|---|---|---|---|---|---|---|
| V1 | **Voto em separado ligado à pessoa depois da apuração**: `voto_online.em_separado_id` nunca era anulado; o apurador via os nomes dos deferidos | M | A | ~~Alto~~ **Baixo** | **Tratado (18/10/2026):** ao encerrar a apuração, o trigger `voto_assembleias_apuracao_desvinculo` anula `em_separado_id` (indeferido/pendente vira `valido = false`, a contagem não muda) e apaga telefone, e-mail e nascimento do cadastro, que guarda nome, CPF, status e decisão (`desvinculado_em`); o trigger `voto_online_em_separado_aberto` recusa `em_separado_id` em assembleia encerrada (CHECK não serve: depende de outra tabela); `voto_em_separado_decisao_definitiva` recusa mudar a decisão depois (reabrir não religa); o apurador vê o código do envelope, não o nome (`src/lib/db/votacao-apuracao.ts`, `codigoEnvelope`), e o mesário anota esse código no envelope | Até o encerramento o vínculo existe por desenho (a comissão precisa decidir); a comissão vê os nomes | Baixo | Dev |
| V2 | **Reidentificação por inferência** em rodadas muito pequenas: com um único votante, o resultado revela o voto | B | M | Baixo | Data do voto por mês | Política: não divulgar o resultado por pergunta se houver menos de 5 votantes, ou avisar a gestão | Baixo | Entidade |
| V3 | **Personificação do eleitor**: link pessoal sem expiração por tempo (`src/lib/acesso-eleitor.ts:24-26`); Turnstile desligado sem variável e liberado se a Cloudflare falhar (`src/lib/turnstile.ts:34-53`); confirmação do código do e-mail de votação sem limite de tentativas (VP:161-201) | M | A | **Alto** | Link derrubado pelo "não sou eu" e após o voto; trava de 5 falhas por conta ou chat; cadência de códigos (`src/lib/codigo-acesso.ts:137-170`); mensagens genéricas | Expiração do link no fim da janela; limite de tentativas na confirmação do código; alerta se o Turnstile estiver desligado em produção | Baixo | Dev |
| V4 | **Contatos dos aptos guardados indefinidamente**: e-mail de contato, telefone, chat do Telegram, nascimento informado; `votacao_email_verificado`; `votacao_telegram_confirmacoes` | A | M | ~~Alto~~ **Baixo** | **Tratado (18/10/2026):** `votacao_expurgar_contatos()` no cron `/api/votacao/tick` (`src/lib/db/votacao-expurgo.ts`): com todas as assembleias da rodada apuradas há `voto_rod_assembleias.contatos_reter_dias` (padrão 90, de 7 a 3.650; a tela oferece 30 a 365), anula os contatos dos aptos (mantém nome, CPF, matrícula, `hora_voto`, canal e comprovante), apaga as verificações de e-mail e as confirmações do Telegram dessas pessoas (se não estiverem em outra rodada ainda guardada) e registra a execução em `votacao_expurgo_contatos`. Assembleias já encerradas contam o prazo da aplicação da migração | **Rodada com assembleia nunca encerrada não expurga**: em 18/10/2026, das 9 rodadas com contatos, 5 têm assembleia sem apuração encerrada; o e-mail corporativo da lista fica (é dado da lista de aptos) | Baixo | Dev + entidade (prazo e encerrar as apurações antigas) |
| V5 | **Participação nominal com permissão ampla**: `assembleias` cobre lista de votantes com CPF, relatório PDF de votantes, decisão de em separado e reabertura de apuração (`src/app/painel/representacao/votacoes/apuracao/[id]/relatorio/route.ts:32`) | M | M | Médio | Permissão própria do módulo; relatório de votantes no livro de exportações (M5); **desde 19/10/2026**, encerramento e reabertura no livro da apuração (`voto_apuracao_eventos`: quem, quando, motivo obrigatório, resultado anterior e hash; o banco recusa alterar ou apagar) | Separar "acompanhar participação" de "apurar e reabrir"; auditoria do deferimento do em separado | Baixo | Dev |
| V6 | **Comprovante público consultável** revela participação a quem tiver o código, com nome e CPF parciais e sem limite de consultas (`src/lib/db/voto-comprovante.ts:213-274`) | B | M | Baixo | Código aleatório de 8 caracteres em 30 símbolos; `noindex` | Limite de consultas por IP; mostrar só "comprovante válido para a assembleia X", sem nome | Baixo | Dev |
| V7 | **Unicidade só na aplicação**: sem UNIQUE de apto por (rodada, CPF/e-mail); presença na urna física sem guarda de concorrência | B | M | ~~Baixo~~ **Muito baixo** | **Tratado (19/10/2026):** índice único parcial `voto_aptos_rodada_cpf_votou_idx` por (rodada, CPF só com dígitos) com `hora_voto` preenchida (o único caso existente, fictício, no tenant demo, foi desfeito na migração); a reserva do portal marca uma linha por CPF e recusa se outra linha do mesmo CPF já votou; presença na urna física com `.is("hora_voto", null)` | Apto sem CPF (só e-mail) ou da lista legada sem rodada fica fora do índice; continua valendo a reserva da aplicação | Muito baixo | Dev |
| V8 | **Identificação na urna é procedimental**: o código não registra conferência de documento | M | M | Médio | Busca do apto pelo mesário; lacres e ata | Registrar "documento conferido" (sim/não, tipo) na presença | Baixo | Dev + entidade |
| V9 | **Rastros técnicos**: backups do Supabase anteriores a 18/10 ainda têm as horas exatas; traces do Sentry podem levar filtros de CPF em URL do PostgREST (sem `beforeSendTransaction`) | B | M | Baixo | Sentry filtra eventos (`src/lib/sentry-filtro.ts`) | Esperar o ciclo de expiração dos backups; filtrar também as transações no Sentry | Baixo | Operação + dev |

## 6. Plano de ação

1. ~~**V1**: desfazer o vínculo do em separado ao encerrar a apuração.~~ Feito (migração `20261018181729`, aplicada).
2. ~~**V4**: limpeza dos contatos após a apuração.~~ Feito (mesma migração). A entidade deve encerrar a apuração das rodadas antigas para que o expurgo as alcance.
3. **V3**: expiração do link e alerta do Turnstile. O limite de tentativas na confirmação do código do e-mail de votação foi feito em 19/10/2026 (5 por código; R-2 de `docs/produto/regras-negocio.md`).
4. **V5, V8**: separação de permissões, auditoria do deferimento e conferência de documento (a trilha do encerramento e da reabertura já existe desde 19/10/2026).
5. **V2, V6, V9**: melhorias de baixo risco. ~~V7~~ feito (migração `20261019083424`).

## 7. Conclusão

Depois das correções de 18/10/2026, o desenho do sigilo é sólido e garantido no banco: sem eleitor, sem hora, com participação separada e reserva antes do voto. Com V1 e V4 tratados (migração `20261018181729`), o risco alto restante é **V3** (personificação). Desde 19/10/2026 a integridade também é garantida no banco (voto imutável, resultado congelado com hash publicado, livro da apuração, um voto por CPF na rodada, conferência automática no encerramento; ver `docs/votacao/dossie-auditoria.md`). **Recomendação:** manter o uso; tratar V3 em seguida.

## 8. Aprovação

| Papel | Nome | Data | Decisão |
|---|---|---|---|
| Encarregado da entidade | | | |
| Representante legal / comissão eleitoral | | | |
| Operador (Confluir) | | | |
