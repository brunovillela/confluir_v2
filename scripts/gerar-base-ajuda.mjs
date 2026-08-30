// Gera src/lib/ajuda/base-conhecimento.ts a partir dos MDX do manual (texto puro),
// para a IA de ajuda usar como base de conhecimento (bundle confiável na Vercel).
// USO: node scripts/gerar-base-ajuda.mjs   (re-rode quando o manual mudar)
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { join } from "node:path"

const RAIZ = "src/conteudo/ajuda"

function listarMdx(dir) {
  const out = []
  for (const nome of readdirSync(dir)) {
    const p = join(dir, nome)
    if (statSync(p).isDirectory()) out.push(...listarMdx(p))
    else if (nome.endsWith(".mdx")) out.push(p)
  }
  return out
}

function limpar(mdx) {
  let t = mdx
  t = t.replace(/^import .*$/gm, "")
  t = t.replace(/^export .*$/gm, "")
  // preserva títulos/rótulos de componentes (Passo/Aviso/etc.)
  t = t.replace(/<[A-Za-z][^>]*?\btitulo="([^"]+)"[^>]*>/g, "\n$1: ")
  t = t.replace(/<[A-Za-z][^>]*?\brotulo="([^"]+)"[^>]*>/g, "\n$1: ")
  // demais componentes: descarta o resto das props JSX
  t = t.replace(/<[^>]+>/g, " ")
  t = t.replace(/\{[^}]*\}/g, " ") // expressões JSX residuais
  t = t.replace(/[#*`>]/g, "")
  t = t.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // links markdown → texto
  t = t.replace(/[ \t]+/g, " ")
  t = t.replace(/\n{3,}/g, "\n\n")
  return t.trim()
}

const artigos = []
for (const arq of listarMdx(RAIZ)) {
  const partes = arq.split(/[\\/]+/)
  const slug = partes[partes.length - 1].replace(/\.mdx$/, "")
  const area = partes[partes.length - 2]
  const texto = limpar(readFileSync(arq, "utf8"))
  if (texto) artigos.push({ area, slug, texto })
}
artigos.sort((a, b) => (a.area + a.slug).localeCompare(b.area + b.slug, "pt-BR"))

const cabecalho =
  "// GERADO por scripts/gerar-base-ajuda.mjs — NÃO edite à mão.\n" +
  "// Re-rode o script quando o manual (src/conteudo/ajuda) mudar.\n\n" +
  "export type ArtigoBase = { area: string; slug: string; texto: string }\n\n" +
  "export const BASE_AJUDA: ArtigoBase[] = " +
  JSON.stringify(artigos, null, 2) +
  "\n"
writeFileSync("src/lib/ajuda/base-conhecimento.ts", cabecalho)
const chars = artigos.reduce((s, a) => s + a.texto.length, 0)
console.log(
  `OK: ${artigos.length} artigos, ${chars} chars -> src/lib/ajuda/base-conhecimento.ts`
)
