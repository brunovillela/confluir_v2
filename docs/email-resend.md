# Trocar o e-mail de autenticação para o Resend

## Por que

Em 22/09/2026, durante uma votação real, os eleitores de Hotmail/Outlook/Live
não recebiam o código de acesso. Os números da Brevo, nos três dias anteriores:

| Canal | Provedor do destinatário | Pedidos | Entregues |
|---|---|---|---|
| App (API da Brevo) | Google / Yahoo / outros | 43 | 43 |
| App (API da Brevo) | Microsoft | 11 | 7 |
| **Auth (SMTP do Supabase → relay da Brevo)** | Google / outros | 7 | 7 |
| **Auth (SMTP do Supabase → relay da Brevo)** | **Microsoft** | **15** | **0** |

Sem recusa, sem bloqueio, sem spam: descarte silencioso. A mesma caixa recebia
o e-mail do app e não recebia o código — são faixas de IP diferentes na Brevo, e
a do relay SMTP está com reputação ruim na Microsoft.

O link pessoal de voto (commit 8bc6444) tirou a votação da dependência desse
canal, mas o SMTP do Supabase continua mandando **convite de acesso**,
**redefinição de senha**, **link do portal** e os **códigos** de mesário,
apurador e votação. Por isso a troca.

## O que muda

- **Canal AUTH** (o do Supabase): passa a sair pelo SMTP do Resend. É a troca
  desta receita.
- **Canal APP** (aviso de votação, comprovante, convites do painel): continua na
  Brevo. O código já aceita o Resend — basta `EMAIL_PROVEDOR=resend` e
  `RESEND_API_KEY` — mas só mude depois que o canal AUTH estiver estável.

## Passo a passo

### 1. Conta e domínio no Resend

1. Crie a conta em resend.com e vá em **Domains → Add Domain**: `confluir.online`.
2. O Resend mostra os registros DNS (MX/TXT do envio, DKIM `resend._domainkey` e,
   opcionalmente, DMARC). **O DNS do domínio está na Vercel** (Domains →
   confluir.online → Vercel DNS) — é lá que os registros entram, não no
   HostGator nem na Brevo.
3. Espere ficar **Verified**. O DKIM costuma valer em minutos.
4. Mantenha o DKIM da Brevo como está: os dois convivem, e o canal do app segue
   funcionando durante a transição.

> Cuidado com o DMARC: se já existe um `_dmarc` com `p=reject`, só publique o
> DKIM do Resend depois que ele estiver verificado, senão os e-mails do novo
> provedor podem ser recusados no meio do caminho.

### 2. Chave SMTP no Resend

Em **API Keys**, crie uma chave com permissão de envio (`Sending access`).
A mesma chave serve para o SMTP e para a API:

- Host: `smtp.resend.com`
- Porta: `587` (TLS)
- Usuário: `resend`
- Senha: a **API key** (`re_…`)

### 3. Trocar o SMTP no Supabase

Painel do Supabase → **Project Settings → Authentication → SMTP Settings**:

| Campo | Valor |
|---|---|
| Host | `smtp.resend.com` |
| Port | `587` |
| Username | `resend` |
| Password | a API key do Resend |
| Sender email | `nao-responda@confluir.online` |
| Sender name | `Confluir` |

Salve. Confira também **Authentication → Rate Limits → Rate limit for sending
emails**: o padrão é baixo (30/hora) e, num dia de votação, ele sozinho já
segura os códigos. Suba para o volume esperado da maior rodada.

### 4. Conferir os modelos

Os modelos ficam em `supabase/email-templates/` (gerados por
`node scripts/gerar-templates-email.mjs` — não edite os `.html` à mão). Depois
da troca, confira no painel do Supabase → **Authentication → Emails** que os
seis modelos continuam com o texto em português e que **Confirm signup** e
**Magic Link** mostram `{{ .Token }}`: é o código de 6 dígitos da votação, e o
primeiro acesso de um eleitor novo cai justamente no *Confirm signup*.

### 5. Testar a entrega

```bash
node scripts/testar-email.mjs voce@hotmail.com --auth
```

Rode para **duas caixas suas**: uma da Microsoft (hotmail/outlook/live) e uma do
Gmail. O script manda um e-mail pelo canal do app e, com `--auth`, pede ao
Supabase o mesmo "Confirme seu email" que o eleitor recebe — criando e apagando
uma conta descartável. Depois ele espera até 60 s e mostra o que o provedor
respondeu.

> **Só endereços que você controla.** Endereço inventado (`alguem@hotmail.com`)
> é caixa de outra pessoa ou inexistente: vira recusa, e recusa derruba a
> reputação de envio — o script recusa esses endereços.

Leitura do resultado: `requests` é só o aceite do provedor; o que vale é
`delivered`. Ficar só em `requests` é o sintoma do problema de 22/09 — a
mensagem foi engolida pelo destino. Para consultar sem enviar nada:
`node scripts/testar-email.mjs voce@hotmail.com --conferir`.

Pronto quando: os dois provedores receberem o e-mail do canal AUTH.

### 6. Depois (opcional): mover o canal do app

Com o Resend estável por alguns dias, dá para unificar:

1. `EMAIL_PROVEDOR=resend` e `RESEND_API_KEY=re_…` no `.env.local` e na Vercel
   (Production), e redeploy.
2. `node scripts/testar-email.mjs voce@hotmail.com` e conferir a entrega.
3. Rodar o aviso de votação numa rodada de teste antes de usar numa real.

Para voltar atrás, basta remover `EMAIL_PROVEDOR` e redeployar — o código cai na
Brevo de novo.

## Como voltar atrás no canal AUTH

Refaça o passo 3 com os dados da Brevo (`smtp-relay.brevo.com`, porta `587`,
usuário = login SMTP, senha = SMTP key). Nada no banco depende do provedor.

## Armadilhas conhecidas

- **`535 "Invalid username"` nos Auth Logs = usuário errado no SMTP.** O
  usuário do Resend é a palavra `resend`, não o e-mail da conta. Trocar o host
  para `smtp.resend.com` e deixar o usuário antigo derruba TODO o canal de uma
  vez — foi o que aconteceu em 22/09/2026, das 20h às 22h.

- **Não dispare OTP para domínio inexistente em teste.** Em 22/09 os meus testes
  pediram código para `@empresa-demo.com.br`, que não existe: 22 recusas em
  poucas horas, no mesmo canal que manda os códigos dos eleitores. Teste sempre
  com domínio real.
- **O `EMAIL_SANDBOX=1` não vale para o Resend.** Na Brevo ele manda o cabeçalho
  `X-Sib-Sandbox: drop` (aceita e descarta); no Resend, o app simplesmente não
  envia.
- **Mudou o remetente?** O `EMAIL_REMETENTE` precisa ser de um domínio
  verificado no provedor em uso, senão o envio é recusado.
- **Limite diário do plano.** Vale para os dois provedores; num envio grande
  (aviso a milhares de aptos), confira antes de disparar.
