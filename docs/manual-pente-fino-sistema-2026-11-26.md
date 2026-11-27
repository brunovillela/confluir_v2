# Pente fino do sistema inteiro × manual (26/11/2026)

O objetivo é que as pessoas consigam usar o Confluir sozinhas, só com o manual. Este levantamento comparou todas as telas do sistema com os 163 artigos, lendo o código; as telas não foram abertas. O detalhe de cada área está em `docs/manual-pente-fino-2026-11-26/`, com o rótulo exato de cada botão, o artigo onde o texto deve entrar e a evidência `arquivo:linha`.

Complementa `docs/manual-auditoria-2026-11.md` (04/11) e `docs/manual-entregas-2026-11-14.md` (14/11). Quando um achado já constava ali e continua, o relatório da área diz isso.

**Profundidade da leitura:** em Filiados, Pessoal e Financeiro, parte das telas foi conferida cruzando por script os rótulos das telas com os artigos, e não tela a tela. O núcleo do cadastro de filiados, Representação, Hospedagem e Veículos foram lidos tela a tela.

## Resultado

| Área | Telas | Sem texto no manual | P1 | P2 | P3 | Defasados | "Ajuda desta tela" errada ou ausente |
|---|---:|---:|---:|---:|---:|---:|---:|
| Representação, votações, congressos, eventos | 100 | 30 | 23 | 43 | 57 | 7 | 20 |
| Veículos, Ferramentas, Patrimônio, Espaços, Jurídico, Hospedagem, portal do hotel | 143 | 2 | 12 | 22 | 39 | 12 | ~35 |
| Filiados e filiação pública | 70 | 0 | 5 | 11 | 15 | 3 | 14 |
| Pessoal e Saúde | 123 | 0 | 3 | 5 | 7 | 1 | 16 grupos |
| Institucional, Gestão, Comunicação, Telegram | 96 | 3 + 1 artigo fantasma | 2 | 13 | 35 | 14 | 8 |
| Financeiro, Compras, aprovações | 65 | 2 | 2 | 7 | 26 | 8 | 19 |
| Meu perfil e área do filiado | 61 | 2 | 2 | 6 | 12 | 1 | 18 |
| **Total** | **≈658** | **39** | **49** | **107** | **191** | **46** | **≈130** |

- **P1:** sem o texto, a pessoa não consegue fazer a tarefa sozinha ou erra algo com efeito (dinheiro, prazo, jurídico, ação sem volta).
- **P2:** consegue, mas tropeça.
- **P3:** detalhe.

**Leitura geral:**
- Pessoal, Financeiro e Filiados estão bem cobertos.
- O buraco grande está em **Congressos**: as fases 3 a 7 estão no ar sem nenhuma linha no manual.
- Também faltam texto e cuidado nas **ações sem volta** espalhadas pelo sistema (concluir urna, encerrar apuração, registrar presença, encerrar sem carta, remover documento, registrar entrada no hotel).
- O botão **"Ajuda desta tela"** cai no índice da área ou no artigo errado em cerca de 130 telas, mesmo quando o artigo certo existe. Esta é a correção mais barata e de maior alcance: só mexe em `src/lib/ajuda/rota.ts` e `mapa-portal.ts`.

## Ordem sugerida de trabalho

1. **"Ajuda desta tela"** (`rota.ts`, `mapa-portal.ts`): a lista pronta de entradas está em cada relatório. A mais visível: as 14 telas de `/painel/representacao/votacoes/**` levam a `votacao-presencial` (EXTRAS em `rota.ts:65`), e o artigo `votacoes.mdx` (921 linhas) nunca é aberto pelo botão.
2. **Avisos nas ações sem volta:** um `<Aviso>` em cada uma das ações P1 abaixo.
3. **Congressos:** quatro artigos novos (Dia do evento, Relatoria, Plenária, Moções e encerramento) e a correção do artigo atual.
4. **Defasados:** 46 trechos que hoje ensinam errado.
5. **P2** e **P3**, área por área.

## Feito em 26/11

- **"Ajuda desta tela"** (`src/lib/ajuda/rota.ts`):
  - O mapa aceita o segmento `:id`, que casa com qualquer identificador de registro (segmento com dígito). Assim as fichas de filiado, funcionário, veículo, evento, compra e patrimônio têm artigo próprio.
  - Foram 73 entradas novas.
  - Saíram 5 entradas erradas ou mortas: votações → presencial, aniversariantes → mala direta, `espacos/configuracao`, `filiados/importar` e `filiados/lista`.
  - Teste em `tests/unidade/ajuda-rota.spec.ts`.
