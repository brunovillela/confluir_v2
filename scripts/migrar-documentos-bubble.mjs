// ===========================================================================
// migrar-documentos-bubble.mjs — traz para o Storage do Supabase as fichas de
// filiação e cartas de desfiliação que ainda moram no CDN do Bubble.
// ---------------------------------------------------------------------------
// POR QUÊ
//   `filiacao_vinculos.ficha_filiacao` e `.carta_desfiliacao` vieram da
//   migração apontando para `//…cdn.bubble.io/…/F1.pdf`. São ARQUIVOS QUE NÃO
//   SÃO NOSSOS: enquanto o Bubble estiver no ar eles abrem; no dia em que for
//   desligado, a entidade perde milhares de documentos que julga ter.
//
// SEGURANÇA (leia antes de rodar)
//   • DRY-RUN por padrão: só relata. Passe --apply para gravar.
//   • Trava no TENANT REAL — não toca demo nem outros.
//   • A URL ORIGINAL do Bubble é preservada em `filiacao_ficha` /
//     `filiacao_desfiliacao_carta` (colunas legadas, hoje vazias). Nada de
//     ponteiro perdido: dá para conferir e até voltar atrás.
//   • IDEMPOTENTE: quem já foi migrado tem a coluna nova apontando para o
//     bucket e a legada com a URL antiga — o script pula.
//   • Só grava a coluna DEPOIS de o upload responder OK. Se o upload falhar, a
//     linha fica como estava, apontando para o Bubble.
//   • Identifica o formato pelos BYTES do arquivo (PDF, JPEG, PNG, ZIP) — nem
//     tudo que a secretaria guardou é PDF, e recusar o resto faria perder
//     justamente os documentos mais precários. Página de erro em HTML não vira
//     "documento".
//   • PAGINA de mil em mil: o PostgREST devolve no máximo 1000 linhas, e sem
//     isso uma corrida "completa" parava na milésima sem avisar.
//
// USO
//   node scripts/migrar-documentos-bubble.mjs                 (dry-run, tudo)
//   node scripts/migrar-documentos-bubble.mjs --limite 10     (dry-run, 10)
//   node scripts/migrar-documentos-bubble.mjs --limite 10 --apply
//   node scripts/migrar-documentos-bubble.mjs --apply         (tudo, grava)
//   node scripts/migrar-documentos-bubble.mjs --conferir      (audita o que já foi)
//
// RECOMENDADO: rode com --limite 10 --apply primeiro, confira na tela do
// vínculo que o PDF abre, e só então rode inteiro.
// ===========================================================================

import { createClient } from "@supabase/supabase-js"
import { randomUUID } from "node:crypto"
import { readFileSync } from "node:fs"

const TENANT_REAL = "c763cb99-edfd-4840-8453-ed3fcb66d4a1"
const BUCKET = "filiacao"
const LOTE = 25
const TENTATIVAS = 3

/** Os dois documentos, e onde a URL original vai descansar. */
const DOCUMENTOS = [
  {
    tipo: "ficha",
    colunaAtual: "ficha_filiacao",
    colunaOriginal: "filiacao_ficha",
  },
  {
    tipo: "carta",
    colunaAtual: "carta_desfiliacao",
    colunaOriginal: "filiacao_desfiliacao_carta",
  },
]

// ── Ambiente ────────────────────────────────────────────────────────────────

function lerEnv() {
  const texto = readFileSync(".env.local", "utf8")
  const env = {}
  for (const linha of texto.split(/\r?\n/)) {
    if (!linha.includes("=") || linha.trim().startsWith("#")) continue
    const i = linha.indexOf("=")
    env[linha.slice(0, i).trim()] = linha
      .slice(i + 1)
      .trim()
      .replace(/^"|"$/g, "")
  }
  return env
}

const env = lerEnv()
const supabase = createClient(
  env.NEXT_PUBLIC_SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
)

const args = process.argv.slice(2)
const APLICAR = args.includes("--apply")
const CONFERIR = args.includes("--conferir")
const LIMITE = (() => {
  const i = args.indexOf("--limite")
  if (i < 0) return null
  const n = Number(args[i + 1])
  return Number.isFinite(n) && n > 0 ? n : null
})()

// ── Auxiliares ──────────────────────────────────────────────────────────────

