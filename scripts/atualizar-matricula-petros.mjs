// Troca, no vínculo com a Petros, a matrícula Petrobras (que veio do Bubble)
// pela matrícula PETROS, a partir de uma planilha da Petros
// (MATRICULA PETROBRAS;MATRICULA PETROS;NOME COMPLETO).
//
// Só mexe quando há certeza:
//   - a pessoa é achada pela matrícula Petrobras (em vínculo Petros ou
//     Petrobras) E o nome bate exatamente (sem acento/caixa);
//   - o vínculo Petros dela tem a matrícula vazia ou igual à Petrobras (se o
//     vínculo está duplicado com a mesma matrícula Petrobras, atualiza todos);
//   - depois da troca, a matrícula Petros não fica em vínculo de outra pessoa.
//     (A conferência é no resultado FINAL: a Petros e a Petrobras usam a mesma
//     faixa de números, e a matrícula Petros de um pode ser a Petrobras que
//     outro tem hoje — e que também será trocada.)
// O resto vai para o relatório, sem alteração. A matrícula Petrobras repete
// entre pensionistas do mesmo titular — por isso o nome é obrigatório.
//
//   node scripts/atualizar-matricula-petros.mjs "<planilha.csv>"            (simulação)
//   node scripts/atualizar-matricula-petros.mjs "<planilha.csv>" --apply   (grava e salva backup)
//   --semelhanca: aceita também nome ABREVIADO ou com erro de uma letra (ver
//   nomesSemelhantes) — primeiro e último nome iguais, os do meio casando por
//   inicial, por letra trocada ou só faltando no cadastro.
import { readFileSync, writeFileSync } from "node:fs"
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
const ARQUIVO = args.find((a) => !a.startsWith("--"))
const APLICAR = args.includes("--apply")
const SEMELHANCA = args.includes("--semelhanca")
const i = args.indexOf("--tenant")
const TENANT = i >= 0 ? args[i + 1] : "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const PETROS = "03aa46b8-9358-4667-8fe6-20fee7adf23c"
const PETROBRAS = "d06f9571-d558-41fa-96aa-c06e8005841b"
if (!ARQUIVO) {
  console.error('Uso: node scripts/atualizar-matricula-petros.mjs "<planilha.csv>" [--apply]')
  process.exit(1)
}

const mat = (v) => String(v ?? "").replace(/\D/g, "").replace(/^0+/, "")
const nomeNorm = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

const PARTICULAS = new Set(["DE", "DA", "DO", "DAS", "DOS", "E"])
// Uma letra trocada, sobrando ou faltando (LUIS/LUIZ, BARRETTO/BARRETO), em nomes de 4+ letras.
function umaLetra(a, b) {
  if (Math.abs(a.length - b.length) > 1 || Math.min(a.length, b.length) < 4) return false
  let k = 0
  while (k < a.length && a[k] === b[k]) k++
  const [x, y] = [a.slice(k), b.slice(k)]
  return x.slice(1) === y.slice(1) || x.slice(1) === y || x === y.slice(1)
}
const tokenCasa = (a, b) =>
  a === b || umaLetra(a, b) || (a.length === 1 && b.startsWith(a)) || (b.length === 1 && a.startsWith(b))

/**
 * Nome da planilha (completo) × nome do cadastro (às vezes abreviado).
 * Primeiro e último nome precisam casar; no meio, cada nome do cadastro casa,
 * em ordem, com um da planilha (igual, inicial, uma letra, ou "GDIAS" = G +
 * DIAS), e a planilha pode ter nomes do meio que o cadastro omitiu. Partículas
 * (de, da…) não contam.
 */
// Distância de edição com troca de letras vizinhas (Damerau).
function distancia(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)])
  for (let j = 1; j <= b.length; j++) d[0][j] = j
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  return d[a.length][b.length]
}
const SUFIXOS = { JR: "JUNIOR", FO: "FILHO" }