- **Avisos nas ações sem volta e correção dos defasados P1:**
  - Concluir urna, encerrar apuração, registrar presença e cédula aberta (`votacoes`, `votacao-presencial`).
  - Encerrar sem carta (`oposicao`) e Reverter processo (`filiacao-coletiva`).
  - Condição em Editar, data de desfiliação, Remover documento e procedimento da anonimização (`filiados/perfil`).
  - Caixa "Avisar quem concluiu" (`receitas`).
  - Termo antes de confirmar, cessão confirmada e permissão do autorizador (`espacos/pedidos`).
  - Registrar e avaliar infração (`veiculos/infracoes`).
  - Cupom reservado e reserva já faturada (`hospedagem/reservas`).
  - Registrar entrada (`hotel/recepcao`).
  - Unificar cadastros e alçada (`gestao/usuarios`).
  - Excluir contrato (`compras/contratos`).
  - Melhorar com IA (`ferramentas/oficios`).
  - Funcionário novo (`pessoal/funcionarios`).
- **Ficou de fora:** a fatura do plano de saúde ("Incluir os N sugeridos"). O código está em andamento noutra sessão e ainda não foi commitado.

## As 49 lacunas P1

### Representação (23)
- **Congressos, painel** (artigos novos):
  - Dia do evento: credenciamento, crachá e segunda via, porta da sessão.
  - Relatoria: grupos, consolidação, fusão.
  - Plenária: mesa, ao vivo, estação de voto.
  - Moções: assinaturas, protocolar, alterar a moção zera as assinaturas.
  - Encerramento: resoluções, eleição da delegação, "Desfazer a apuração" apaga votos.
  - Link da entidade, com assinatura e taxa.
- **Congressos, artigo atual:**
  - Diz que as seções de credenciamento, plenária, moções e encerramento "só registram a regra", mas elas já valem.
  - A tabela mostra 6 abas, e a tela tem 10.
  - Faltam as regras de taxa ("Credenciar só com a taxa da entidade paga").
  - Pôr a situação "Encerrado" à mão **não** gera resoluções nem certificados; é preciso usar **Encerrar o congresso**.
- **Congresso, telas públicas:** a página da entidade, e no link pessoal: o QR do credenciamento, a presença na sala, votar e pedir a palavra, apresentar e assinar moção.
- **Encerrar apuração:** soma toda contagem salva de urna física, concluída ou não, e não confere urnas pendentes (`lib/db/assembleias.ts:2510-2545`, `2606-2650`). O manual diz o contrário. *Conferido no código.*
- **Concluir apuração da urna** (apurador): usa só a última contagem **salva**, não o que está digitado; concluir sem salvar fecha a urna vazia, sem volta (`lib/db/votacao-apuracao.ts:484-503`; formulários separados em `apurador/urna/[id]/apuracao.tsx:144,206`). *Conferido no código.*
- **Mesário:**
  - "Registrar presença" grava com um clique e gasta o voto da pessoa.
  - Se o eleitor sai com a cédula aberta, a urna digital trava, e nenhuma tela cancela a cédula.
- **Oposição:**
  - Atendimento por CPF ou e-mail.
  - Situação da campanha: ela não encerra sozinha no prazo.
  - Modos de formalização.
  - "Pedir nova carta" e os motivos prontos.
  - Checklist da Avaliação da Filiação.
  - "Encerrar as N sem carta": reprova todas, avisa cada pessoa, sem volta.
  - Relação por empregador e "Registrar envio".
- **Filiação coletiva:** "Reverter o processo" está descrito errado. Não exclui as filiações: deixa as pessoas como "Excluído(a) do quadro associativo", vale depois do prazo e não avisa a empresa.
- **Eventos:**
  - Confirmar à mão não confere lotação nem vagas.
  - Republicar depois de Adiado não avisa ninguém, e "Nova data" não muda Início e Término.

### Operacional: Veículos, Ferramentas, Espaços, Hospedagem e hotel (12)
- **Espaços:**
  - Quem confirma a cessão antes de gerar o termo não consegue mais gerá-lo. O manual diz "O termo não trava a confirmação" (`pedidos.mdx:74`; `espacos/pedidos/[id]/page.tsx:65-68,155`). *Conferido no código.*
  - Cessão confirmada não pode ser cancelada pela tela.
  - Quem tem só "Cessão — autorizar" não abre a fila nem o pedido.
- **Veículos:**
  - A avaliação de infração já vem marcada em "o sindicato assume a multa" e não se refaz.
  - A infração registrada não se edita nem se exclui.
  - A cobrança da locação no valor do contrato nasce sem autorização.
