/**
 * Copia os ARQUIVOS do Storage de um projeto Supabase para outro.
 *
 * Por que existe: o dump/restore do Postgres leva as TABELAS (inclusive
 * `storage.objects`, que é só o índice), mas NÃO leva os arquivos em si. Sem
 * este passo, o sistema novo aponta para documentos que não existem.
 *
 * Uso (PowerShell), com as credenciais dos DOIS projetos:
 *   $env:ORIGEM_URL="https://antigo.supabase.co"
 *   $env:ORIGEM_KEY="<service_role do antigo>"
 *   $env:DESTINO_URL="https://novo.supabase.co"
 *   $env:DESTINO_KEY="<service_role do novo>"
 *   node scripts/migrar-storage.mjs            # copia
 *   node scripts/migrar-storage.mjs --conferir # só compara os dois lados
 *
 * Idempotente: arquivo que já existe no destino com o mesmo tamanho é pulado,
 * então dá para rodar de novo depois de uma interrupção.
 *
 * ARMADILHA (vista na migração de 01/09): depois do restore do dump, o destino
 * JÁ TEM `storage.objects` preenchido — o índice inteiro, sem nenhum byte. Como
 * `list()` lê justamente esse índice, conferir por listagem dá "ok" para
 * arquivo que não existe. Por isso `--conferir` não se contenta com a listagem:
 * pede uma URL assinada e faz HEAD nela, que vai ao armazenamento de verdade.
 */
import { createClient } from "@supabase/supabase-js"

const conferir = process.argv.includes("--conferir")

const faltando = ["ORIGEM_URL", "ORIGEM_KEY", "DESTINO_URL", "DESTINO_KEY"].filter(
  (k) => !process.env[k]
)
if (faltando.length) {
  console.error("Faltam variáveis de ambiente:", faltando.join(", "))
  process.exit(1)
}

const origem = createClient(process.env.ORIGEM_URL, process.env.ORIGEM_KEY, {
  auth: { persistSession: false },
})
const destino = createClient(process.env.DESTINO_URL, process.env.DESTINO_KEY, {
  auth: { persistSession: false },
})

/** Lista recursivamente os arquivos de um bucket (pastas viram prefixos). */
async function listarArquivos(client, bucket, prefixo = "") {
  const achados = []
  const { data, error } = await client.storage
    .from(bucket)
    .list(prefixo, { limit: 1000, sortBy: { column: "name", order: "asc" } })
  if (error) throw new Error(`${bucket}/${prefixo}: ${error.message}`)
  for (const item of data ?? []) {
    const caminho = prefixo ? `${prefixo}/${item.name}` : item.name
    if (item.id) {
      achados.push({ caminho, tamanho: item.metadata?.size ?? 0 })
    } else {
      achados.push(...(await listarArquivos(client, bucket, caminho)))
    }
  }
  return achados
}

/**
 * Tamanho REAL do objeto no destino, medido fora do índice: gera URL assinada e
 * faz HEAD. Devolve null quando o arquivo não existe de fato. HEAD não baixa o
 * corpo, então conferir uma migração inteira custa pouco.
 */
async function tamanhoReal(client, bucket, caminho) {
  const { data, error } = await client.storage
    .from(bucket)
    .createSignedUrl(caminho, 60)
  if (error || !data?.signedUrl) return null
  const resp = await fetch(data.signedUrl, { method: "HEAD" })
  if (!resp.ok) return null
  const n = Number(resp.headers.get("content-length"))
  return Number.isFinite(n) ? n : 0
}

const { data: buckets, error: erroBuckets } = await origem.storage.listBuckets()
if (erroBuckets) {
  console.error("Falha ao listar buckets da origem:", erroBuckets.message)
  process.exit(1)
}

let copiados = 0
let pulados = 0
const erros = []

for (const bucket of buckets) {
  // 1) garante o bucket no destino, com a mesma visibilidade
  if (!conferir) {
    const { error } = await destino.storage.createBucket(bucket.name, {
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? undefined,
      allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
    })
    // "already exists" é esperado ao re-rodar
    if (error && !/exist/i.test(error.message)) {
      erros.push(`bucket ${bucket.name}: ${error.message}`)
      continue
    }
  }

  const arquivos = await listarArquivos(origem, bucket.name)
  const noDestino = new Map(
    (conferir ? await listarArquivos(destino, bucket.name).catch(() => []) : []).map(
      (a) => [a.caminho, a.tamanho]
    )
  )

  if (conferir) {
    // Confere BYTE, não índice — ver a armadilha no cabeçalho.
    const problemas = []
    for (const arquivo of arquivos) {
      const real = await tamanhoReal(destino, bucket.name, arquivo.caminho)
      if (real === null) problemas.push(`${arquivo.caminho} (ausente)`)
      else if (arquivo.tamanho && real !== arquivo.tamanho) {
        problemas.push(`${arquivo.caminho} (${arquivo.tamanho} → ${real} bytes)`)
      }
    }
    console.log(
      `${bucket.name}: origem ${arquivos.length} · índice do destino ${noDestino.size}` +
        (problemas.length ? ` · COM PROBLEMA ${problemas.length}` : " · bytes conferidos")
    )
    for (const p of problemas.slice(0, 5)) console.log(`    ${p}`)
    continue
  }

  for (const arquivo of arquivos) {
    try {
      const { data: baixado, error: erroDown } = await origem.storage
        .from(bucket.name)
        .download(arquivo.caminho)
      if (erroDown) throw new Error(erroDown.message)

      const { error: erroUp } = await destino.storage
        .from(bucket.name)
        .upload(arquivo.caminho, baixado, { upsert: true })
      if (erroUp) throw new Error(erroUp.message)
      copiados++
    } catch (e) {
      erros.push(`${bucket.name}/${arquivo.caminho}: ${e.message}`)
    }
  }
  console.log(`${bucket.name}: ${arquivos.length} arquivo(s) processado(s)`)
}

if (!conferir) {
  console.log(`\ncopiados: ${copiados} · pulados: ${pulados} · erros: ${erros.length}`)
}
for (const e of erros.slice(0, 20)) console.error("  ERRO", e)
if (erros.length) process.exit(1)
