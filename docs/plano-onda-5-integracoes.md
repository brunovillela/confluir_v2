# Plano da Onda 5 — integrações financeiras e de saída

Continuação das ondas 0 a 4. Itens A1, A2, A3, A4 e A9 da avaliação de 03/10 (`docs/avaliacao-sistema-2026-10-03.md`). Caminhos relativos a `confluir/`. Estimativa: **5 dias úteis de código** mais o tempo de homologação com o banco, que não depende de nós. Deploy ao fim de cada dia; SQL sempre antes do push que depende dele.

A regra desta onda é diferente das anteriores: **tudo que depende de banco, convênio ou credencial nasce atrás de um adaptador**, com uma implementação que funciona sem credencial (arquivo, Pix estático, verificação local) e outra que entra quando a entidade contratar o serviço. Assim o Financeiro ganha valor desde o dia 1 e a parte que depende de terceiros não trava o resto.

## Decisões que precisam ser tomadas (pelo usuário)

| # | Decisão | O que muda | Enquanto não houver resposta |
|---|---|---|---|
| D1 | **Banco(s) da entidade** e se a conta tem **API** (Itaú, BB, Bradesco, Santander, Sicoob, Sicredi, Caixa e Inter têm APIs de extrato/Pix/pagamento, cada uma com credencial própria) ou só **arquivos** (OFX do internet banking, CNAB 240 de remessa/retorno). | A1 (extrato por API ou por arquivo), A2 (remessa CNAB ou pagamento por API). | A1 usa OFX/CSV importado à mão; A2 gera CNAB 240 padrão Febraban e marca o banco por parâmetro. |
| D2 | **Cobrança da contribuição** de quem não é consignado: Pix pela conta do banco (API Pix do banco), um **PSP** (Efí, Asaas, Pagar.me, Mercado Pago) ou **só boleto** via convênio bancário. | A3 (quem gera o QR/boleto e quem avisa o pagamento). | A3 gera Pix estático (BR Code) com a chave da entidade e identificador por filiado; a baixa vem da conciliação do extrato (A1). |
| D3 | **Validação da assinatura gov.br**: verificação local da assinatura no PDF (ICP-Brasil, sem credencial) basta, ou a entidade quer o laudo do **Verificador de Conformidade do ITI**? | A4 (fonte da validação). | Verificação local; o laudo do ITI fica como botão opcional. |
| D4 | **Quem vai consumir a API/webhooks**: contador (qual sistema), Power BI, site da entidade, outro? | A9 (formato e eventos prioritários). | API REST JSON somente leitura + webhooks dos eventos financeiros e de filiação; Power BI lê JSON direto. |
| D5 | **Dados da conta** para a remessa: agência, conta, convênio, código do banco, nome/CNPJ do pagador, chave Pix da entidade. | A2, A3. | Tela de cadastro da conta bancária (dia 2) — a entidade preenche quando tiver. |

## Ordem de execução

| Dia | Itens | O que entrega | Depende de |
|---|---|---|---|
| 1 | A1 (parte 1) | **Conciliação bancária por arquivo**: Financeiro → Conciliação importa extrato **OFX** (todo internet banking exporta) e CSV; cada lançamento do extrato é casado automaticamente com uma ordem paga (valor, data ±3 dias, favorecido/Pix) ou com um depósito de fonte pagadora (`filiacao_recebe_comprovacao`); o que não casou aparece para casar à mão ou criar a comprovação com um clique. Indicador "não conciliado" por mês; lançamento conciliado não some do extrato nem muda a ordem. | Nada. |
| 2 | A2 + D5 | **Conta bancária da entidade** (agência, conta, convênio, chave Pix) e **remessa de pagamento CNAB 240** (padrão Febraban, segmentos A/B para TED e Pix, J para boleto) gerada a partir das ordens "A pagar" marcadas, com número de remessa, arquivo guardado e as ordens marcadas "Em remessa"; **leitura do retorno** CNAB 240: ocorrência por ordem, pagas viram "Paga" com data e valor do banco, rejeitadas voltam para "A pagar" com o motivo. Adaptador por banco para os campos que fogem do padrão (BB, Itaú, Bradesco, Santander, Sicoob, Caixa). | D1, D5 para homologar; o código fica pronto antes. |
| 3 | A3 | **Cobrança da contribuição**: para `forma_recebimento` pix/boleto, gera por competência uma **cobrança por filiado** (tabela própria, valor pela regra da entidade) com **Pix estático** (BR Code com a chave da entidade e identificador `txid`) mostrado no portal (Contribuição) e enviado por aviso; **baixa automática** quando a conciliação (dia 1) encontra o identificador no extrato, gerando a linha de recebimento. Adaptador `ProvedorCobranca`: `pix-estatico` (pronto), `api-banco` e `psp` (entram com D2 — QR dinâmico, boleto registrado e webhook de pagamento). | D2 para QR dinâmico/boleto; o Pix estático funciona sem nada. |
| 4 | A4 | **Assinatura gov.br validada**: ao subir o PDF assinado (ficha de filiação, carta de oposição, minuta), o sistema lê as assinaturas PAdES do arquivo, confere a integridade (hash do ByteRange), a cadeia até a raiz ICP-Brasil (pacote de certificados versionado no repositório) e o **CPF do signatário** contra o CPF do cadastro; resultado gravado na submissão (válida / inválida / sem assinatura / CPF diferente) e mostrado na fila de conferência, que deixa de depender de olhar o PDF. Botão opcional "Pedir laudo ao ITI" (D3). | D3 só para o laudo. |
| 5 | A9 | **API e webhooks de saída**: chaves de API por tenant (hash guardado, escopo de leitura, revogáveis em Institucional → API), endpoints REST JSON somente leitura com paginação (`/api/v1/filiados`, `/arrecadacao`, `/ordens`, `/agenda`, `/eventos`, `/indicadores`), **webhooks** por evento (ordem paga, ordem devolvida, filiação aprovada, desfiliação, cupom reservado, cobrança paga) com assinatura HMAC, reenvio com recuo e log das entregas; página de documentação gerada da própria lista de endpoints. | D4 para priorizar eventos; a base não depende. |

