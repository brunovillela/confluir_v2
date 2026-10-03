/**
 * Migra a identidade das contas de `auth.users.user_metadata.cpf` para a
 * tabela `auth_identidades` (supabase/auth-identidades.sql), aplicando as
 * MESMAS regras de src/lib/auth-identidade.ts:
 *
 *   - filiado:     o e-mail da conta tem de ser um dos e-mails do cadastro
 *                  daquele CPF no tenant (igualdade exata, minúsculas);
 *   - nao_filiado: o CPF precisa existir em portal_nao_filiado do tenant e
 *                  não ser de filiado ativo;
 *   - um CPF = uma conta por tenant.
 *
 * Conta que não passa NÃO entra: a pessoa vincula de novo no próximo login
 * (senha ou código), quando prova a posse do e-mail. As recusas saem num CSV
 * para a secretaria (e-mail compartilhado entre pessoas, CPF em duas contas…).
 *
 * Uso:
 *   node scripts/migrar-identidades-auth.mjs                 # dry-run (padrão)
 *   node scripts/migrar-identidades-auth.mjs --aplicar
 *   node scripts/migrar-identidades-auth.mjs --saida=recusas.csv
 *
 * Lê .env.local (NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY).
 */
import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createClient } = require("@supabase/supabase-js")

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
)

const APLICAR = process.argv.includes("--aplicar")
const SAIDA = process.argv.find((a) => a.startsWith("--saida="))?.slice("--saida=".length)

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const limparCpf = (v) => String(v ?? "").replace(/\D/g, "")
const formatarCpf = (c) => `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}`
const grafias = (c) => [...new Set([c, formatarCpf(c)])]
const mascarar = (e) => String(e ?? "").replace(/^(.).*(@.*)$/, "$1***$2")

async function todosOsUsuarios() {
  const todos = []
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers: ${error.message}`)
    todos.push(...(data?.users ?? []))
    if (!data || data.users.length < 1000) break
  }
  return todos
}

async function main() {
  const { data: tenants, error: erroT } = await admin.from("tenants").select("empresa_id, slug")
  if (erroT) throw new Error(`tenants: ${erroT.message}`)

  const usuarios = await todosOsUsuarios()
  const comCpf = usuarios.filter((u) => /^\d{11}$/.test(limparCpf(u.user_metadata?.cpf)))
  console.log(`contas: ${usuarios.length}; com user_metadata.cpf: ${comCpf.length}; tenants: ${tenants.length}`)

  const vinculos = []   // { auth_user_id, emp, tipo, cpf, nome }
  const recusas = []    // { conta, email, cpf, tenant, motivo }

  for (const u of comCpf) {
    const cpf = limparCpf(u.user_metadata.cpf)
    const email = String(u.email ?? "").trim().toLowerCase()
    const tipoMeta = u.user_metadata?.tipo === "nao_filiado" ? "nao_filiado" : "filiado"
    let achouAlgumTenant = false

    for (const t of tenants) {
      const emp = t.empresa_id
      const { data: filiacoes } = await admin
        .from("filiacoes")
        .select("email_pessoal, email_corporativo, filiacao_condicao")
        .in("cpf", grafias(cpf))
        .eq("emp_proprietaria_id", emp)
        .not("filiacao_excluida", "is", true)
      const linhas = filiacoes ?? []
      const emails = new Set(
        linhas.flatMap((f) => [f.email_pessoal, f.email_corporativo]).filter(Boolean).map((e) => e.trim().toLowerCase())
      )
      const ativo = linhas.some((f) => f.filiacao_condicao === "Ativo")

      if (tipoMeta === "filiado" || ativo) {
        if (linhas.length === 0) continue
        achouAlgumTenant = true
        if (!email || !emails.has(email)) {
          recusas.push({ conta: u.id, email: mascarar(email), cpf, tenant: t.slug, motivo: "e-mail da conta não é o do cadastro deste CPF" })
          continue
        }
        vinculos.push({ auth_user_id: u.id, emp, tipo: "filiado", cpf, nome: null })
        continue
      }

      const { data: nf } = await admin
        .from("portal_nao_filiado")
        .select("id, nome")
        .eq("emp_proprietaria_id", emp)
        .eq("cpf", cpf)
        .maybeSingle()
      if (!nf) continue
      achouAlgumTenant = true
      vinculos.push({ auth_user_id: u.id, emp, tipo: "nao_filiado", cpf, nome: nf.nome ?? u.user_metadata?.nome ?? null })
    }

    if (!achouAlgumTenant) {
      recusas.push({ conta: u.id, email: mascarar(email), cpf, tenant: "-", motivo: "CPF sem cadastro (filiação ou não filiado) em nenhum tenant" })
    }
  }

  // Um CPF = uma conta por tenant: quando duas contas disputam, nenhuma entra.
  const porChave = new Map()
  for (const v of vinculos) {
    const k = `${v.emp}|${v.cpf}`
    porChave.set(k, [...(porChave.get(k) ?? []), v])
  }
  const prontos = []
  for (const [, lista] of porChave) {
    if (lista.length === 1) prontos.push(lista[0])
    else for (const v of lista) recusas.push({ conta: v.auth_user_id, email: "-", cpf: v.cpf, tenant: v.emp, motivo: `CPF em ${lista.length} contas diferentes` })
  }

  console.log(`vínculos prontos: ${prontos.length}; recusas: ${recusas.length}`)
  const porMotivo = recusas.reduce((m, r) => m.set(r.motivo, (m.get(r.motivo) ?? 0) + 1), new Map())
  for (const [motivo, n] of porMotivo) console.log(`  - ${n}: ${motivo}`)

  const csv = ["conta;email;cpf;tenant;motivo", ...recusas.map((r) => [r.conta, r.email, r.cpf, r.tenant, r.motivo].join(";"))].join("\n")
  if (SAIDA) {
    writeFileSync(SAIDA, csv, "utf8")
    console.log(`recusas gravadas em ${SAIDA}`)
  } else if (recusas.length > 0) {
    console.log("\n" + csv)
  }

  if (!APLICAR) {
    console.log("\nDRY-RUN: nada gravado. Rode com --aplicar para gravar.")
    return
  }

  let gravados = 0
  let conflitos = 0
  for (const v of prontos) {
    const { error } = await admin.from("auth_identidades").upsert(
      {
        auth_user_id: v.auth_user_id,
        emp_proprietaria_id: v.emp,
        tipo: v.tipo,
        cpf: v.cpf,
        nome: v.nome,
        vinculada_por: "migracao",
      },
      { onConflict: "auth_user_id,emp_proprietaria_id", ignoreDuplicates: true }
    )
    if (error) {
      conflitos++
      console.error(`  conta ${v.auth_user_id} / cpf ${v.cpf}: ${error.message}`)
    } else gravados++
  }
  console.log(`gravados: ${gravados}; conflitos: ${conflitos}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
