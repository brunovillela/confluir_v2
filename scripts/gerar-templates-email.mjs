/**
 * Gera os modelos de e-mail do Supabase Auth (painel → Authentication →
 * Emails) com a MESMA moldura dos e-mails do app (src/lib/email-layout.ts).
 *
 *   node scripts/gerar-templates-email.mjs
 *     → supabase/email-templates/*.html  (colar no painel do Supabase)
 *   node scripts/gerar-templates-email.mjs --previa <pasta>
 *     → também grava prévias com valores de exemplo, para abrir no navegador
 *
 * Node ≥ 23.6 importa .ts direto (type stripping). Por isso os dois módulos
 * importados aqui não podem ter imports próprios.
 *
 * Link dos botões: `{{ .RedirectTo }}&token_hash=…&type=…`. O app sempre manda
 * o redirect como `<subdomínio do tenant>/auth/confirm?next=…`, então o "&"
 * emenda certo e o link cai na rota que confere o token (verifyOtp) e registra
 * o motivo de cada recusa. Ver src/app/auth/confirm/route.ts.
 */
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"

import { textoValidade } from "../src/lib/auth-email-constantes.ts"
import {
  botaoEmail,
  caixaAviso,
  caixaCodigo,
  layoutEmail,
  linkReserva,
  paragrafo,
  textoSuave,
  tituloEmail,
} from "../src/lib/email-layout.ts"

const PRAZO = textoValidade()
const LOGO = "{{ .SiteURL }}/logo-confluir-completa-dark.png"
const RODAPE =
  "Este é um e-mail automático do Confluir. Não é preciso respondê-lo."
const IGNORAR = textoSuave(
  "Se não foi você que fez este pedido, ignore este e-mail. Nada muda na sua conta."
)
const link = (tipo) =>
  `{{ .RedirectTo }}&token_hash={{ .TokenHash }}&type=${tipo}`

/**
 * Código de 6 dígitos + botão opcional. Os fluxos só de código (votação,
 * mesário, apurador, oposição) pedem o código SEM endereço de retorno; aí o
 * Supabase usa o Site URL como RedirectTo e o botão sairia quebrado. O `if`
 * mostra o botão só quando o pedido trouxe retorno (portal do filiado).
 */
function corpoCodigo({ titulo, intro }) {
  return [
    tituloEmail(titulo),
    paragrafo(intro),
    caixaCodigo("{{ .Token }}"),
    "{{ if ne .RedirectTo .SiteURL }}",
    paragrafo("Se preferir, entre direto pelo botão:"),
    botaoEmail(link("email"), "Entrar no Confluir"),
    "{{ end }}",
    caixaAviso(
      `O código e o link valem por <strong>${PRAZO}</strong> e funcionam uma única vez. Cada novo pedido anula o anterior: use sempre o e-mail mais recente.`
    ),
    IGNORAR,
  ].join("\n")
}

