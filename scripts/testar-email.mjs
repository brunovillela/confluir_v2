// Testa a ENTREGA dos dois canais de e-mail do Confluir, um de cada vez.
//
//   node scripts/testar-email.mjs alguem@dominio.com            → só o canal do app
//   node scripts/testar-email.mjs alguem@dominio.com --auth     → também o canal do Supabase Auth
//
// Canal APP  = o que manda aviso de votação, comprovante, convite (API do
//              provedor: Brevo hoje, Resend quando EMAIL_PROVEDOR=resend).
// Canal AUTH = o que manda os CÓDIGOS de acesso (SMTP configurado no painel do
//              Supabase). É o canal que a Microsoft engoliu em 22/09/2026 —
//              por isso este teste existe: depois de trocar o SMTP, rode com
//              --auth para um endereço @hotmail.com e para um @gmail.com.
//
// O teste do canal AUTH usa "recuperação de senha": só sai e-mail se a conta
// existir, e nada é alterado.

import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(process.cwd() + "/package.json")
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)

const destino = process.argv[2]
const comAuth = process.argv.includes("--auth")
if (!destino || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
  console.error("Uso: node scripts/testar-email.mjs alguem@dominio.com [--auth]")
  process.exit(1)
}

const remetente = env.EMAIL_REMETENTE
const usaResend = env.EMAIL_PROVEDOR === "resend"
const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })
const html = `<p>Teste de entrega do Confluir.</p><p>Canal do aplicativo · ${
  usaResend ? "Resend" : "Brevo"
} · ${agora}</p><p>Se você recebeu isto, este canal está entregando neste provedor de e-mail.</p>`

console.log(`Canal APP (${usaResend ? "Resend" : "Brevo"}) → ${destino}`)
if (usaResend) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Confluir <${remetente}>`,
      to: [destino],
      subject: `Teste de entrega do Confluir (${agora})`,
      html,
    }),
  })
  console.log("  ", r.status, (await r.text()).slice(0, 200))
} else {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { email: remetente, name: "Confluir" },
      to: [{ email: destino }],
      subject: `Teste de entrega do Confluir (${agora})`,
      htmlContent: html,
    }),
  })
  console.log("  ", r.status, (await r.text()).slice(0, 200))
}

if (comAuth) {
  const { createClient } = require("@supabase/supabase-js")
  const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  console.log(`Canal AUTH (SMTP do Supabase) → ${destino}`)
  const { error } = await supabase.auth.resetPasswordForEmail(destino)
  console.log("  ", error ? `erro: ${error.message}` : "pedido aceito pelo Supabase")
  console.log(
    "   (só chega se existir conta com este e-mail; confira a caixa e o lixo eletrônico)"
  )
}

console.log(
  "\nConfira a entrega no painel do provedor: Brevo → Transactional → Logs; Resend → Emails."
)
