# Plano: quartos coletivos em Viagens

> 10/11/2026. Pedido do Bruno: como ficam o lançamento e o rateio de quartos duplos, triplos etc. na área de Viagens.

## Como é hoje

- Cada viagem tem uma pessoa e as próprias hospedagens (`viagens_itens`, tipo `hospedagem`).
- Não existe a ideia de quarto compartilhado. Um triplo são três viagens com três hospedagens soltas.
- A reserva é registrada item a item; dá para repetir o número e o voucher, mas nada liga uma hospedagem à outra.
- Na fatura, cada item marcado precisa de valor maior que zero (`registrarFatura`). Um quarto pago numa fatura só tem de ser dividido à mão entre as hospedagens.
- Feita a divisão, o rateio já sai certo: a conta de cada item vem do quadro de quem viaja × departamento que banca × tipo de gasto (de-para das diárias), e a taxa da agência é rateada na proporção dos itens.

## A ideia central

Cada pessoa continua com a sua hospedagem. Entra o **quarto**, que junta as hospedagens de quem dorme junto: a reserva e o valor são registrados uma vez, no quarto, e o sistema divide o valor entre os ocupantes, gravando a parte de cada um no `valor` da hospedagem dessa pessoa.

Assim, fatura, rateio por conta, taxa da agência, ordem de pagamento e relatórios continuam funcionando sem mudança, porque já trabalham com o valor de cada item.

## Decisões (10/11/2026)

- **No pedido, só Individual ou Coletivo.** Não se escolhe duplo, triplo etc.: o tamanho sai de quantas pessoas o atendimento põe no quarto (2 = duplo, 3 = triplo…).
- **O atendimento organiza os quartos com liberdade.** Junta quaisquer hospedagens (inclusive de quem pediu individual), move pessoas entre quartos, separa, desfaz. O que a pessoa pediu é só indicação: aparece ao lado de cada ocupante e nunca trava nada.
- **Divisão:** igual para todos por padrão; "por noites" a um clique quando as datas diferem; ajuste manual conferido contra o total. Contas em centavos, a sobra vai para a maior parte.
- **Ocupante que cancela depois da reserva:** a parte dele continua na viagem cancelada (o hotel costuma cobrar o quarto inteiro). A equipe pode reorganizar e redividir antes da fatura.
- **Ocupante de fora** (acompanhante que paga a própria parte): fora desta versão. A equipe registra só as hospedagens que o sindicato paga.
- **Limite da reorganização:** livre até o quarto entrar numa fatura; depois, só desfazendo a fatura.

## Fase 1: o pedido

- Banco (migração): em `viagens_itens`, `quarto_pedido` (`individual` | `coletivo`, padrão `individual`) e `dividir_com` (texto livre, opcional).
- Formulário de viagem: a hospedagem ganha **Quarto: Individual | Coletivo**; em Coletivo, o campo opcional **Prefere dividir com**.
- Bot do Telegram (/viagem): depois das datas da hospedagem, pergunta Individual ou Coletivo.
- Telas da viagem (quem pede, quem viaja, atendimento): a hospedagem mostra o quarto pedido e a preferência.
- Exportação: colunas do quarto pedido.

## Fase 2: o atendimento

- Banco (migração): tabela `viagens_quartos` (cidade, entrada, saída, agência, número da reserva, detalhes, voucher, valor total, critério de divisão) e `viagens_itens.quarto_id`.
- Na viagem, cada hospedagem ganha **Montar quarto**: sugere hospedagens de outras viagens na mesma cidade e com datas que se cruzam, primeiro quem pediu coletivo e quem foi citado em "Prefere dividir com". A equipe decide.
- Reorganizar: mover ocupante, separar em individual, desfazer o quarto.
- Reserva registrada no quarto e propagada às hospedagens; cada ocupante recebe o próprio e-mail com o voucher. Quem muda de quarto é avisado de novo.
- Quem viaja vê com quem divide o quarto; não vê valores.

## Fase 3: a fatura

- Em Nova fatura, o quarto vira um bloco: valor total uma vez, a parte de cada ocupante embaixo, pelo critério escolhido.
- O quarto entra inteiro numa fatura só.
- Cada parte vai para a conta da sua pessoa, como hoje.

## Fase 4: relatórios e manual

- Exportação com a coluna Quarto (tipo e ocupantes).
- Manual de Viagens com prints, "O que há de novo" e base de ajuda.

## LGPD

`dividir_com` é texto livre com nome de pessoa: `[lgpd:identificacao]`. A tabela `viagens_quartos` (Fase 2) guarda localizador e voucher, com etiquetas e entrada no processo de Viagens em `docs/lgpd/processos.mjs`.
