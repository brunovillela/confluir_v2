# Modelos de e-mail do Supabase Auth

Gerados por `node scripts/gerar-templates-email.mjs` a partir de
`src/lib/email-layout.ts` (a mesma moldura dos e-mails do app). **Não edite
os .html à mão**: mude o script ou a moldura e gere de novo.

Onde colar: painel do Supabase → Authentication → Emails. Em cada modelo,
troque o **Subject** e cole o arquivo inteiro no **Message body**.

| Modelo no Supabase | Arquivo | Assunto |
|---|---|---|
| Reset Password | recuperacao.html | Confluir \| Redefinição de senha |
| Invite user | convite.html | Confluir \| Seu acesso |
| Magic Link | link-magico.html | Confluir \| Seu código de acesso |
| Confirm signup | confirmar-cadastro.html | Confluir \| Confirme seu e-mail |
| Change Email Address | troca-email.html | Confluir \| Confirme a troca de e-mail |
| Reauthentication | reautenticacao.html | Confluir \| Código de confirmação |

O prazo citado nos textos (2 horas) vem de `VALIDADE_LINK_EMAIL_SEGUNDOS`
em `src/lib/auth-email-constantes.ts`, que espelha o "Email OTP Expiration"
do Supabase. Mudou lá, mude a constante e gere de novo.

*Change Email Address* e *Reauthentication* não são disparados pelo app hoje
(nenhuma tela troca o e-mail de login nem pede reautenticação). Estão prontos
para quando isso existir ou para quem ligar "Secure email change" ou "Secure
password change" no Supabase. Uma tela que trocar o e-mail deve passar
`emailRedirectTo` com o subdomínio do tenant.
