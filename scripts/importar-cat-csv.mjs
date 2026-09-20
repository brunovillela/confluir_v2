// ===========================================================================
// importar-cat-csv.mjs — CATs de uma planilha para saude_cat (módulo Saúde).
//
// A importação do painel (src/app/painel/saude/cat/actions.ts) é tudo-ou-nada:
// um único número de CAT já existente recusa o arquivo inteiro. A planilha do
// "Registro automático de CAT recebidas" é cumulativa — a cada leva repete o
// que já veio —, então aqui cada linha é CLASSIFICADA com a regra do app
// (classificarContra, em src/lib/db/cat-duplicidades.ts) e só entram as que
// não estão na base:
//
//   nova                 → entra
//   atualizacao          → entra, com cat_origem_id apontando para a origem
//   duplicada            → fica de fora (mesmo número já lançado)
//   possivel_duplicada   → fica de fora; --duvidosas inclui
//
// A conversão dos campos usa as MESMAS funções da importação do painel
// (src/lib/saude-campos.ts + saude-normalizacao.ts), para que registro novo
// entre igual aos que já estão lá: datas em ISO, nomes em Título, códigos
// oficiais separados da descrição, descricao_truncada para a fila de revisão.
//
// Antes disso, uma limpeza dos vícios DESTA planilha (ela junta CATs de várias
// origens, cada uma com seu formato) reescreve o texto bruto no dialeto que o
// app entende — sem inventar valor nenhum:
//
//   DATAS      três formatos na mesma coluna: ISO, "28-11-2025" (dia-mês) e
//              barra. A barra é ambígua e aparece nas duas ordens: nas linhas
//              que só têm barra ela é americana (MM/DD/AAAA — "09/25/2025");
//              nas linhas que também têm ISO ou traço ela é brasileira
//              ("27/10/2025" ao lado de 2025-10-27). Quando algum componente
//              passa de 12, ele decide sozinho. Conferido no arquivo de
//              19/09/2026: 80 linhas com prova, nenhuma contradição.
//   ENUMERAÇÃO "1 - Inicial" → "Inicial" nos campos de lista (2, 3, 14, 15,
//              17, 22, 25, 33), como está o resto da base.
//   SIM/NÃO    "yes"/"no"/"NÂO" (sem til) → o vocabulário que booleano() lê.
//   CID        "A09 - Diarréia e gastroenterite..." → "A09".
//
// Nunca apaga e nunca altera registro existente.
//
// USO:
//   node scripts/importar-cat-csv.mjs "<arquivo.csv>"             (dry-run)
//   node scripts/importar-cat-csv.mjs "<arquivo.csv>" --apply
//   ... --duvidosas    inclui também as "possível duplicidade"
//   ... --csv <saida>  grava a classificação linha a linha para conferência
// ===========================================================================

import { readFileSync, writeFileSync } from "node:fs"
import { createRequire } from "node:module"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const COM_DUVIDOSAS = args.includes("--duvidosas")
const SAIDA_CSV = (() => { const i = args.indexOf("--csv"); return i >= 0 ? args[i + 1] : null })()
const ARQUIVO = args.find((a, i) => !a.startsWith("--") && args[i - 1] !== "--csv")
const TENANT = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"

if (!ARQUIVO) {
  console.error('USO: node scripts/importar-cat-csv.mjs "<arquivo.csv>" [--apply] [--duvidosas] [--csv saida.csv]')
  process.exit(1)
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => {
    const i = l.indexOf("=")
    return [l.slice(0, i).trim(), l.slice(i + 1).trim().replace(/^["']|["']$/g, "")]
  })
)
const req = createRequire(join(process.cwd(), "package.json"))
const { createClient } = req("@supabase/supabase-js")
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })

// As regras do app, carregadas do TypeScript (alias @/ → src/). O módulo de
// duplicidades é "server-only"; fora do Next esse import precisa de um vazio.
const jiti = req("jiti").createJiti(import.meta.url, {
  alias: {
    "@/": join(process.cwd(), "src") + "/",
    "server-only": fileURLToPath(new URL("./vazio.mjs", import.meta.url)),
  },
})
const src = (p) => jiti.import(join(process.cwd(), "src", p))
const { acharCampo, valorParaColunas, CAMPOS_COM_CODIGO_OFICIAL, CAMPOS_CAT } = await src("lib/saude-campos.ts")
const { parseCsv, decodificarCsv } = await src("lib/csv.ts")
const { classificarContra } = await src("lib/db/cat-duplicidades.ts")