const ehUrlExterna = (v) =>
  typeof v === "string" && (v.startsWith("//") || /^https?:\/\//i.test(v))

const paraUrl = (v) => (v.startsWith("//") ? `https:${v}` : v)

/**
 * Que tipo de arquivo é isto, pelos primeiros bytes?
 *
 * Pelo conteúdo, e não pela extensão nem pelo cabeçalho do servidor: nem tudo
 * que a secretaria guardou é PDF — há ficha escaneada em JPEG, foto de
 * WhatsApp e até ZIP. São documentos legítimos, e recusá-los faria a entidade
 * perder justamente os que já estavam mais precários.
 */
function tipoDoArquivo(buf) {
  const m = buf.subarray(0, 8)
  if (m.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { ext: "pdf", mime: "application/pdf" }
  }
  if (m[0] === 0xff && m[1] === 0xd8 && m[2] === 0xff) {
    return { ext: "jpg", mime: "image/jpeg" }
  }
  if (m[0] === 0x89 && m.subarray(1, 4).toString("latin1") === "PNG") {
    return { ext: "png", mime: "image/png" }
  }
  if (m.subarray(0, 2).toString("latin1") === "PK") {
    return { ext: "zip", mime: "application/zip" }
  }
  return null
}

async function baixar(url) {
  let ultimoErro = null
  for (let t = 1; t <= TENTATIVAS; t++) {
    try {
      const r = await fetch(url)
      if (!r.ok) {
        ultimoErro = `HTTP ${r.status}`
        // 404 não melhora com insistência.
        if (r.status === 404 || r.status === 403) break
      } else {
        const buf = Buffer.from(await r.arrayBuffer())
        // O CDN pode devolver HTML de erro com status 200; olhar os bytes é o
        // que separa documento de página de erro.
        // Arquivo vazio do lado do Bubble: o documento nunca esteve lá de
        // verdade. Não é falha da migração, e insistir não traz nada.
        if (buf.length === 0) {
          return { erro: "arquivo VAZIO (0 bytes) no Bubble — nada a migrar" }
        }
        const tipo = tipoDoArquivo(buf)
        if (!tipo) {
          const inicio = buf.subarray(0, 40).toString("latin1").replace(/s+/g, " ")
          return { erro: `formato não reconhecido (começa com "${inicio}")` }
        }
        return { buf, tipo }
      }
    } catch (e) {
      ultimoErro = e.message
    }
    await new Promise((r) => setTimeout(r, 500 * t))
  }
  return { erro: ultimoErro ?? "falha ao baixar" }
}

// ── Conferência ─────────────────────────────────────────────────────────────

async function conferir() {
  console.log("Conferindo o estado dos documentos no tenant real...\n")
  for (const doc of DOCUMENTOS) {
    const contar = async (filtro) => {
      let q = supabase
        .from("filiacao_vinculos")
        .select("id", { count: "exact", head: true })
        .eq("emp_proprietaria_id", TENANT_REAL)
      q = filtro(q)
      const { count } = await q
      return count ?? 0
    }

    const noBubble = await contar((q) => q.like(doc.colunaAtual, "//%"))
    const migrados = await contar((q) =>
      q.not(doc.colunaOriginal, "is", null).not(doc.colunaAtual, "is", null)
    )
    const total = await contar((q) => q.not(doc.colunaAtual, "is", null))

    // Valor que não é endereço de arquivo: resíduo da migração. Em
    // carta_desfiliacao há DATAS em texto ("Jun 9, 2016 12:00 am") — um campo
    // do Bubble que caiu na coluna errada. Não é documento e não se migra.
    const { data: naoArquivos } = await supabase
      .from("filiacao_vinculos")
      .select(`id, ${doc.colunaAtual}`)
      .eq("emp_proprietaria_id", TENANT_REAL)
      .not(doc.colunaAtual, "is", null)
      .not(doc.colunaAtual, "like", "//%")
      .limit(2000)
    const lixo = (naoArquivos ?? []).filter(
      (l) => !String(l[doc.colunaAtual]).toLowerCase().endsWith(".pdf")
    )

    console.log(`${doc.tipo.toUpperCase()}`)
    console.log(`  com algum valor ........ ${total}`)
    console.log(`  ainda no Bubble ........ ${noBubble}`)
    console.log(`  já no nosso bucket ..... ${migrados}`)
    if (lixo.length > 0) {
      console.log(`  NÃO é arquivo .......... ${lixo.length}  (resíduo da migração)`)
      console.log(`     ex.: ${JSON.stringify(lixo[0][doc.colunaAtual]).slice(0, 60)}`)
    }

    // Prova real: o arquivo do bucket abre mesmo? Amostra de 3.
    const { data: amostra } = await supabase
      .from("filiacao_vinculos")
      .select(`id, ${doc.colunaAtual}`)
      .eq("emp_proprietaria_id", TENANT_REAL)
      .not(doc.colunaOriginal, "is", null)
      .limit(3)
    for (const linha of amostra ?? []) {
      const caminho = linha[doc.colunaAtual]
      if (!caminho || ehUrlExterna(caminho)) continue
      const { data: assinada } = await supabase.storage
        .from(BUCKET)
        .createSignedUrl(caminho, 60)
      if (!assinada?.signedUrl) {
        console.log(`  !! ${linha.id}: sem URL assinada`)
        continue
      }
      const r = await fetch(assinada.signedUrl, { method: "HEAD" })
      const bytes = Number(r.headers.get("content-length") ?? 0)
      console.log(
        `  amostra ${linha.id.slice(0, 8)}: ${r.ok ? `${bytes} bytes` : `HTTP ${r.status}`}`
      )
    }
    console.log()
  }
}

// ── Migração ────────────────────────────────────────────────────────────────

async function migrar() {
  console.log(
    APLICAR
      ? "MODO GRAVAÇÃO — os arquivos serão trazidos para o nosso bucket.\n"
      : "DRY-RUN — nada será gravado. Use --apply para efetivar.\n"
  )

  const resumo = { migrados: 0, pulados: 0, falhas: 0 }
  const falhas = []

  for (const doc of DOCUMENTOS) {
    // PostgREST devolve no MÁXIMO 1000 linhas por consulta. Sem paginar, uma
    // corrida "completa" migrava mil e parava calada, dando a impressão de ter
    // terminado. (Mesma armadilha já vista na conciliação da filiação
    // coletiva.)
    const linhas = []
    const PAGINA = 1000
    for (let de = 0; ; de += PAGINA) {
      const ate = de + PAGINA - 1
      const { data, error } = await supabase
        .from("filiacao_vinculos")
        .select(`id, filiado_id, ${doc.colunaAtual}, ${doc.colunaOriginal}`)
        .eq("emp_proprietaria_id", TENANT_REAL)
        .like(doc.colunaAtual, "//%")
        .order("id")
        .range(de, ate)
      if (error) {
        console.log(`Falha ao listar ${doc.tipo}: ${error.message}`)
        break
      }
      const pagina = data ?? []
      linhas.push(...pagina)
      if (pagina.length < PAGINA) break
      if (LIMITE && linhas.length >= LIMITE) break
    }
    if (LIMITE) linhas.length = Math.min(linhas.length, LIMITE)
    console.log(`${doc.tipo.toUpperCase()}: ${linhas.length} para migrar`)

    for (let i = 0; i < linhas.length; i += LOTE) {
      const lote = linhas.slice(i, i + LOTE)
      await Promise.all(
        lote.map(async (linha) => {
          const original = linha[doc.colunaAtual]

          // Já migrado (a legada guarda a URL antiga): não repete.
          if (linha[doc.colunaOriginal]) {
            resumo.pulados++
            return
          }

          const { buf, tipo, erro } = await baixar(paraUrl(original))
          if (!buf || !tipo) {
            resumo.falhas++
            falhas.push(`${doc.tipo} ${linha.id}: ${erro}`)
            return
          }

          if (!APLICAR) {
            resumo.migrados++
            return
          }

          const caminho = `vinculos/${linha.id}/${doc.tipo}-${randomUUID()}.${tipo.ext}`
          const { error: erroUpload } = await supabase.storage
            .from(BUCKET)
            .upload(caminho, buf, { contentType: tipo.mime })
          if (erroUpload) {
            resumo.falhas++
            falhas.push(`${doc.tipo} ${linha.id}: upload — ${erroUpload.message}`)
            return
          }

          // Só agora a linha muda: a coluna aponta para o nosso arquivo e a
          // URL do Bubble fica guardada na legada.
          const { error: erroUpdate } = await supabase
            .from("filiacao_vinculos")
            .update({
              [doc.colunaAtual]: caminho,
              [doc.colunaOriginal]: original,
            })
            .eq("id", linha.id)
          if (erroUpdate) {
            await supabase.storage.from(BUCKET).remove([caminho])
            resumo.falhas++
            falhas.push(`${doc.tipo} ${linha.id}: update — ${erroUpdate.message}`)
            return
          }

          resumo.migrados++
        })
      )
      const feitos = Math.min(i + LOTE, linhas.length)
      process.stdout.write(`  ${feitos}/${linhas.length}\r`)
    }
    console.log(`  ${linhas.length}/${linhas.length}`)
  }

  console.log("\n─────────────────────────────")
  console.log(APLICAR ? "migrados" : "migrariam", ":", resumo.migrados)
  console.log("pulados (já migrados):", resumo.pulados)
  console.log("falhas:", resumo.falhas)
  if (falhas.length > 0) {
    console.log("\nDetalhe das falhas (as linhas seguem apontando para o Bubble):")
    for (const f of falhas.slice(0, 40)) console.log("  " + f)
    if (falhas.length > 40) console.log(`  … e mais ${falhas.length - 40}`)
  }
  if (!APLICAR) {
    console.log("\nNada foi gravado. Rode de novo com --apply para efetivar.")
  }
}

// ── Início ──────────────────────────────────────────────────────────────────

if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_URL) {
  console.log("Faltam NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY no .env.local")
  process.exit(1)
}

await (CONFERIR ? conferir() : migrar())