function nomesSemelhantes(planilha, cadastro) {
  const a = planilha.split(" ").filter((p) => !PARTICULAS.has(p))
  const b0 = cadastro
    .split(" ")
    .filter((p) => !PARTICULAS.has(p))
    .map((p) => SUFIXOS[p] ?? p)
  if (a.length < 2 || b0.length < 2) return false
  // Mesmos nomes, só com espaço ou até duas letras de diferença no total
  // (MONTE MOR/MONTEMOR, SANT ANNA/SANTANA, FERRERIA/FERREIRA, TORRES/TONES).
  const junto = (l) => l.join("")
  // …mas um sobrenome inteiro a mais ou a menos no fim ("SIQUEIRA" × "SIQUEIRA SA")
  // é outro caso (casamento), não abreviação.
  const sobrenomeAMais = junto(a.slice(0, -1)) === junto(b0) || junto(b0.slice(0, -1)) === junto(a)
  if (
    !sobrenomeAMais &&
    a[0] === b0[0] &&
    distancia(junto(a), junto(b0)) <= 2 &&
    Math.min(junto(a).length, junto(b0).length) >= 12
  )
    return true
  const b = []
  for (const p of b0) {
    // "GDIAS" → G + DIAS; "PC" → P + C (iniciais grudadas de nomes seguidos)
    const par = a.findIndex((x, k) => k + 1 < a.length && p === x[0] + a[k + 1])
    const iniciais = a.findIndex((x, k) => k + p.length <= a.length && p.length >= 2 && p.length <= 3 && p === a.slice(k, k + p.length).map((y) => y[0]).join(""))
    if (par >= 0 && p.length > 2) b.push(p[0], p.slice(1))
    else if (iniciais > 0 && !a.includes(p)) b.push(...p.split(""))
    else b.push(p)
  }
  if (a[0].length === 1 || b[0].length === 1) return false
  if (!tokenCasa(a[0], b[0]) || !tokenCasa(a.at(-1), b.at(-1))) return false
  let k = 1
  for (const p of b.slice(1, -1)) {
    while (k < a.length - 1 && !tokenCasa(a[k], p)) k++
    if (k >= a.length - 1) return false
    k++
  }
  return true
}