console.log(APLICAR ? "MODO APLICAR — vai gravar." : "DRY-RUN — nada será gravado.")

// ── leitura da planilha ────────────────────────────────────────────────────

const bytes = readFileSync(ARQUIVO)
const linhas = parseCsv(decodificarCsv(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)))
if (linhas.length < 2) throw new Error("Arquivo vazio (esperava cabeçalho + registros).")

const mapa = new Map()
const ignorados = []
for (const [i, bruto] of linhas[0].entries()) {
  const campo = acharCampo(bruto)
  if (campo && ![...mapa.values()].some((c) => c.n === campo.n)) mapa.set(i, campo)
  else if (bruto?.trim()) ignorados.push(bruto.trim())
}
if (![...mapa.values()].some((c) => c.n === 11) || ![...mapa.values()].some((c) => c.n === 19)) {
  throw new Error("Faltam as colunas 11 (nome do acidentado) e/ou 19 (data do acidente).")
}
console.log(`Colunas reconhecidas: ${mapa.size} de ${CAMPOS_CAT.length}${ignorados.length ? ` — cabeçalhos ignorados: ${ignorados.join(", ")}` : ""}`)

// ── limpeza dos vícios da planilha ─────────────────────────────────────────

const CAMPOS_ENUMERADOS = [2, 3, 14, 15, 17, 22, 25, 33]
const CAMPOS_DATA = [...mapa.values()].filter((c) => c.tipo === "data").map((c) => c.n)

/** Ordem das datas em barra desta linha: ver o cabeçalho do arquivo. */
function ordemDaLinha(valores) {
  let temIsoOuTraco = false
  for (const [i, campo] of mapa) {
    if (campo.tipo !== "data") continue
    const v = (valores[i] ?? "").trim()
    if (/^\d{4}-\d{1,2}-\d{1,2}/.test(v) || /^\d{1,2}-\d{1,2}-\d{4}$/.test(v)) temIsoOuTraco = true
    const m = /^(\d{1,2})\/(\d{1,2})\/\d{4}$/.exec(v)
    if (m && +m[1] > 12) return "dia-mes"
    if (m && +m[2] > 12) return "mes-dia"
  }
  return temIsoOuTraco ? "dia-mes" : "mes-dia"
}

/** Data da planilha → ISO. Valor que não se encaixa volta como veio (o
 *  normalizador do app o recusa, e a linha aparece no relatório). */