const MODELOS = [
  {
    arquivo: "recuperacao.html",
    supabase: "Reset Password",
    assunto: "Redefinição de senha — Confluir",
    preheader: `Seu link para escolher uma nova senha. Vale por ${PRAZO}.`,
    corpo: [
      tituloEmail("Redefinição de senha"),
      paragrafo(
        "Recebemos um pedido para redefinir a senha da sua conta no Confluir. Clique no botão abaixo para escolher uma nova."
      ),
      botaoEmail(link("recovery"), "Redefinir senha"),
      caixaAviso(
        `Este link vale por <strong>${PRAZO}</strong> e funciona uma única vez. Se ele vencer, peça outro em <strong>Esqueci minha senha</strong>, na tela de login.`
      ),
      linkReserva(link("recovery")),
      textoSuave(
        "Se não foi você que pediu, ignore este e-mail. Sua senha continua a mesma."
      ),
    ].join("\n"),
  },
  {
    arquivo: "convite.html",
    supabase: "Invite user",
    assunto: "Seu acesso ao Confluir",
    preheader: `Defina sua senha para entrar. O convite vale por ${PRAZO}.`,
    corpo: [
      tituloEmail("Seu acesso ao Confluir foi liberado"),
      paragrafo(
        "Você recebeu um convite para usar o Confluir. Para entrar, defina sua senha pelo botão abaixo."
      ),
      botaoEmail(link("invite"), "Definir minha senha"),
      caixaAviso(
        `Este convite vale por <strong>${PRAZO}</strong> e funciona uma única vez. Se ele vencer, peça um novo link em <strong>Esqueci minha senha</strong>, na tela de login, informando este mesmo e-mail.`
      ),
      linkReserva(link("invite")),
    ].join("\n"),
  },
  {
    arquivo: "link-magico.html",
    supabase: "Magic Link",
    assunto: "Seu código de acesso — Confluir",
    preheader: `Seu código de acesso ao Confluir. Vale por ${PRAZO}.`,
    corpo: corpoCodigo({
      titulo: "Seu código de acesso",
      intro: "Digite o código abaixo na tela em que você pediu o acesso.",
    }),
  },
  {
    arquivo: "confirmar-cadastro.html",
    supabase: "Confirm signup",
    assunto: "Confirme seu e-mail — Confluir",
    preheader: `Seu código para confirmar o e-mail. Vale por ${PRAZO}.`,
    corpo: corpoCodigo({
      titulo: "Confirme seu e-mail",
      intro:
        "É o seu primeiro acesso ao Confluir. Para confirmar este e-mail, digite o código abaixo na tela em que você o pediu.",
    }),
  },
]

function montar(m) {
  return layoutEmail({
    corpo: m.corpo,
    logoUrl: LOGO,
    preheader: m.preheader,
    titulo: m.assunto,
    rodape: RODAPE,
  })
}

const destino = "supabase/email-templates"
mkdirSync(destino, { recursive: true })
for (const m of MODELOS) writeFileSync(join(destino, m.arquivo), montar(m))

writeFileSync(
  join(destino, "LEIA-ME.md"),
  `# Modelos de e-mail do Supabase Auth

Gerados por \`node scripts/gerar-templates-email.mjs\` a partir de
\`src/lib/email-layout.ts\` (a mesma moldura dos e-mails do app). **Não edite
os .html à mão**: mude o script ou a moldura e gere de novo.

Onde colar: painel do Supabase → Authentication → Emails. Em cada modelo,
troque o **Subject** e cole o arquivo inteiro no **Message body**.

| Modelo no Supabase | Arquivo | Assunto |
|---|---|---|
${MODELOS.map((m) => `| ${m.supabase} | ${m.arquivo} | ${m.assunto} |`).join("\n")}

O prazo citado nos textos (${PRAZO}) vem de \`VALIDADE_LINK_EMAIL_SEGUNDOS\`
em \`src/lib/auth-email-constantes.ts\`, que espelha o "Email OTP Expiration"
do Supabase. Mudou lá, mude a constante e gere de novo.

Os modelos *Change Email Address* e *Reauthentication* não são usados pelo
app e ficaram de fora.
`
)

const iPrevia = process.argv.indexOf("--previa")
if (iPrevia > 0) {
  const pasta = process.argv[iPrevia + 1]
  mkdirSync(pasta, { recursive: true })
  const site = "https://sindipetronf.confluir.online"
  const exemplo = (html, redirect) =>
    html
      .replaceAll("{{ .SiteURL }}", site)
      .replaceAll("{{ .RedirectTo }}", redirect)
      .replaceAll("{{ .TokenHash }}", "pkce_3f9a0c2e7b")
      .replaceAll("{{ .Token }}", "482913")
      .replaceAll("{{ if ne .RedirectTo .SiteURL }}", "")
      .replaceAll("{{ end }}", "")
  for (const m of MODELOS) {
    const redirect = m.arquivo.startsWith("link")
      ? `${site}/auth/confirm?next=/portal/inicio`
      : `${site}/auth/confirm?next=/definir-senha`
    writeFileSync(join(pasta, "previa-" + m.arquivo), exemplo(montar(m), redirect))
  }
  console.log(`prévias em ${pasta}`)
}
console.log(`${MODELOS.length} modelos em ${destino}`)
