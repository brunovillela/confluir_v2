// Testa a ENTREGA dos dois canais de e-mail do Confluir e diz o que aconteceu.
//
//   node scripts/testar-email.mjs voce@gmail.com               → canal do app
//   node scripts/testar-email.mjs voce@hotmail.com --auth      → app + códigos (Supabase)
//   node scripts/testar-email.mjs voce@hotmail.com --conferir  → só consulta, não envia
//
// Canal APP  = aviso de votação, comprovante, convites (API do provedor: Brevo
//              hoje; Resend com EMAIL_PROVEDOR=resend).
// Canal AUTH = os CÓDIGOS de acesso, pelo SMTP configurado no painel do
//              Supabase. É o canal que a Microsoft engoliu em 22/09/2026, por
//              isso o teste manda o MESMO e-mail que o eleitor recebe
//              ("Confirme seu email"), criando e apagando uma conta descartável.
//
// USE SÓ CAIXAS QUE VOCÊ CONTROLA. Endereço inventado (alguem@hotmail.com) é a
// caixa de outra pessoa ou não existe: vira recusa, e recusa derruba a
// reputação de envio — exatamente o problema que estamos consertando.

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

const destino = (process.argv[2] ?? "").trim().toLowerCase()
const comAuth = process.argv.includes("--auth")
const soConferir = process.argv.includes("--conferir")
const usaResend = env.EMAIL_PROVEDOR === "resend"

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(destino)) {
  console.error("Uso: node scripts/testar-email.mjs voce@dominio.com [--auth] [--conferir]")
  process.exit(1)
}

// Guarda contra endereço de exemplo: recusa suja a reputação de envio.
const INVENTADOS =
  /^(alguem|alguém|fulano|ciclano|beltrano|teste|test|exemplo|example|seu|sua|meu|minha|nome|usuario|user|email|e-mail|voce|você)([._-]?(email|mail|nome|conta|endereco))?\d*@/
if (INVENTADOS.test(destino) || /@(example|exemplo)\./.test(destino)) {
  console.error(
    `"${destino}" parece um endereço de exemplo. Use uma caixa sua de verdade:\n` +
      "  · um endereço da Microsoft (hotmail/outlook/live) que você abra, e\n" +
      "  · um do Gmail, para comparar.\n" +
      "Mandar para endereço inventado gera recusa e piora a entrega de todo mundo."
  )
  process.exit(1)
}

const agora = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })

/**
 * Já bateu na porta e voltou recusado? Então não insista. Vale para recusa
 * definitiva (hardBounces), temporária (softBounces — inclui "domínio não
 * existe") e bloqueio do provedor.
 */
async function jaRecusado(email) {
  for (const tipo of ["hardBounces", "softBounces", "blocked", "invalid"]) {
    const r = await fetch(
      `https://api.brevo.com/v3/smtp/statistics/events?limit=5&days=30&event=${tipo}&email=${encodeURIComponent(email)}`,
      { headers: { "api-key": env.BREVO_API_KEY, accept: "application/json" } }
    )
    if (!r.ok) continue
    const e = ((await r.json()).events ?? [])[0]
    if (e) return { ...e, tipo }
  }
  return null
}

/** O sistema conhece este endereço? (filiado, usuário, apto ou conta) */
async function conhecido(email) {
  const { createClient } = require("@supabase/supabase-js")
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const tem = async (tabela, colunas) => {
    for (const c of colunas) {
      const { count } = await db
        .from(tabela)
        .select("id", { count: "exact", head: true })
        .ilike(c, email)
      if ((count ?? 0) > 0) return true
    }
    return false
  }
  if (await tem("filiacoes", ["email_pessoal", "email_corporativo"])) return true
  if (await tem("usuarios", ["email"])) return true
  if (await tem("voto_assembleias_aptos", ["email_corporativo"])) return true
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 })
  return (data?.users ?? []).some((u) => (u.email ?? "").toLowerCase() === email)
}

/** Eventos recentes daquele destinatário no provedor (Brevo). */
async function eventosBrevo(email) {
  const r = await fetch(
    `https://api.brevo.com/v3/smtp/statistics/events?limit=30&days=1&email=${encodeURIComponent(email)}`,
    { headers: { "api-key": env.BREVO_API_KEY, accept: "application/json" } }
  )
  if (!r.ok) return []
  return (await r.json()).events ?? []
}

/** Estado de uma mensagem do Resend pelo id. */
async function eventoResend(id) {
  const r = await fetch(`https://api.resend.com/emails/${id}`, {
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
  })
  if (!r.ok) return null
  const j = await r.json()
  return j.last_event ?? j.status ?? null
}

function mostrar(eventos) {
  if (eventos.length === 0) {
    console.log("   (nenhum evento ainda — o provedor pode levar alguns segundos)")
    return
  }
  for (const e of eventos) {
    console.log(
      "   ",
      (e.date ?? "").slice(11, 19),
      String(e.event).padEnd(12),
      (e.subject ?? "").slice(0, 44),
      e.reason ? `· ${e.reason}` : ""
    )
  }
}

if (soConferir) {
  console.log(`Eventos recentes de ${destino}:`)
  mostrar(await eventosBrevo(destino))
}

