// ===========================================================================
// reidentificar-recebe.mjs — casa de novo, com o cadastro, os lançamentos
// de uma remessa que ficaram sem filiado.
//
// Por quê: até 09/09 o resolvedor da importação lia os vínculos da fonte
// sem paginar e o PostgREST cortava em 1.000 — fontes grandes (Petrobras,
// Petros) identificavam ~1,5% das linhas. Os valores estão certos; só o
// filiado_id ficou nulo. Este script refaz o casamento com a MESMA regra
// do app (src/lib/db/receitas.ts → resolverFiliadosLoteDetalhado):
//   CPF do lançamento → matrícula na fonte (sem zeros à esquerda), aprendida
//   dos vínculos da fonte, das linhas já identificadas da remessa e da
//   remessa vizinha do mesmo tipo (anterior; senão a seguinte).
// Nome não entra: a linha importada não guarda nome.
//
// Só toca linha com filiado_id NULO. Idempotente.
//
// USO:
//   node scripts/reidentificar-recebe.mjs --remessa <id>            (dry-run)
//   node scripts/reidentificar-recebe.mjs --remessa <id> --apply
//   node scripts/reidentificar-recebe.mjs --todas                   (todas as remessas do tenant)
//   ... --outras-fontes   também casa pela matrícula em vínculo de OUTRA fonte,
//                        quando ela aponta para UM único filiado. Caso típico:
//                        Petrobras ↔ Petros — o aposentado mantém a matrícula,
//                        e o vínculo Petrobras nunca foi registrado aqui.
// ===========================================================================

import { readFileSync } from "node:fs"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const TODAS = args.includes("--todas")
const OUTRAS_FONTES = args.includes("--outras-fontes")
const REMESSA = (() => { const i = args.indexOf("--remessa"); return i >= 0 ? args[i + 1] : null })()
if (!REMESSA && !TODAS) {
  console.error("Informe --remessa <id> ou --todas.")
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=")
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
  })
)
const { createClient } = await import("@supabase/supabase-js")
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
})

async function lotes(fazer, page = 1000) {
  const out = []
  for (let de = 0; ; de += page) {
    const { data, error } = await fazer(de, de + page - 1)
    if (error) throw new Error(error.message)
    out.push(...(data ?? []))
    if (!data || data.length < page) break
  }
  return out
}
const norm = (m) => (m ? String(m).replace(/\D/g, "").replace(/^0+/, "") : "")

const lancamentos = (remessaId) =>
  lotes((de, ate) =>
    db.from("filiacao_recebe")
      .select("id, fonte_pg_id, filiado_id, cpf, fonte_pg_matricula")
      .eq("remessa_id", remessaId)
      .order("remessa_id").order("id")
      .range(de, ate)
  )

async function remessaVizinha(remessa) {
  const q = (op, asc) =>
    db.from("filiacao_recebe_remessa").select("id, ordem, ano, mes")
      .eq("emp_proprietaria_id", remessa.emp_proprietaria_id).eq("tipo", remessa.tipo)
      [op]("ordem", remessa.ordem).order("ordem", { ascending: asc }).limit(1).maybeSingle()
  return (await q("lt", false)).data ?? (await q("gt", true)).data ?? null
}

const { data: remessas, error: eRem } = REMESSA
  ? await db.from("filiacao_recebe_remessa").select("*").eq("id", REMESSA)
  : await db.from("filiacao_recebe_remessa").select("*").order("ordem")
if (eRem) throw new Error(eRem.message)
if (!remessas?.length) { console.error("Remessa não encontrada."); process.exit(1) }

const nomesFonte = new Map()
async function nomeFonte(id) {
  if (!nomesFonte.has(id)) {
    const { data } = await db.from("empresa").select("nome_fantasia, nome_razao").eq("id", id).maybeSingle()
    nomesFonte.set(id, data?.nome_fantasia || data?.nome_razao || id)
  }
  return nomesFonte.get(id)
}

const cacheCpf = new Map()
async function porCpfDoTenant(empId) {
  if (!cacheCpf.has(empId)) {
    const fil = await lotes((de, ate) =>
      db.from("filiacoes").select("id, cpf").eq("emp_proprietaria_id", empId).order("id").range(de, ate)
    )
    const m = new Map()
    for (const f of fil) if (f.cpf && !m.has(f.cpf)) m.set(f.cpf, f.id)
    cacheCpf.set(empId, m)
  }
  return cacheCpf.get(empId)
}