function dataIso(v, ordem) {
  const t = (v ?? "").trim()
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:\D|$)/.exec(t)
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`
  const m = /^(\d{1,2})([/-])(\d{1,2})[/-](\d{4})$/.exec(t)
  if (!m) return t
  const [, a, sep, b2, ano] = m
  // Traço é sempre dia-mês nesta planilha; barra segue a ordem da linha.
  const diaPrimeiro = sep === "-" ? true : +a > 12 ? true : +b2 > 12 ? false : ordem === "dia-mes"
  const dia = diaPrimeiro ? a : b2
  const mes = diaPrimeiro ? b2 : a
  return `${dia.padStart(2, "0")}/${mes.padStart(2, "0")}/${ano}` // DD/MM/AAAA: o que data() espera
}

const SIM_NAO = new Map([["yes", "sim"], ["y", "sim"], ["no", "não"], ["nâo", "não"], ["nao", "não"]])

/** Reescreve a célula bruta no dialeto do app. */
function limpar(campo, bruto, ordem) {
  let v = (bruto ?? "").trim()
  if (!v) return v
  if (campo.tipo === "data") return dataIso(v, ordem)
  if (campo.tipo === "bool") return SIM_NAO.get(v.toLowerCase()) ?? v
  // "1 - Inicial", "M - Masculino", "F -feminino" → só a descrição.
  if (CAMPOS_ENUMERADOS.includes(campo.n)) v = v.replace(/^(?:\d{1,2}|[A-Za-z])\s*-\s*/, "")
  if (campo.tipo === "cid") {
    // "A09 - Diarréia", "S610 - FERIMENTO DE DEDO(S)", "S61.1 FERIMENTO DE
    // DEDO(S)" → só o código; "S92,5" → S92.5 (vírgula por ponto).
    const m = /^([A-Za-z]\d{2}(?:[.,\-\s]?\d)?)(?:\s*[-–]\s*|\s+)[A-Za-zÀ-ÿ]/.exec(v)
    if (m) v = m[1]
    v = v.replace(/^([A-Za-z]\d{2}),(\d)$/, "$1.$2")
  }
  return v
}

/** Fila de revisão: descrição do campo oficial sem o código. */
const marcarTruncada = (r) => ({
  ...r,
  descricao_truncada: CAMPOS_CAT.filter((c) => CAMPOS_COM_CODIGO_OFICIAL.includes(c.n)).some(
    (c) => c.colunaCodigo && typeof r[c.coluna] === "string" && r[c.coluna].trim() !== "" && !r[c.colunaCodigo]
  ),
})

const doArquivo = []
const descartadas = []
const datasRecusadas = []
const ordens = { "dia-mes": 0, "mes-dia": 0 }
for (let l = 1; l < linhas.length; l++) {
  const valores = linhas[l]
  const naPlanilha = l + 1
  const ordem = ordemDaLinha(valores)
  ordens[ordem]++
  let registro = {}
  for (const [i, campo] of mapa) {
    let limpo = limpar(campo, valores[i] ?? "", ordem)
    // Ano digitado errado na planilha ("0206-07-12"): o normalizador aceita,
    // porque é data válida. Melhor campo vazio do que século errado.
    const ano = campo.tipo === "data" && /(\d{4})/.exec(limpo)?.[1]
    if (ano && (+ano < 1900 || +ano > new Date().getFullYear() + 1)) {
      datasRecusadas.push(`linha ${naPlanilha} campo ${campo.n} (${campo.rotulo}): "${valores[i]}" — ano fora de faixa`)
      limpo = ""
    }
    const colunas = valorParaColunas(campo, limpo)
    // Data que a planilha traz mas o app recusa: some em silêncio se não for
    // avisada aqui (só a do campo 19 derruba a linha).
    if (campo.tipo === "data" && limpo && colunas[campo.coluna] === null) {
      datasRecusadas.push(`linha ${naPlanilha} campo ${campo.n} (${campo.rotulo}): "${valores[i]}"`)
    }
    registro = { ...registro, ...colunas }
  }
  if (!registro.trabalhador_nome) { descartadas.push(`linha ${naPlanilha}: sem nome do acidentado`); continue }
  if (!registro.data_acidente) { descartadas.push(`linha ${naPlanilha}: sem data do acidente válida`); continue }
  doArquivo.push({ naPlanilha, registro: marcarTruncada(registro) })
}
console.log(`Datas: ${ordens["dia-mes"]} linhas em dia-mês, ${ordens["mes-dia"]} em mês-dia (americano)${CAMPOS_DATA.length ? ` — campos ${CAMPOS_DATA.join(", ")}` : ""}`)
if (datasRecusadas.length) console.log(`Datas fora de qualquer formato (campo fica vazio): ${datasRecusadas.length}\n${datasRecusadas.map((d) => "  " + d).join("\n")}`)

// ── base atual ─────────────────────────────────────────────────────────────

process.stdout.write("Lendo saude_cat... ")
const base = []
for (let de = 0; ; de += 1000) {
  const { data, error } = await db.from("saude_cat")
    .select("id,numero_cat,tipo_cat,recibo_esocial,trabalhador_nome,trabalhador_cpf,data_acidente,houve_morte,data_obito,cid10,empregador_razao_social,created_at,cat_origem_id")
    .eq("emp_proprietaria_id", TENANT).is("duplicada_de_id", null)
    .order("id", { ascending: true }).range(de, de + 999)
  if (error) throw new Error(`saude_cat: ${error.message}`)
  base.push(...data)
  if (data.length < 1000) break
}
console.log(`${base.length} CATs.`)

// Formato que o classificador espera (o mesmo `resumo` de catsDaBase).
const cats = base.map((l) => ({
  id: l.id, numero: l.numero_cat, tipo: l.tipo_cat, recibo: l.recibo_esocial,
  nome: l.trabalhador_nome, cpf: l.trabalhador_cpf, dataAcidente: l.data_acidente,
  houveMorte: l.houve_morte, dataObito: l.data_obito, cid: l.cid10,
  empregador: l.empregador_razao_social, criadoEm: l.created_at, origemId: l.cat_origem_id,
}))

// ── classificação ──────────────────────────────────────────────────────────

const porClasse = { nova: [], atualizacao: [], duplicada: [], possivel_duplicada: [] }
const repetidasNoArquivo = []
const vistos = new Map()
const entra = []

let camposCompletados = 0
for (const item of doArquivo) {
  const r = item.registro
  // Duas linhas com o mesmo número na mesma planilha: é a MESMA CAT vinda de
  // duas fontes (eSocial e CatWeb), com diferenças de grafia. Vale a primeira;
  // da segunda só entram os campos que faltam na primeira — nunca sobrepõe.
  const chave = (r.numero_cat ?? "").replace(/\D/g, "")
  if (chave) {
    const antes = vistos.get(chave)
    if (antes) {
      const primeira = doArquivo.find((i) => i.naPlanilha === antes)
      let completados = 0
      for (const [k, v] of Object.entries(r)) {
        if (v === null || v === undefined || v === "" || k === "descricao_truncada") continue
        const atual = primeira.registro[k]
        if (atual === null || atual === undefined || atual === "") { primeira.registro[k] = v; completados++ }
      }
      if (completados) primeira.registro = marcarTruncada(primeira.registro)
      camposCompletados += completados
      repetidasNoArquivo.push(`${r.numero_cat} (linhas ${antes} e ${item.naPlanilha})${completados ? ` — ${completados} campos completados` : ""}`)
      continue
    }
    vistos.set(chave, item.naPlanilha)
  }

  item.classificacao = classificarContra(cats, r)
  porClasse[item.classificacao.classe].push(item)

  const aceita =
    item.classificacao.classe === "nova" ||
    item.classificacao.classe === "atualizacao" ||
    (COM_DUVIDOSAS && item.classificacao.classe === "possivel_duplicada")
  if (!aceita) continue

  entra.push(item)
  // As próximas linhas já enxergam esta: a planilha pode trazer a CAT
  // inicial e a reabertura na mesma leva.
  cats.push({
    id: `novo:${item.naPlanilha}`, numero: r.numero_cat ?? null, tipo: r.tipo_cat ?? null,
    recibo: r.recibo_esocial ?? null, nome: r.trabalhador_nome ?? null, cpf: r.trabalhador_cpf ?? null,
    dataAcidente: r.data_acidente ?? null, houveMorte: r.houve_morte ?? null, dataObito: r.data_obito ?? null,
    cid: r.cid10 ?? null, empregador: r.empregador_razao_social ?? null,
    criadoEm: new Date().toISOString(), origemId: null,
  })
}

// ── relatório ──────────────────────────────────────────────────────────────

const fmt = (i) =>
  `  linha ${i.naPlanilha}: ${i.registro.numero_cat ?? "(sem número)"} — ${i.registro.trabalhador_nome} — ${i.registro.data_acidente}` +
  (i.classificacao?.motivo && i.classificacao.classe !== "nova" ? `\n      ${i.classificacao.motivo}` : "")
const amostra = (lista, n = 10) => lista.slice(0, n).map(fmt).join("\n") + (lista.length > n ? `\n  (+${lista.length - n})` : "")

console.log(`\nPlanilha: ${doArquivo.length} linhas válidas${descartadas.length ? `, ${descartadas.length} descartadas` : ""}`)
if (descartadas.length) console.log(descartadas.slice(0, 10).map((d) => "  " + d).join("\n") + (descartadas.length > 10 ? `\n  (+${descartadas.length - 10})` : ""))
if (repetidasNoArquivo.length) console.log(`\nRepetidas dentro da planilha (vale a 1ª; ${camposCompletados} campos vazios completados pela 2ª): ${repetidasNoArquivo.length}\n${repetidasNoArquivo.slice(0, 10).map((d) => "  " + d).join("\n")}`)

console.log(`\nJá lançadas (mesmo número na base): ${porClasse.duplicada.length}`)
console.log(`Atualizações de CAT existente: ${porClasse.atualizacao.length}`)
if (porClasse.atualizacao.length) console.log(amostra(porClasse.atualizacao))
console.log(`Possível duplicidade (mesmo acidentado e data, número diferente): ${porClasse.possivel_duplicada.length}${COM_DUVIDOSAS ? " — INCLUÍDAS (--duvidosas)" : " — fora; --duvidosas inclui"}`)
if (porClasse.possivel_duplicada.length) console.log(amostra(porClasse.possivel_duplicada))
console.log(`Novas: ${porClasse.nova.length}`)
if (porClasse.nova.length) console.log(amostra(porClasse.nova, 5))
console.log(`\nA INSERIR: ${entra.length}`)

// Conferência das datas convertidas: o erro de ordem (dia×mês) não some, só
// muda de lugar — aparece como acidente no futuro, atendimento antes do
// acidente, nascimento depois do acidente.
const hoje = new Date().toISOString().slice(0, 10)
const suspeitas = []
for (const i of entra) {
  const r = i.registro
  const p = (rotulo, cond) => { if (cond) suspeitas.push(`  linha ${i.naPlanilha}: ${rotulo} — acidente ${r.data_acidente}, nasc. ${r.trabalhador_nascimento ?? "-"}, atend. ${r.data_atendimento ?? "-"}, receb. ${r.data_recebimento ?? "-"}`) }
  p("acidente no futuro", r.data_acidente > hoje)
  p("acidente antes de 1990", r.data_acidente < "1990-01-01")
  p("atendimento antes do acidente", r.data_atendimento && r.data_atendimento < r.data_acidente)
  p("recebimento antes do acidente", r.data_recebimento && r.data_recebimento < r.data_acidente)
  p("nascimento depois do acidente", r.trabalhador_nascimento && r.trabalhador_nascimento > r.data_acidente)
}
const datas = entra.map((i) => i.registro.data_acidente).sort()
console.log(`Acidentes de ${datas[0]} a ${datas.at(-1)}`)
console.log(`Datas suspeitas: ${suspeitas.length}`)
if (suspeitas.length) console.log(suspeitas.slice(0, 15).join("\n") + (suspeitas.length > 15 ? `\n  (+${suspeitas.length - 15})` : ""))

const avisos = entra.flatMap((i) => i.classificacao.avisos.map((a) => `  linha ${i.naPlanilha}: ${a}`))
if (avisos.length) console.log(`\nAvisos:\n${avisos.slice(0, 15).join("\n")}${avisos.length > 15 ? `\n  (+${avisos.length - 15})` : ""}`)

if (SAIDA_CSV) {
  const campo = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`
  const linhasCsv = [["linha", "classe", "motivo", "numero_cat", "acidentado", "data_acidente", "entra"].join(",")]
  for (const i of doArquivo) {
    if (!i.classificacao) continue
    linhasCsv.push([i.naPlanilha, i.classificacao.classe, campo(i.classificacao.motivo), campo(i.registro.numero_cat),
      campo(i.registro.trabalhador_nome), i.registro.data_acidente, entra.includes(i) ? "sim" : "nao"].join(","))
  }
  writeFileSync(SAIDA_CSV, "﻿" + linhasCsv.join("\r\n"), "utf8")
  console.log(`\nClassificação linha a linha em ${SAIDA_CSV}`)
}

