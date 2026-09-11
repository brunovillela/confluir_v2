# Modelos de e-mail do Supabase Auth

Gerados por `node scripts/gerar-templates-email.mjs` a partir de
`src/lib/email-layout.ts` (a mesma moldura dos e-mails do app). **Não edite
os .html à mão**: mude o script ou a moldura e gere de novo.

Onde colar: painel do Supabase → Authentication → Emails. Em cada modelo,
troque o **Subject** e cole o arquivo inteiro no **Message body**.

| Modelo no Supabase | Arquivo | Assunto |
|---|---|---|
| Reset Password | recuperacao.html | Redefinição de senha — Confluir |
| Invite user | convite.html | Seu acesso ao Confluir |
| Magic Link | link-magico.html | Seu código de acesso — Confluir |
| Confirm signup | confirmar-cadastro.html | Confirme seu e-mail — Confluir |

O prazo citado nos textos (2 horas) vem de `VALIDADE_LINK_EMAIL_SEGUNDOS`
em `src/lib/auth-email-constantes.ts`, que espelha o "Email OTP Expiration"
do Supabase. Mudou lá, mude a constante e gere de novo.

Os modelos *Change Email Address* e *Reauthentication* não são usados pelo
app e ficaram de fora.