if (!soConferir) {
// ── Antes de enviar: o endereço é real? ────────────────────────────────────
const recusaAnterior = await jaRecusado(destino)
if (recusaAnterior) {
  console.error(
    `Este endereço já voltou como INEXISTENTE em ${recusaAnterior.date?.slice(0, 16)}:\n` +
      `  ${String(recusaAnterior.reason ?? "").slice(0, 120)}\n` +
      "Insistir só piora a reputação de envio. Confira o endereço."
  )
  process.exit(1)
}
if (!process.argv.includes("--confirmo") && !(await conhecido(destino))) {
  console.error(
    `O sistema não conhece "${destino}" (não é de filiado, usuário, apto nem conta).\n` +
      "Se for a sua caixa mesmo, repita o comando com --confirmo.\n" +
      "Endereço digitado errado vira recusa, e recusa derruba a entrega de todo mundo."
  )
  process.exit(1)
}

// ── Canal do app ───────────────────────────────────────────────────────────
const assunto = `Teste de entrega do Confluir (${agora()})`
const html = `<p>Teste de entrega do Confluir.</p><p>Canal do aplicativo · ${
  usaResend ? "Resend" : "Brevo"
} · ${agora()}</p><p>Se você recebeu isto, este canal está entregando no seu provedor de e-mail.</p>`

console.log(`1. Canal do APP (${usaResend ? "Resend" : "Brevo"}) → ${destino}`)
let idResend = null
if (usaResend) {
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: `Confluir <${env.EMAIL_REMETENTE}>`,
      to: [destino],
      subject: assunto,
      html,
    }),
  })
  const corpo = await r.json().catch(() => ({}))
  idResend = corpo.id ?? null
  console.log("   ", r.status, idResend ? `id ${idResend}` : JSON.stringify(corpo).slice(0, 160))
} else {
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env.BREVO_API_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({
      sender: { email: env.EMAIL_REMETENTE, name: "Confluir" },
      to: [{ email: destino }],
      subject: assunto,
      htmlContent: html,
    }),
  })
  console.log("   ", r.status, (await r.text()).slice(0, 120))
}

// ── Canal dos códigos (SMTP do Supabase) ───────────────────────────────────
let contaCriada = null
if (comAuth) {
  console.log(`2. Canal dos CÓDIGOS (SMTP do Supabase) → ${destino}`)
  const { createClient } = require("@supabase/supabase-js")
  const publico = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  })
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  const { data: lista } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const jaExiste = (lista?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === destino)

  // Manda o MESMO e-mail do eleitor ("Confirme seu email"). Se a conta não
  // existia, ela é criada só para o teste e apagada no fim.
  const { error } = await publico.auth.signInWithOtp({
    email: destino,
    options: { shouldCreateUser: true, data: { tipo: "teste_entrega" } },
  })
  if (error) {
    const detalhe = [error.message, error.code, error.status]
      .filter((v) => v !== undefined && v !== null && v !== "")
      .join(" · ")
    console.log("   ", `recusado pelo Supabase: ${detalhe || JSON.stringify(error)}`)
    if (/rate|limit|segur/i.test(String(error.message ?? error.code ?? ""))) {
      console.log(
        "    → é o limite de envio do Auth (Authentication → Rate Limits). Suba o",
        "'Rate limit for sending emails' antes de uma votação."
      )
    }
  } else {
    console.log("   ", "código pedido ao Supabase — sem erro")
    console.log(
      "    → este e-mail sai pelo SMTP configurado no Supabase (hoje o Resend):\n" +
        "      confira a caixa de entrada e, se precisar, o painel do Resend em Emails.\n" +
        "      Ele NÃO aparece no log da Brevo abaixo."
    )
  }
  if (!jaExiste && !error) {
    const { data: depois } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 })
    contaCriada = (depois?.users ?? []).find((u) => (u.email ?? "").toLowerCase() === destino)
  }
}

// ── O que o provedor diz ───────────────────────────────────────────────────
console.log("\nEsperando o provedor do canal do APP responder (até 60 s)…")
for (let i = 0; i < 6; i++) {
  await new Promise((r) => setTimeout(r, 10000))
  if (usaResend && idResend) {
    const estado = await eventoResend(idResend)
    console.log(`   ${10 * (i + 1)}s · canal do app: ${estado ?? "sem resposta ainda"}`)
    if (["delivered", "bounced", "complained"].includes(estado)) break
  } else {
    const eventos = await eventosBrevo(destino)
    const houve = eventos.some((e) =>
      ["delivered", "hardBounces", "softBounces", "blocked", "spam"].includes(e.event)
    )
    if (houve || i === 5) {
      console.log(`   ${10 * (i + 1)}s:`)
      mostrar(eventos)
      if (houve) break
    }
  }
}

if (contaCriada) {
  const { createClient } = require("@supabase/supabase-js")
  const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  })
  await admin.auth.admin.deleteUser(contaCriada.id)
  console.log(`\nConta descartável do teste apagada (${destino}).`)
}

console.log(
  "\nLeitura: 'requests' é só o aceite do provedor — o que importa é 'delivered'.\n" +
    "Sem nenhum evento depois de 'requests', a mensagem foi engolida pelo destino\n" +
    "(foi o que aconteceu com hotmail/outlook no canal dos códigos em 22/09/2026)."
)
}
