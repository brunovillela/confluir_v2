# Oposição — melhorias para a campanha (31/10/2026)

Depois do pente fino (`docs/avaliacao-oposicao-2026-10.md`) e das orientações
antes de se opor (08dad960), o que ainda facilita a vida de quem atende
(painel) e de quem se opõe (portal) numa campanha grande. Em ondas, das que
mais aliviam antes de abrir a campanha às que dependem de terceiros.

## Onda 1 — antes de abrir (texto certo e nada esquecido)

1. **Ajuda atualizada** — os três artigos da oposição (portal, fluxo público e
   painel) ainda descrevem o cadastro com senha e o "acesso do trabalhador".
   Reescrever com o fluxo de hoje: código no e-mail, "Sou filiado" / "Não sou
   filiado", instruções e "Li e quero prosseguir", dados do filiado pelo CEP,
   carta gov.br, comprovante; no painel, decisões jurídicas, aviso de
   privacidade, perguntas frequentes, avaliação em lote, relação por empregador
   e dossiê.
2. **Checklist "pronta para abrir"** — cartão na campanha com o que falta,
   separado em impede abrir / recomendado: decisões jurídicas, prazo, fontes,
   vídeo com tempo mínimo sem endereço, aviso de privacidade ainda no padrão,
   perguntas frequentes da campanha, declaração, teste completo.
3. **Ver como o trabalhador** — prévia, no painel, do que o filiado e o não
   filiado leem antes de se opor (etapas, instruções, aviso, perguntas
   frequentes), também com a campanha em rascunho, para o jurídico revisar o
   texto exato que vai ser aceito.

## Onda 2 — atendimento (o "não chegou" e o "por que fui reprovado")

4. **Diagnóstico de acesso por CPF ou e-mail** — no painel: pedidos de código
   e tentativas (o que `lib/auth-diagnostico` já registra), para quais e-mails
   foram e o que a Brevo diz de cada endereço (entregue, recusado, bloqueado,
   caixa inexistente) pela API de eventos, com a orientação pronta para o
   atendente.
5. **Motivos de reprovação prontos** — lista fechada (assinatura de outra
   pessoa, PDF escaneado ou sem assinatura, fora do prazo, CPF não confere,
   fonte fora da campanha…) com o texto que vai ao trabalhador dizendo como
   corrigir; "outro" continua livre.

## Onda 3 — acompanhar e divulgar

6. **Funil da campanha** — quantos entraram, leram as instruções, conferiram
   os dados, confirmaram, estão sem carta, mandaram carta inválida, foram
   aprovados; por fonte. Pede o registro da leitura das instruções como
   evento (hoje só vai para a oposição na confirmação).
7. **Lembretes da carta** — além do lembrete de hoje, no começo da última
   semana, na véspera e no último dia, com o link direto para o comprovante.
8. **Kit de divulgação** — link, QR code e texto pronto (WhatsApp e boletim)
   montados com o prazo e os passos da campanha; botão para avisar os filiados
   das fontes pelas Mensagens aos filiados.

## Onda 4 — depende de terceiros ou de teste no aparelho

9. **Assinatura gov.br dentro do fluxo** — API de assinatura do ITI (sem
   baixar e reenviar o PDF). Começa pelo pedido de credenciamento ao ITI (do
   usuário). Enquanto isso: passo a passo com imagens do Assinador no
   comprovante.
10. **Teste no celular** — o fluxo inteiro a 375 px, com o teclado aberto,
    vindo de um link no WhatsApp.

## Andamento

- Onda 1 — FEITA em 31/10/2026: ajuda reescrita (portal, fluxo público, painel, resumo no manifesto; print antigo do fluxo público retirado), cartão "Pronta para abrir?" (`lib/oposicao-prontidao.ts`) e "Ver como o trabalhador" (`/painel/representacao/oposicao/[id]/previa`). Sem migração.
- Onda 2 — a fazer.
