// Contas de função: os e-mails das recepções, que estavam no cadastro da pessoa
// que ocupava o posto no Bubble, passam para uma conta do posto.
//
// Para cada e-mail:
//   1. a pessoa continua com o cadastro (nome, CPF, histórico) e perde só o
//      e-mail; sem classificação, vira Prestador(a) de serviço;
//   2. a conta de função é criada com o e-mail, com o acesso (permissões
//      vazias; o login e os perfis ficam para a tela de Usuários);
//   3. a pessoa é registrada como titular do posto a partir de --inicio.
//
// Idempotente: e-mail que já é de uma conta de função é pulado.
// Requer supabase/contas-funcao.sql.
//
//   node scripts/migrar-contas-funcao.mjs                     (simulação)
//   node scripts/migrar-contas-funcao.mjs --apply [--inicio 2026-09-17]
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"

const require = createRequire(import.meta.url)
const { createClient } = require("@supabase/supabase-js")

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
    })
)
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

const args = process.argv.slice(2)
const arg = (nome) => {
  const i = args.indexOf(nome)
  return i >= 0 ? args[i + 1] : undefined
}
const APLICAR = args.includes("--apply")
const TENANT = arg("--tenant") ?? "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const INICIO =
  arg("--inicio") ?? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
if (!/^\d{4}-\d{2}-\d{2}$/.test(INICIO)) throw new Error("--inicio deve ser AAAA-MM-DD")

const CONTAS = [
  { email: "recepcao1.mac@sindipetronf.org.br", nome: "Recepção 1 — Macaé" },
  { email: "recepcao2.mac@sindipetronf.org.br", nome: "Recepção 2 — Macaé" },
  { email: "recepcao1.cam@sindipetronf.org.br", nome: "Recepção 1 — Campos dos Goytacazes" },
  { email: "recepcao2.cam@sindipetronf.org.br", nome: "Recepção 2 — Campos dos Goytacazes" },
]
const PRESTADOR = "Prestador(a) de serviço"

const falhar = (msg, error) => {
  if (error) throw new Error(`${msg}: ${error.message}`)
}

console.log(APLICAR ? "APLICANDO" : "SIMULAÇÃO — nada será gravado", `· tenant ${TENANT} · titular desde ${INICIO}\n`)

const { error: semSql } = await db.from("usuarios_ocupacoes").select("id").limit(1)
falhar("Rode supabase/contas-funcao.sql antes", semSql)

let criadas = 0
for (const c of CONTAS) {
  const { data: cadastros, error } = await db
    .from("usuarios")
    .select("id, nome_completo, cpf, vinculo_instituicao, auth_user_id, conta_funcao, deletado")
    .eq("emp_proprietaria_id", TENANT)
    .ilike("email", c.email)
  falhar(c.email, error)

  console.log(`▸ ${c.email}`)
  if (cadastros.some((u) => u.conta_funcao)) {
    console.log("  já é conta de função — pulado\n")
    continue
  }
  const pessoas = cadastros.filter((u) => !u.deletado)
  if (pessoas.length !== 1) {
    console.log(`  ${pessoas.length} cadastros ativos com o e-mail — confira à mão, pulado\n`)
    continue
  }
  const p = pessoas[0]
  if (p.auth_user_id) {
    console.log(`  ${p.nome_completo} tem login com este e-mail — trocar o login é manual, pulado\n`)
    continue
  }
  console.log(`  pessoa: ${p.nome_completo}${p.cpf ? " (com CPF)" : " (sem CPF)"} — perde o e-mail`)
  if (!p.vinculo_instituicao) console.log(`  classificação: (nenhuma) → ${PRESTADOR}`)
  console.log(`  conta de função: ${c.nome}, com acesso sem permissões`)
  console.log(`  titular do posto: ${p.nome_completo} desde ${INICIO}\n`)
  if (!APLICAR) continue

  const agora = new Date().toISOString()
  const { error: e1 } = await db
    .from("usuarios")
    .update({
      email: null,
      ...(p.vinculo_instituicao ? {} : { vinculo_instituicao: PRESTADOR }),
      updated_at: agora,
    })
    .eq("id", p.id)
  falhar("liberar o e-mail da pessoa", e1)

  const { data: conta, error: e2 } = await db
    .from("usuarios")
    .insert({ nome_completo: c.nome, email: c.email, conta_funcao: true, emp_proprietaria_id: TENANT })
    .select("id")
    .single()
  falhar("criar a conta de função", e2)

  const { error: e3 } = await db.from("permissoes").insert({ usuario_id: conta.id, emp_proprietaria_id: TENANT })
  falhar("criar o acesso", e3)

  const { error: e4 } = await db.from("usuarios_ocupacoes").insert({
    emp_proprietaria_id: TENANT,
    conta_id: conta.id,
    pessoa_id: p.id,
    inicio: INICIO,
    motivo: "titular",
    observacao: "Migrado: o e-mail do posto estava no cadastro desta pessoa.",
  })
  falhar("registrar a titular", e4)
  criadas++
  console.log("  ✔ gravado\n")
}

console.log(APLICAR ? `${criadas} conta(s) de função criada(s).` : "Para gravar: node scripts/migrar-contas-funcao.mjs --apply")