if (!APLICAR) { console.log("\nDRY-RUN — nada foi gravado. Rode de novo com --apply."); process.exit(0) }
if (entra.length === 0) { console.log("\nNada a inserir."); process.exit(0) }

// ── gravação ───────────────────────────────────────────────────────────────

const paraGravar = entra.map((i) => ({
  ...i.registro,
  emp_proprietaria_id: TENANT,
  // origemId "novo:<linha>" é de CAT que ainda nem foi inserida: fica sem
  // origem em vez de apontar para um id inventado.
  ...(i.classificacao.origemId && !String(i.classificacao.origemId).startsWith("novo:")
    ? { cat_origem_id: i.classificacao.origemId }
    : {}),
}))

let gravados = 0
for (let i = 0; i < paraGravar.length; i += 500) {
  const { data, error } = await db.from("saude_cat").insert(paraGravar.slice(i, i + 500)).select("id")
  if (error) { console.error(`\nFalha no bloco a partir da ${i + 1}: ${error.message}. As ${gravados} já gravadas ficam.`); process.exit(1) }
  gravados += data.length
  process.stdout.write(`\rGravando... ${gravados}/${paraGravar.length}`)
}
console.log(`\nInseridas ${gravados} CATs. A varredura de duplicidades do painel tem cache de 10 min.`)
