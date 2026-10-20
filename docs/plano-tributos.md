# Plano — área de Tributos (Financeiro › Tributos)

19/10/2026. Pedido: recriar a área de tributos que existia no Bubble, no molde
dos Contratos — o **tributo** está para o **contrato** como as **guias** estão
para as **parcelas**, e as ordens de pagamento ficam vinculadas do mesmo jeito.

## 1. O legado no Bubble

Dois tipos de dado, mais um campo na ordem:

| Bubble | Campos | Volume |
|---|---|---|
| `tributos-configurações` (o cadastro) | Nome, Abreviação, Tipo (esfera), BENEFICIÁRIO (empresa/órgão), CENTRO DE CUSTO, EMP PROPRIETÁRIA | 7 |
| `tributos-lançamentos` (cada guia) | TRIBUTO, Vigência início, Vigência final, ORDEM DE PAGAMENTO | 110 |
| `financeiro-ordempgto.TRIBUTO` | aponta para o lançamento | 99 ordens |

Os 7 tributos cadastrados:

| Abreviação | Nome | Esfera | Beneficiário | Centro de custo | Lançamentos |
|---|---|---|---|---|---|
| DARF GERAL | Impostos trabalhistas | Trabalhista e previdenciário | "GUIA IRPF DARF" (fornecedor genérico) | 51301 - INSS | 32 (12/2023–03/2026) |
| FGTS | Fundo de Garantia do Tempo de Serviço | Trabalhista e previdenciário | CEF Caixa Matriz | 51302 - FGTS | 40 (12/2023–09/2026) |
| GPS | Guia de Previdência Social | Trabalhista e previdenciário | — (vazio) | 51301 - INSS | 18 (01/2025–09/2026) |
| Alvará Macaé | Taxa de fiscalização (TFLIF) Macaé | Municipal | Prefeitura de Macaé | 51505 - Alvará | 4 |
| DAM CAMPOS | Taxa de limpeza — IPTU Campos | Municipal | Prefeitura de Campos | 51503 - Iptu/Dati | 4 |
| IPTU Macaé | IPTU | Municipal | Prefeitura de Macaé | 51503 - Iptu/Dati | 3 |
| DUDA | Documento Único do Detran de Arrecadação | Estadual | DETRAN/RJ | 51210 - Despesas c/ veículos | 9 |

### O que chegou ao Supabase

- **As ordens migraram** (109 com tipo "Tributo…": 99 ligadas a lançamento,
  10 soltas — DAM Campos, IPTU Macaé, FGTS, GPS e DARF de 2024). Todas Pagas
  ou Canceladas, da entidade principal.
- **O cadastro e os lançamentos NÃO migraram**: a ordem guarda só o texto do
  tipo — às vezes "Tributo", às vezes "Tributo FGTS da vigência de 01/05/24 a
  31/05/24" (o Bubble montava o tipo com a vigência). O vínculo
  ordem → lançamento → tributo se perdeu.
- **Desde a virada (01/10) nenhuma ordem de tributo foi criada no sistema
  novo** — a última é de 10/09. DARF, FGTS e GPS de outubro estão sendo pagos
  por fora (ou ainda não foram).
- A permissão **`financeiro_tributos`** já existe no catálogo e **6 pessoas**
  a têm em produção; nenhuma tela a usa hoje.

## 2. Onde fica

**Financeiro › Tributos** (`/painel/financeiro/tributos`), com a permissão
`financeiro_tributos`. É o lugar coerente: tributo não é aquisição (não tem
cotação, proposta nem recebimento, que é o que os Contratos herdam de
Aquisição); é obrigação fiscal paga pelo Financeiro, como Multas de trânsito,
que já é subárea do Financeiro.

## 3. Modelo (espelho dos Contratos)

| Contratos | Tributos |
|---|---|
| `contratos` | `financeiro_tributos` — o cadastro |
| parcela (ordem com `contrato_id`) | `financeiro_tributos_lancamentos` — a guia de uma competência |
| `ordens_pagamento.contrato_id` | `ordens_pagamento.tributo_lancamento_id` |
| tipo da ordem "Contrato" | tipo da ordem **"Tributo"** |
| nota fiscal da parcela | **a guia** (DARF, GPS, guia do FGTS, DAM, DUDA) — documento e boleto ao mesmo tempo |