## Como cada item fica desenhado

### A1 — Conciliação
- Tabelas `banco_extratos` (arquivo importado: conta, período, origem OFX/CSV/API, quem importou) e `banco_lancamentos` (data, valor com sinal, descrição, documento/identificador Pix, `ordem_id`, `comprovacao_id`, `cobranca_id`, situação conciliado/pendente/ignorado).
- Casamento: 1) identificador Pix igual ao `txid` de uma cobrança (A3) ou ao código da ordem; 2) valor exato e data ±3 dias com uma única ordem paga sem lançamento; 3) valor e data com depósito de fonte. Empates ficam pendentes com as candidatas listadas.
- Quando houver API de extrato (D1), o adaptador `ExtratoBanco` baixa os lançamentos diariamente pelo cron e entra no mesmo fluxo.

### A2 — Remessa e retorno
- `financeiro_contas_bancarias` (dados da conta, convênio, layout, sequência de remessa) e `financeiro_remessas` (número, conta, ordens, arquivo no bucket, situação gerada/enviada/retornada) + `financeiro_remessa_itens` (ordem, segmento, ocorrência do retorno).
- Gerador CNAB 240 em `lib/cnab/` puro (sem dependência de servidor, testável com fixtures), com `banco/<codigo>.ts` para desvios. Retorno lido pelo mesmo módulo.
- A ordem ganha a situação "Em remessa" entre "A pagar" e "Paga"; estorno e devolução já existentes continuam valendo.

### A3 — Cobrança
- `filiacao_cobrancas` (filiado, competência, valor, forma, `txid`, BR Code/linha digitável, situação aberta/paga/cancelada, `lancamento_id` quando baixada).
- Geração mensal por cron (`/api/cobrancas/tick`) para quem tem `forma_recebimento` pix/boleto e está ativo; aviso ao filiado pelo sino/e-mail (onda 4) com o QR; portal → Contribuição mostra a cobrança do mês.
- Baixa: pela conciliação (identificador no extrato) ou pelo webhook do provedor (D2). Baixada, vira linha em `filiacao_recebe` numa remessa "Pix/Boleto" da própria entidade, para a arrecadação e a inadimplência enxergarem.

### A4 — Assinatura gov.br
- `lib/assinatura-pdf.ts`: localiza os dicionários `/Sig`, lê `/ByteRange` e `/Contents` (CMS), confere o hash, valida a cadeia com a raiz ICP-Brasil (`lib/icp-brasil/` com os certificados e data de atualização) e extrai o CPF do `subjectAltName` (OID 2.16.76.1.3.1).
- Resultado em `filiacao_solicitacoes.assinatura_validacao` (jsonb) e nas tabelas equivalentes de oposição e minuta; fila de conferência mostra o selo e só pede olhar humano quando o resultado não é "válida".

### A9 — API e webhooks
- `api_chaves` (tenant, nome, hash, escopos, último uso, revogada) e `webhooks` + `webhooks_entregas`.
- Autenticação por `Authorization: Bearer`; limite de taxa por chave; respostas paginadas por cursor; todos os endpoints passam pelo tenant da chave, nunca pelo host.
- Webhooks disparados pelo mesmo ponto dos avisos (`depoisDaResposta`), com fila na tabela e cron de reenvio.

## Dependências externas (resumo)

- **Banco**: credenciais de API (se houver) e layout CNAB homologado — a entidade pede ao gerente; sem isso, OFX e CNAB padrão.
- **Provedor de cobrança**: chave Pix da entidade (sempre) e, se houver, credenciais do PSP ou da API Pix do banco.
- **ICP-Brasil**: nada a contratar; os certificados raiz são públicos.
- **API de saída**: nada a contratar; a entidade decide quem recebe chave.

## Andamento

(vazio — a onda ainda não começou)
