// Confere a autenticação do domínio que ENVIA os e-mails do Confluir
// (fase 4 do plano de 21/10/2026, docs/plano-votacao-entrega-preparacao.md).
//
// Por quê: filtros corporativos (Halliburton, 21/10) põem em quarentena o que
// não está bem autenticado. SPF, DKIM e DMARC alinhados com a Brevo são o
// mínimo; DMARC com política (quarantine/reject) e relatório (rua) ajuda a
// reputação.
//
// USO: node scripts/conferir-dns-envio.mjs [dominio]
//   sem argumento, usa o domínio de EMAIL_REMETENTE do .env.local.
// Só leitura. Consulta o DNS por HTTPS (dns.google): funciona também em rede
// que bloqueia a porta 53.

import { readFileSync } from "node:fs"

const TIPOS = { TXT: 16, CNAME: 5, MX: 15 }
async function consultar(nome, tipo) {
  const r = await fetch(`https://dns.google/resolve?name=${encodeURIComponent(nome)}&type=${tipo}`)
  if (!r.ok) throw new Error(`DNS por HTTPS respondeu ${r.status}`)
  const j = await r.json()
  return (j.Answer ?? []).filter((a) => a.type === TIPOS[tipo]).map((a) => String(a.data))
}

function dominioPadrao() {
  try {
    const linha = readFileSync(".env.local", "utf8").split(/\r?\n/).find((l) => l.startsWith("EMAIL_REMETENTE="))
    return linha?.split("@")[1]?.replace(/["\s]/g, "") ?? null
  } catch {
    return null
  }
}

const dominio = process.argv[2] ?? dominioPadrao()
if (!dominio) {
  console.error("Informe o domínio: node scripts/conferir-dns-envio.mjs exemplo.com.br")
  process.exit(1)
}

// TXT vem entre aspas e pode vir partido em pedaços ("a" "b").
const txt = async (nome) => (await consultar(nome, "TXT")).map((t) => t.replace(/"\s*"/g, "").replace(/^"|"$/g, ""))
const cname = async (nome) => (await consultar(nome, "CNAME")).map((c) => c.replace(/\.$/, ""))

const achados = []
const ok = (item, detalhe) => achados.push({ ok: true, item, detalhe })
const falta = (item, detalhe) => achados.push({ ok: false, item, detalhe })

// SPF: um registro só, incluindo a Brevo.
const spf = (await txt(dominio)).filter((t) => t.toLowerCase().startsWith("v=spf1"))
if (spf.length === 0) falta("SPF", "nenhum registro v=spf1 — inclua include:spf.brevo.com")
else if (spf.length > 1) falta("SPF", `${spf.length} registros v=spf1 (deve haver só um): ${spf.join(" | ")}`)
else if (!/include:(spf\.brevo\.com|spf\.sendinblue\.com|sendinblue\.com)/i.test(spf[0])) falta("SPF", `não inclui a Brevo: ${spf[0]}`)
else ok("SPF", spf[0])

// Código de verificação da Brevo.
const brevoCode = (await txt(dominio)).find((t) => t.startsWith("brevo-code:") || t.startsWith("Sendinblue-code:"))
if (brevoCode) ok("Verificação Brevo", brevoCode.slice(0, 40) + "…")
else falta("Verificação Brevo", "sem TXT brevo-code (o domínio pode não estar autenticado na Brevo)")

// DKIM: seletores da Brevo (novos: brevo1/brevo2 em CNAME; antigo: mail._domainkey em TXT).
const dkim = []
for (const sel of ["brevo1", "brevo2"]) {
  const c = await cname(`${sel}._domainkey.${dominio}`)
  if (c.length) dkim.push(`${sel} → ${c[0]}`)
}
const mailKey = (await txt(`mail._domainkey.${dominio}`)).find((t) => t.includes("p="))
if (mailKey) dkim.push("mail._domainkey (TXT)")
if (dkim.length) ok("DKIM", dkim.join("; "))
else falta("DKIM", "nenhum seletor da Brevo (brevo1/brevo2._domainkey em CNAME ou mail._domainkey em TXT)")

// DMARC: existe, com política e relatório.
const dmarc = (await txt(`_dmarc.${dominio}`)).find((t) => t.toLowerCase().startsWith("v=dmarc1"))
if (!dmarc) falta("DMARC", "sem _dmarc — crie v=DMARC1; p=none; rua=mailto:... e depois endureça para quarantine")
else {
  const p = /;\s*p=([a-z]+)/i.exec(dmarc)?.[1]?.toLowerCase()
  const rua = /rua=/i.test(dmarc)
  if (p === "none") falta("DMARC", `política p=none (só monitora): ${dmarc}`)
  else ok("DMARC", dmarc)
  if (!rua) falta("DMARC (relatórios)", "sem rua= — sem relatório não se vê quem rejeita")
}

// MX: o domínio recebe (respostas e bounces).
const mx = await consultar(dominio, "MX")
if (mx.length) ok("MX", mx.join(", "))
else falta("MX", "sem MX (respostas ao remetente não chegam)")

console.log(`\nDomínio de envio: ${dominio}\n`)
for (const a of achados) console.log(`${a.ok ? "OK   " : "FALTA"}  ${a.item.padEnd(20)} ${a.detalhe}`)
console.log(`\n${achados.filter((a) => !a.ok).length} item(ns) a corrigir.`)
