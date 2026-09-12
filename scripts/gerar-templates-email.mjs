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
 * Troca de e-mail: nenhuma tela do app faz isso hoje (11/09/2026). Se uma
 * tela futura chamar updateUser({ email }) SEM emailRedirectTo, o RedirectTo
 * vira o Site URL, sem "?", e o link padrão sairia quebrado. Por isso o
 * modelo tem dois ramos COMPLETOS (botão + endereço), escolhidos pelo `if`:
 * nunca ponha o `if` no meio do href, o Go pode recusar URL ambígua.
 */
const LINK_TROCA_COM_RETORNO = link("email_change")
const LINK_TROCA_PADRAO =
  "{{ .SiteURL }}/auth/confirm?next=/&token_hash={{ .TokenHash }}&type=email_change"
const AVISO_TROCA = `Este link vale por <strong>${PRAZO}</strong> e funciona uma única vez. Se a troca segura estiver ligada, o endereço antigo e o novo recebem um link cada, e os dois precisam ser confirmados.`

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
    assunto: "Confluir | Redefinição de senha",
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
    assunto: "Confluir | Seu acesso",
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
    assunto: "Confluir | Seu código de acesso",
    preheader: `Seu código de acesso ao Confluir. Vale por ${PRAZO}.`,
    corpo: corpoCodigo({
      titulo: "Seu código de acesso",
      intro: "Digite o código abaixo na tela em que você pediu o acesso.",
    }),
  },
  {
    arquivo: "confirmar-cadastro.html",
    supabase: "Confirm signup",
    assunto: "Confluir | Confirme seu e-mail",
    preheader: `Seu código para confirmar o e-mail. Vale por ${PRAZO}.`,
    corpo: corpoCodigo({
      titulo: "Confirme seu e-mail",
      intro:
        "É o seu primeiro acesso ao Confluir. Para confirmar este e-mail, digite o código abaixo na tela em que você o pediu.",
    }),
  },
  {
    arquivo: "troca-email.html",
    supabase: "Change Email Address",
    assunto: "Confluir | Confirme a troca de e-mail",
    preheader: `Confirme o novo e-mail da sua conta. O link vale por ${PRAZO}.`,
    corpo: [
      tituloEmail("Confirme a troca de e-mail"),
      paragrafo(
        "Recebemos um pedido para trocar o e-mail da sua conta no Confluir de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>. Para confirmar, clique no botão abaixo."
      ),
      "{{ if ne .RedirectTo .SiteURL }}",
      botaoEmail(LINK_TROCA_COM_RETORNO, "Confirmar novo e-mail"),
      caixaAviso(AVISO_TROCA),
      linkReserva(LINK_TROCA_COM_RETORNO),
      "{{ else }}",
      botaoEmail(LINK_TROCA_PADRAO, "Confirmar novo e-mail"),
      caixaAviso(AVISO_TROCA),
      linkReserva(LINK_TROCA_PADRAO),
      "{{ end }}",
      textoSuave(
        "Se não foi você que pediu, não clique no botão e avise a sua entidade: alguém pode estar tentando alterar a sua conta."
      ),
    ].join("\n"),
  },
  {
    arquivo: "reautenticacao.html",
    supabase: "Reauthentication",
    assunto: "Confluir | Código de confirmação",
    preheader: `Seu código para confirmar que é você. Vale por ${PRAZO}.`,
    corpo: [
      tituloEmail("Confirme que é você"),
      paragrafo(
        "Para concluir uma alteração de segurança na sua conta do Confluir, digite o código abaixo na tela em que você está."
      ),
      caixaCodigo("{{ .Token }}"),
      caixaAviso(
        `O código vale por <strong>${PRAZO}</strong> e funciona uma única vez. Cada novo pedido anula o anterior.`
      ),
      textoSuave(
        "Se você não está alterando nada na sua conta, não repasse este código a ninguém e troque sua senha."
      ),
    ].join("\n"),
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
${MODELOS.map((m) => `| ${m.supabase} | ${m.arquivo} | ${m.assunto.replaceAll("|", "\\|")} |`).join("\n")}

O prazo citado nos textos (${PRAZO}) vem de \`VALIDADE_LINK_EMAIL_SEGUNDOS\`
em \`src/lib/auth-email-constantes.ts\`, que espelha o "Email OTP Expiration"
do Supabase. Mudou lá, mude a constante e gere de novo.

*Change Email Address* e *Reauthentication* não são disparados pelo app hoje
(nenhuma tela troca o e-mail de login nem pede reautenticação). Estão prontos
para quando isso existir ou para quem ligar "Secure email change" ou "Secure
password change" no Supabase. Uma tela que trocar o e-mail deve passar
\`emailRedirectTo\` com o subdomínio do tenant.
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
      .replaceAll("{{ .Email }}", "voce@exemplo.com.br")
      .replaceAll("{{ .NewEmail }}", "novo@exemplo.com.br")
      // Prévia mostra só o ramo "com retorno": corta de {{ else }} até o {{ end }} seguinte.
      .split("{{ else }}")
      .map((parte, i) => (i === 0 ? parte : parte.slice(parte.indexOf("{{ end }}") + "{{ end }}".length)))
      .join("")
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
