# Manual × entregas de 04/11 a 14/11/2026

Este documento confere se cada entrega que foi para a `main` depois do pente fino (`6763290a`, 04/11) tem explicação suficiente no manual. Foram 121 commits, conferidos por leitura do código, sem uso das telas. Ele complementa `docs/manual-auditoria-2026-11.md`.

## Resultado

| Frente | Commits | Já explicados | Completados | Sem efeito no manual | Pendentes |
|---|---:|---:|---:|---:|---:|
| Financeiro e Compras | 29 | 17 | 10 | 2 | 0 |
| Pessoal | 26 | 10 | 9 | 7 | 0 |
| Filiação e Representação | 17 | 6 | 9 | 0 | 2 (oposição) |
| Institucional e transversais | 33 | 14 | 15 | 4 | 0 |

Os 16 commits que faltam para os 121 são de base de conhecimento, notas de versão e prints, e não pedem texto.

**Artigos novos:**
- *Congressos e conferências* (Representação): o módulo estava no ar sem nenhum artigo.
- *Inscrição em congresso* (Fluxos públicos).
- *Controle de acesso* (Institucional).

**Formulários que passaram a abrir por botão:** os artigos agora dizem qual botão abre cada formulário. O artigo da tabela salarial e o do resumo por IA têm texto em andamento de outra sessão e ainda não citam o botão.

## Pendências

| Artigo | O que falta | Por que ficou |
|---|---|---|
| representacao/oposicao | Funil da campanha, Atendimento por CPF ou e-mail, motivos prontos, Pedir nova carta, lembretes da carta | Texto em andamento de outra sessão |
| fluxos-publicos/oposicao | Passo a passo do Assinador gov.br e conferência do PDF antes do envio | Idem |
| noticias/resumo-ia | Botão **Adicionar site** | Idem |
| introducao/meu-perfil | Cancelar férias até o dia do início; cancelar falta enquanto aguarda | Idem |
| pessoal/reembolsos | Não conferido | Sessão Pessoal em andamento |
| O que há de novo | Quem entra no quadro já pode pedir viagem; responsável de e-mails, linhas e ramais entre todos com acesso | `src/lib/novidades.ts` com alteração em andamento |

## Prints sugeridos (P1)

| Tela | Por quê | Arquivo sugerido |
|---|---|---|
| Congresso: inscrição pública `/congresso/[slug]` | Pessoa externa sem treino | fluxos-publicos/congresso-inscricao.png |
| Congresso: configuração com regimento aprovado e trava | Decisão com efeito jurídico | representacao/congressos-configuracao.png |
| Portal: carta de oposição no Assinador gov.br | Maior causa de carta recusada | portal/oposicao-assinador.png |
| Compra cancelada pelo vendedor | Registro sem desfazer | compras/cancelada-vendedor.png |

Prints defasados: `viagens/solicitar.png` (sem "O que precisa" e sem o campo Quarto) e `pessoal/sst-funcionario.png` (mostra "Editar jornada" em vez de "Abrir jornada"/"Vincular jornada").

## Possíveis defeitos do sistema

- **Congressos, regras sem efeito:** "Bloqueia a confirmação" (cotas) e "Bloqueia" (elegibilidade) aparecem na tela, mas nada as aplica (`lib/db/congressos.ts:1073`, inscrição pública).
- **Congressos, opções de filiação:** "Ser filiado" e "Ser filiado em dia" dão o mesmo resultado (`lib/db/congressos.ts:607-640`).
- **Congressos, inscrição antes da hora:** a página pública aceita inscrição com o congresso "Em preparação" (`lib/congressos/regras.ts:612`).
- **Congressos, histórico da pessoa:** é registrado, mas não há onde vê-lo.
- **Contracheque transferido:** a ordem de pagamento vai junto, mas mantém o vencimento da remessa de origem (`contracheques/actions.ts`, `transferirContracheque`).
- **Controle de acesso, texto técnico:** sem a migração aplicada, a tela mostra ao usuário um aviso técnico com o caminho da migração.