// matrícula → filiado, quando um só, em vínculos de qualquer fonte (--outras-fontes)
const cacheGeral = new Map()
async function porMatriculaGeral(empId) {
  if (!cacheGeral.has(empId)) {
    const vinc = await lotes((de, ate) =>
      db.from("filiacao_vinculos").select("filiado_id, matricula, fonte_pg_matricula")
        .eq("emp_proprietaria_id", empId).not("filiado_id", "is", null).order("id").range(de, ate)
    )
    const m = new Map()
    for (const v of vinc) for (const x of [v.matricula, v.fonte_pg_matricula]) {
      const k = norm(x); if (!k) continue
      const atual = m.get(k)
      if (atual === undefined) m.set(k, v.filiado_id)
      else if (atual !== v.filiado_id) m.set(k, null) // ambígua: não casa
    }
    cacheGeral.set(empId, m)
  }
  return cacheGeral.get(empId)
}

let totalIdent = 0, totalPend = 0
for (const remessa of remessas) {
  const linhas = await lancamentos(remessa.id)
  const pendentes = linhas.filter((l) => !l.filiado_id)
  if (!pendentes.length) continue
  const vizinha = await remessaVizinha(remessa)
  const vizinhas = vizinha ? await lancamentos(vizinha.id) : []
  console.log(`\n=== ${remessa.tipo} ${remessa.mes}/${remessa.ano} (${remessa.id}) — ${linhas.length} linhas, ${pendentes.length} sem filiado; vizinha: ${vizinha ? `${vizinha.mes}/${vizinha.ano}` : "nenhuma"}`)
  const porCpf = await porCpfDoTenant(remessa.emp_proprietaria_id)

  for (const fonteId of [...new Set(pendentes.map((l) => l.fonte_pg_id))]) {
    const vinculos = await lotes((de, ate) =>
      db.from("filiacao_vinculos").select("filiado_id, matricula, fonte_pg_matricula")
        .eq("fonte_pagadora_id", fonteId).eq("emp_proprietaria_id", remessa.emp_proprietaria_id)
        .not("filiado_id", "is", null).order("id").range(de, ate)
    )
    const porMat = new Map()
    const aprender = (m, f) => { const k = norm(m); if (k && f && !porMat.has(k)) porMat.set(k, f) }
    for (const v of vinculos) { aprender(v.matricula, v.filiado_id); aprender(v.fonte_pg_matricula, v.filiado_id) }
    for (const l of [...linhas, ...vizinhas]) if (l.fonte_pg_id === fonteId) aprender(l.fonte_pg_matricula, l.filiado_id)

    const daFonte = pendentes.filter((l) => l.fonte_pg_id === fonteId)
    const geral = OUTRAS_FONTES ? await porMatriculaGeral(remessa.emp_proprietaria_id) : null
    const via = { cpf: 0, matricula: 0, outraFonte: 0 }
    const atualizar = []
    for (const l of daFonte) {
      const k = norm(l.fonte_pg_matricula)
      let f = null
      if (l.cpf && porCpf.has(l.cpf)) { f = porCpf.get(l.cpf); via.cpf++ }
      else if (porMat.has(k)) { f = porMat.get(k); via.matricula++ }
      else if (geral && k && geral.get(k)) { f = geral.get(k); via.outraFonte++ }
      if (f) atualizar.push({ id: l.id, filiado_id: f })
    }
    console.log(`  ${await nomeFonte(fonteId)}: ${daFonte.length} pendentes → identifica ${atualizar.length} (cpf ${via.cpf}, matrícula ${via.matricula}${OUTRAS_FONTES ? `, outra fonte ${via.outraFonte}` : ""}); ficam ${daFonte.length - atualizar.length}. Vínculos lidos: ${vinculos.length}`)
    totalIdent += atualizar.length; totalPend += daFonte.length

    if (APLICAR) {
      const CONC = 25
      for (let i = 0; i < atualizar.length; i += CONC) {
        const r = await Promise.all(
          atualizar.slice(i, i + CONC).map((a) =>
            db.from("filiacao_recebe").update({ filiado_id: a.filiado_id }).eq("id", a.id).is("filiado_id", null)
          )
        )
        const erro = r.find((x) => x.error)
        if (erro) throw new Error(`Falha ao gravar: ${erro.error.message}`)
        if ((i / CONC) % 40 === 0 && i) process.stdout.write(`    ${i}/${atualizar.length}\n`)
      }
    }
  }
}
console.log(`\n${APLICAR ? "GRAVADO" : "DRY-RUN"}: ${totalIdent} de ${totalPend} pendentes identificadas.`)
if (!APLICAR) console.log("Rode com --apply para gravar.")