- **Ofícios:** "Melhorar com IA" troca o corpo sem prévia.
- **Hotel e hospedagem:**
  - Fatura com a ordem cancelada fica "em aberto" para sempre e prende as reservas.
  - O hotel de demanda garantida não tem o que faturar, porque a Nova fatura vem sempre vazia.
  - "Cancelar" cupom reservado não o desvincula.
  - Desfazer comparecimento, Desvincular e Reabrir continuam disponíveis depois de faturar.
  - "Registrar entrada" na recepção não se desfaz.

### Filiados (5)
- **"Avisar quem concluiu a filiação":** a caixa vem marcada junto de "Tornar ativos os marcados" e manda "Boas-vindas!" em massa; numa correção é preciso desmarcar.
- **Data de "Desfiliação" no vínculo:** não desfilia a pessoa, que continua Ativa, com portal, voto e cobrança (`vinculos/actions.ts` não toca a condição). *Conferido no código.*
- **"Condição da filiação" em Editar cadastro:** não carimba a data, não registra no prontuário e não avisa o filiado, ao contrário de Avançar etapa.
- **Anonimização (LGPD):** falta o procedimento: motivo com 10 caracteres ou mais, digitar ANONIMIZAR, clicar no botão.
- **"Remover" documento do vínculo:** apaga a ficha ou a carta assinada sem confirmação.

### Pessoal (3)
- **Plano de saúde › Fatura:** "Incluir os N sugeridos" sugere só pelo nome, e a pessoa errada passa a ter desconto em folha.
- **Anuênios:** falta como lançar. O texto diz que a progressão é automática, mas só o cálculo do próximo degrau é automático.
- **Funcionário novo:** entra por Gestão › Usuários, e o artigo Funcionários não diz isso.

### Institucional e Gestão (2)
- **Unificar cadastros** (Gestão › Usuários): não está no manual e não tem volta.
- **Alçada:** o texto está defasado. Vale a **maior** entre a alçada individual e as dos perfis, então o ajuste individual nunca reduz, e um perfil com alçada em branco é "sem teto" (`lib/permissoes-resolver.ts:85-108`). *Conferido no código.*

### Financeiro e Compras (2)
- **Comprador com só "Comprador (operar processos)":** não abre o processo de compra, e o manual diz que ele opera tudo. Já estava na auditoria de 04/11.
- **Excluir contrato:** sem volta, e as parcelas e ordens em aberto não são tratadas.

### Meu perfil e portal (2)
- **Oposição no portal:**
  - Escolha da fonte pagadora e da matrícula: a carta sai com elas, e a matrícula é obrigatória para não filiado quando a campanha exige.
  - "Enviar outro" arquivo só vale até a entidade avaliar.

## Possíveis defeitos do sistema (para decidir antes de escrever o texto)

Nesses casos, escrever o manual é contornar o problema. Talvez valha corrigir o sistema primeiro.

1. **Encerrar apuração** sem exigir que as urnas físicas estejam concluídas, e somando contagens não concluídas.
2. **Concluir apuração da urna** sem salvar o que está digitado.
3. **Urna digital** trava com cédula aberta, sem como cancelar.
4. **Alçada:** perfil sem valor vira "sem teto", e o ajuste individual não reduz.
5. **Espaços:**
   - O termo fica inacessível depois da confirmação.
   - Não dá para cancelar uma cessão confirmada.
   - O autorizador não abre a fila.
6. **Hotel:**
   - A fatura com ordem cancelada fica presa.
   - A demanda garantida não consegue faturar.
   - Reservas já faturadas ainda podem ser alteradas.
7. **Infração:** avaliação pré-marcada a favor do sindicato e sem refazer.
8. **Exclusões sem confirmação:** documento do vínculo, reunião da CIPA, agendamento, faixas, bloqueios e regras de espaço.
9. **Mensagens técnicas na tela:** 21 telas de Financeiro e Compras mostram ao usuário "Falta rodar o SQL supabase/….sql".
10. **Ajuda do portal** exige login, então quem não consegue entrar não lê "Como entrar".
11. **Comprador** sem "Aquisição — editar" não opera o processo.

Cada relatório de área traz mais itens nesta seção.

## Prints

Cada relatório lista os prints críticos da área. Os mais urgentes são:
- Mesa de credenciamento e plenária ao vivo do congresso.
- Tela do apurador (Salvar × Concluir).
- Mesário com "Registrar presença".
- Infração com a avaliação.
- Pedido de espaço com o termo.