async function tudo(tabela, colunas, filtro = (q) => q) {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await filtro(db.from(tabela).select(colunas)).range(de, de + 999)
    if (error) throw new Error(`${tabela}: ${error.message}`)
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

const planilha = readFileSync(ARQUIVO, "latin1")
  .split(/\r?\n/)
  .filter((l) => l.trim())
  .slice(1)
  .map((l) => {
    const [petrobras, petros, nome] = l.split(";")
    return { petrobras: mat(petrobras), petros: mat(petros), nome: nome.trim(), nomeN: nomeNorm(nome) }
  })

console.log(APLICAR ? "APLICANDO" : "SIMULAÇÃO — nada será gravado", `· tenant ${TENANT} · ${planilha.length} linhas\n`)

const vinculos = await tudo(
  "filiacao_vinculos",
  "id, filiado_id, fonte_pagadora_id, matricula",
  (q) => q.eq("emp_proprietaria_id", TENANT).in("fonte_pagadora_id", [PETROS, PETROBRAS]).order("id")
)
const filiadoIds = [...new Set(vinculos.map((v) => v.filiado_id).filter(Boolean))]
const nomes = new Map()
for (let k = 0; k < filiadoIds.length; k += 200) {
  const { data, error } = await db
    .from("filiacoes")
    .select("id, nome_completo")
    .in("id", filiadoIds.slice(k, k + 200))
  if (error) throw new Error(`filiacoes: ${error.message}`)
  for (const f of data) nomes.set(f.id, f.nome_completo)
}

const porMatricula = new Map() // matrícula normalizada → vínculos (Petros e Petrobras)
for (const v of vinculos) {
  const m = mat(v.matricula)
  if (!m) continue
  const lista = porMatricula.get(m) ?? []
  lista.push(v)
  porMatricula.set(m, lista)
}
const petrosDoFiliado = new Map()
for (const v of vinculos.filter((x) => x.fonte_pagadora_id === PETROS)) {
  const lista = petrosDoFiliado.get(v.filiado_id) ?? []
  lista.push(v)
  petrosDoFiliado.set(v.filiado_id, lista)
}

const atualizar = []
const jaCorretas = []
const relatorio = {
  "nome diferente": [],
  "não encontrada": [],
  "mais de uma pessoa com o mesmo nome e matrícula": [],
  "sem vínculo Petros": [],
  "mais de um vínculo Petros com matrículas diferentes": [],
  "vínculo Petros com outra matrícula": [],
  "matrícula Petros ficaria com outra pessoa": [],
}
const duplicados = []

for (const r of planilha) {
  const candidatos = [
    ...(porMatricula.get(r.petrobras) ?? []),
    ...(porMatricula.get(r.petros) ?? []).filter((v) => v.fonte_pagadora_id === PETROS),
  ]
  const pessoas = [...new Set(candidatos.map((v) => v.filiado_id))]
  let mesmoNome = pessoas.filter((id) => nomeNorm(nomes.get(id)) === r.nomeN)
  let porSemelhanca = false
  if (mesmoNome.length === 0 && SEMELHANCA) {
    mesmoNome = pessoas.filter((id) => nomesSemelhantes(r.nomeN, nomeNorm(nomes.get(id))))
    porSemelhanca = mesmoNome.length > 0
  }
  if (pessoas.length === 0) {
    relatorio["não encontrada"].push(`${r.nome} (Petrobras ${r.petrobras}, Petros ${r.petros})`)
    continue
  }
  if (mesmoNome.length === 0) {
    relatorio["nome diferente"].push(
      `${r.nome} (Petrobras ${r.petrobras}) × no cadastro: ${pessoas.map((id) => nomes.get(id) ?? "(sem nome)").join(" | ")}`
    )
    continue
  }
  if (mesmoNome.length > 1) {
    relatorio["mais de uma pessoa com o mesmo nome e matrícula"].push(`${r.nome} (Petrobras ${r.petrobras}) · ${mesmoNome.length} cadastros`)
    continue
  }
  const filiado = mesmoNome[0]
  const petros = petrosDoFiliado.get(filiado) ?? []
  if (petros.some((v) => mat(v.matricula) === r.petros)) {
    jaCorretas.push(r.nome)
    continue
  }
  if (petros.length === 0) {
    relatorio["sem vínculo Petros"].push(`${r.nome} (Petrobras ${r.petrobras}, Petros ${r.petros})`)
    continue
  }
  // Vínculos Petros com a matrícula Petrobras desta linha (um, ou o mesmo
  // vínculo duplicado); sem nenhum, só o vínculo único com matrícula vazia.
  const comPetrobras = petros.filter((v) => mat(v.matricula) === r.petrobras)
  const alvos =
    comPetrobras.length > 0
      ? comPetrobras
      : petros.length === 1 && !mat(petros[0].matricula)
        ? petros
        : []
  if (alvos.length === 0) {
    const chave =
      petros.length > 1 ? "mais de um vínculo Petros com matrículas diferentes" : "vínculo Petros com outra matrícula"
    relatorio[chave].push(
      `${r.nome} · no cadastro: ${petros.map((v) => v.matricula ?? "(vazia)").join(", ")} · planilha: Petrobras ${r.petrobras}, Petros ${r.petros}`
    )
    continue
  }
  if (alvos.length > 1) duplicados.push(`${r.nome} · ${alvos.length} vínculos Petros iguais (${alvos.map((v) => v.matricula).join(", ")})`)
  for (const v of alvos) {
    atualizar.push({
      vinculoId: v.id,
      filiadoId: filiado,
      nome: r.nome,
      ...(porSemelhanca ? { nomeNoCadastro: nomes.get(filiado) } : {}),
      antes: v.matricula,
      depois: r.petros,
    })
  }
}

// Conferência no resultado FINAL: a matrícula Petros não pode ficar em
// vínculos Petros de pessoas diferentes.
const finalPorVinculo = new Map(
  vinculos.filter((v) => v.fonte_pagadora_id === PETROS).map((v) => [v.id, { filiado: v.filiado_id, m: mat(v.matricula) }])
)
for (const a of atualizar) finalPorVinculo.get(a.vinculoId).m = a.depois
const donosFinais = new Map()
for (const { filiado, m } of finalPorVinculo.values()) {
  if (!m) continue
  const s = donosFinais.get(m) ?? new Set()
  s.add(filiado)
  donosFinais.set(m, s)
}
// --desempate-pagante: tolera a repetição quando só esta pessoa pagou na
// última remessa Associativa da Petros — é assim que a importação desempata
// (resolverFiliadosLoteDetalhado prefere quem pagou na remessa anterior).
let pagantes = new Set()
if (args.includes("--desempate-pagante")) {
  const { data: rem } = await db
    .from("filiacao_recebe_remessa")
    .select("id")
    .eq("emp_proprietaria_id", TENANT)
    .eq("tipo", "Associativa")
    .order("ordem", { ascending: false, nullsFirst: false })
    .limit(1)
  const lanc = await tudo("filiacao_recebe", "filiado_id", (q) =>
    q.eq("remessa_id", rem[0].id).eq("fonte_pg_id", PETROS).order("id")
  )
  pagantes = new Set(lanc.map((l) => l.filiado_id).filter(Boolean))
}
const desempata = (a) =>
  pagantes.has(a.filiadoId) && [...donosFinais.get(a.depois)].every((id) => id === a.filiadoId || !pagantes.has(id))
const conflito = (a) => (donosFinais.get(a.depois)?.size ?? 0) > 1 && !desempata(a)
for (const a of atualizar.filter(conflito)) {
  const outros = [...donosFinais.get(a.depois)].filter((id) => id !== a.filiadoId)
  relatorio["matrícula Petros ficaria com outra pessoa"].push(
    `${a.nome} · Petros ${a.depois} · também em: ${outros.map((id) => nomes.get(id) ?? id).join(" | ")}`
  )
}
atualizar.splice(0, atualizar.length, ...atualizar.filter((a) => !conflito(a)))

console.log(`a atualizar (matrícula Petrobras → Petros): ${atualizar.length}`)
const exibir = SEMELHANCA ? atualizar : atualizar.slice(0, 5)
for (const a of exibir) {
  const semelhante = a.nomeNoCadastro ? ` ≈ ${a.nomeNoCadastro}` : ""
  console.log(`  ${a.nome}${semelhante}: ${a.antes ?? "(vazia)"} → ${a.depois}`)
}
if (exibir.length < atualizar.length) console.log(`  … e mais ${atualizar.length - exibir.length}`)
console.log(`já com a matrícula Petros certa: ${jaCorretas.length}`)
console.log(`(entre os atualizados, ${duplicados.length} pessoa(s) com o vínculo Petros duplicado — todos os iguais recebem a matrícula)`)
for (const [motivo, lista] of Object.entries(relatorio)) {
  console.log(`\n${motivo} — NÃO alterado (${lista.length}):`)
  for (const l of lista) console.log(`  ${l}`)
}

const saida = { geradoEm: new Date().toISOString(), atualizar, jaCorretas, duplicados, relatorio }
const base = ARQUIVO.replace(/\.csv$/i, "")
// Cada aplicação grava o seu próprio arquivo (com o "antes" para desfazer);
// uma simulação depois não o sobrescreve.
const carimbo = APLICAR ? ` - aplicado ${new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-")}` : ""
const arquivoSaida = `${base} - resultado${SEMELHANCA ? " (semelhanca)" : ""}${carimbo}.json`
writeFileSync(arquivoSaida, JSON.stringify(saida, null, 2))
console.log(`\nResultado completo em: ${arquivoSaida}`)

if (APLICAR) {
  let feitos = 0
  for (const a of atualizar) {
    let q = db.from("filiacao_vinculos").update({ matricula: a.depois }).eq("id", a.vinculoId)
    q = a.antes === null ? q.is("matricula", null) : q.eq("matricula", a.antes)
    const { error } = await q
    if (error) console.log("  ✘", a.nome, error.message)
    else feitos++
  }
  console.log(`\n${feitos} vínculo(s) atualizado(s). Para desfazer, o "antes" de cada um está em ${arquivoSaida}.`)
} else {
  console.log(`\nPara gravar: node scripts/atualizar-matricula-petros.mjs "${ARQUIVO}" --apply`)
}