**`financeiro_tributos`**: nome, abreviação, esfera (federal, estadual,
municipal, trabalhista e previdenciário), órgão beneficiário (`empresa`),
centro de custo e departamento padrão, periodicidade (mensal, anual,
eventual), dia de vencimento habitual, forma padrão (boleto/código de barras
ou Pix), ativo, observações, `bubble_id`.

**`financeiro_tributos_lancamentos`**: tributo, competência (vigência início e
fim, como no legado), valor, vencimento, arquivo da guia, linha digitável,
situação (prevista, aguardando guia, lançada, cancelada), ordem de pagamento,
`bubble_id`.

## 4. Fluxo

1. **Cadastrar o tributo** uma vez (órgão, centro de custo, periodicidade,
   vencimento habitual).
2. **Competências previstas**: o tributo mensal gera os lançamentos dos
   próximos meses como "aguardando guia" (como a parcela recorrente do
   contrato aguarda a nota) — o painel avisa quando o vencimento se aproxima
   sem guia.
3. **Lançar a guia**: anexar o PDF (valor, vencimento e linha digitável; a IA
   pode ler a guia e preencher — ver fase 4). A ordem nasce com tipo
   "Tributo", favorecido = órgão, centro de custo do tributo, forma boleto com
   a própria guia, documento fiscal = a guia.
4. **Autorização** e pagamento seguem o rito normal da ordem (ver decisão D1).
5. Na tela do tributo, como no contrato: competências, valores, situação de
   cada ordem, total pago no ano.

## 5. Migração do legado

- Criar os 7 tributos e os 110 lançamentos a partir do Bubble (com
  `bubble_id`), e ligar as 99 ordens pelo `bubble_id`.
- As 10 ordens soltas: casar pelo texto do tipo (abreviação + vigência) e
  criar o lançamento que falta.
- Normalizar `ordens_pagamento.tipo` para "Tributo" (a vigência passa a morar
  no lançamento; o texto antigo fica na descrição).
- Acertar os cadastros sujos: "GUIA IRPF DARF" é um fornecedor genérico, com
  um número no lugar do CNPJ (07162412735573) — trocar por um cadastro da
  Receita Federal; GPS sem beneficiário → INSS.
- Script com simulação primeiro (lista do que muda) e aplicação só com o seu
  ok, como nas outras migrações do Bubble.

## 6. Fases

| Fase | Entrega |
|---|---|
| 1 | Migração do schema (2 tabelas + coluna na ordem) e importação do legado (7 tributos, 110 lançamentos, 109 ordens ligadas) |
| 2 | Telas: lista de tributos (com próximos vencimentos), cadastro/edição, página do tributo com competências e ordens, lançar guia → ordem |
| 3 | Integrações: procedência da ordem (cartão "Tributo vinculado"), origem "Tributos" na auditoria das ordens (guia obrigatória, vencimento), filtro de tipo na lista de ordens, extrato, caixa de entrada/aviso de guia a vencer, subárea no Financeiro |
| 4 | IA lê a guia (DARF/GPS/FGTS/DAM): valor, vencimento, competência e linha digitável — pela `src/lib/ia.ts`, como a leitura de notas |
| 5 | Manual (Financeiro › Tributos) e prints |

## 7. Decisões para você

- **D1 — Autorização da ordem do tributo.** (a) alçada normal, como qualquer
  despesa; (b) dispensada quando o tributo é recorrente e a guia vem no valor
  esperado (como a parcela fixa de contrato), alçada só no que foge disso;
  (c) sempre dispensada (obrigação legal). Recomendo (b).
- **D2 — Competências previstas.** Gerar automaticamente os lançamentos
  mensais "aguardando guia" (recomendado, dá o aviso de vencimento) ou só
  lançar quando a guia chega.
- **D3 — Quem edita.** Uma permissão só (`financeiro_tributos`, as 6 pessoas
  de hoje) ou separar ver/editar como nos Contratos.
- **D4 — Cadastros do legado.** Confirmar a troca de "GUIA IRPF DARF" pela
  Receita Federal e GPS → INSS.
