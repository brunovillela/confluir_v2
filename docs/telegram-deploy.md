# Deploy e ativação do bot do Telegram

Passo a passo para colocar o bot do Telegram no ar depois que o app já está
publicado na Vercel. O código está pronto e testado; falta só a configuração
abaixo (nada disso fica no repositório — são segredos de ambiente).

## 1. Criar o bot no @BotFather

No Telegram, fale com **@BotFather**:

1. `/newbot` → escolha um nome e um **username** (precisa terminar em `bot`,
   ex.: `confluir_sindipetro_bot`).
2. Guarde o **token** que ele devolve (`7123...:AAH...`). É uma senha — nunca
   comite nem cole em chat. Se vazar, `/revoke` no BotFather gera outro.

## 2. Variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Valor |
| --- | --- |
| `TELEGRAM_BOT_TOKEN` | token do @BotFather |
| `TELEGRAM_BOT_USERNAME` | o username escolhido (com ou sem `@`) |
| `TELEGRAM_WEBHOOK_SECRET` | string aleatória (`openssl rand -hex 32`) |

Depois de salvar, faça um **redeploy** (variáveis só entram em vigor em um novo
build).

## 3. Registrar o webhook (uma vez só)

Com o deploy no ar, rode uma vez (troque os valores reais):

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/setWebhook?url=https://SEU-DOMINIO/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>"
```

Deve responder `{"ok":true,...}`. Para conferir se o Telegram está entregando:

```bash
curl "https://api.telegram.org/bot<TELEGRAM_BOT_TOKEN>/getWebhookInfo"
```

(`url` preenchida e `last_error_message` vazio = ok.)

## 4. (Opcional) Menu de comandos no @BotFather

`/setcommands` → escolher o bot → colar:

```
contracheque - Seu contracheque mais recente
ferias - Seu saldo de férias
diarias - Suas últimas diárias
informes - Seus informes de rendimentos
asos - Seus ASOs
carros - Veículos disponíveis
filiado - Consulta de filiação (nome ou CPF)
ajuda - Ajuda
```

## Como o usuário ativa (fluxo final)

1. **Meu perfil → Telegram** → gerar link e abrir no Telegram (`/start`).
2. Voltar ao painel e **confirmar o telefone** (o código chega no Telegram).
3. Pronto: o bot responde aos comandos e os pushes começam a sair.

O bot só responde — e só envia push — a quem confirmou o telefone. Cada usuário
escolhe em **Meu perfil → Telegram** o que quer receber (checkboxes por evento).

## SQLs (já rodados na virada)

`supabase/telegram.sql`, `supabase/telegram-prefs.sql`,
`supabase/telegram-telefone.sql`.
