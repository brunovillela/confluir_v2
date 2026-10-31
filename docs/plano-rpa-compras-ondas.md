# Plano — RPA e compra de serviço: usabilidade e automatização

31/10/2026. Pedido: depois do limite de RPAs por prestador por mês (pelo mês
de emissão e pelo do pagamento), melhorar o fluxo compra de serviço → RPA →
pagamento → tributos do ponto de vista de quem opera e do que pode andar
sozinho. A ordem das ondas vai do que não muda regra nem banco para o que
muda o cálculo dos recibos.

## Onde estamos

- Compra de serviço de autônomo paga por RPA: RPA padrão ou avulso na nova
  compra; quadro "Quanto este serviço custa à entidade" na página da compra.
- Retenções (INSS, IRRF, ISS) e INSS patronal entram nas guias de Tributos na
  competência do pagamento; relatório mensal de RPAs na exportação contábil.
- Limite de RPAs por prestador por mês (padrão 1), conferido na emissão e no
  registro do pagamento; o retorno da remessa bancária não é barrado.
- Comprovante de pagamento com envio manual ao fornecedor (contatos que
  recebem a ordem de compra).
- Assinatura do RPA por link (envio manual) ou anexo à mão/gov.br.

## Onda 1 — Avisar antes de enviar (sem banco)

O usuário descobre os problemas só depois de preencher tudo.

1. **Limite na tela.** No Novo RPA e na nova compra com RPA, ao escolher o
   prestador e o "Pagar em", mostrar os RPAs dele no mês de emissão e no mês
   do pagamento (*"já tem o RPA nº 2 previsto para 10/2026"*), antes de
   enviar. Se o RPA existente ainda não foi assinado, apontar o caminho de
   juntar os serviços (excluir e reemitir com a soma).
2. **Prévia do custo na nova compra com RPA.** Ao digitar o valor (bruto ou
   líquido), mostrar líquido, retenções, INSS patronal e custo total com as
   alíquotas padrão — o mesmo quadro da página da compra, antes de gravar.
3. **NIT/PIS na emissão.** Prestador sem NIT/PIS: aviso no formulário com o
   campo para preencher ali mesmo (grava no cadastro do fornecedor).

## Onda 2 — Remessa e linha do tempo (sem banco)

1. **Limite na remessa bancária.** Ao incluir a ordem de um RPA na remessa,
   conferir o limite pelo mês do pagamento previsto — no retorno do banco já
   não dá para barrar.
2. **Linha do tempo no processo de compra.** Faixa no topo: solicitação →
   compra → documento fiscal (RPA assinado / nota) → autorização → paga →
   comprovante enviado, com a etapa atual destacada e o que falta.

## Onda 3 — Assinatura do RPA andando sozinha

1. **Link automático na emissão.** Prestador com e-mail no cadastro: o link
   de assinatura sai ao emitir (opção marcada por padrão no formulário).
2. **Lembrete.** RPA sem assinatura há N dias (padrão 3): novo e-mail ao
   prestador, até 2 lembretes; aviso ao comprador quando esgotar. Pelo tick
   diário que já existe (`/api/pendencias/tick`).

Decidido (31/10): 3 dias, 2 lembretes.

## Onda 4 — Comprovante de pagamento

1. **Marcação própria no contato:** "Recebe comprovantes de pagamento",
   separada de "Recebe as ordens de compra" (migração).
2. **Envio automático (opcional):** ao anexar o comprovante à ordem paga, ele
   vai aos contatos marcados, se a opção estiver ligada (por fornecedor, ou
   para todos nas configurações de Aquisição). Registrado na trilha da ordem.

Decidido (31/10): só nos fornecedores marcados.

## Onda 5 — IRRF acumulado no mês (muda o cálculo)

A causa que o limite contorna: o IRRF do autônomo é apurado pelo total que
ele recebe no mês. Em vez de só bloquear:

1. Na emissão, somar os RPAs do prestador com pagamento no mesmo mês e
   calcular o IRRF sobre o total; o RPA novo retém a diferença (o que faltou
   reter nos anteriores).
2. O recibo mostra a memória do cálculo (base do mês, IRRF do mês, já retido
   nos RPAs nº X, retido neste).
3. O limite passa a poder ser **alerta** em vez de bloqueio (configuração).

Decisão **com a contabilidade antes de começar**: confirmar a regra
(acumular pelo mês do pagamento; dedução por dependente uma vez no mês;
tratamento do INSS já retido no teto) e se o limite continua bloqueando.

## Onda 6 — Fechamento do mês para a contabilidade

1. **Relatório de RPAs por e-mail** à contabilidade no fechamento do mês
   (planilha com NIT/PIS, bruto, retenções e patronal).
2. **Alerta das guias do RPA:** INSS RPA, IRRF RPA e ISS RPA perto do
   vencimento sem lançamento, ou lançadas com valor diferente da soma das
   retenções.

Decisão: o e-mail da contabilidade (configuração nova) e a data do envio.

## Andamento

| Onda | Situação |
|---|---|
| 1 — Avisar antes de enviar | **concluída** 31/10 — avisos do limite ao vivo, custo total na prévia, NIT/PIS na emissão |
| 2 — Remessa e linha do tempo | **concluída** 31/10 — pendência de limite na Nova remessa, faixa de etapas no processo |
| 3 — Assinatura automática | **concluída** 31/10 — link na emissão (marcado por padrão), lembretes a cada 3 dias até 2, depois aviso a quem emitiu |
| 4 — Comprovante | **concluída** 31/10 — contato "recebe comprovantes", envio automático por fornecedor marcado (migração 20261031160553) |
| 5 — IRRF acumulado | aguarda a contabilidade |
| 6 — Fechamento contábil | a fazer (e-mail da contabilidade) |
