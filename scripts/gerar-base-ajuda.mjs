// Gera as bases de texto puro dos manuais a partir dos MDX (bundle confiável na
// Vercel, sem ler arquivo em tempo de execução):
//  - painel → src/lib/ajuda/base-conhecimento.ts: a IA de ajuda usa como base
//    de conhecimento;
//  - portal → src/lib/ajuda/base-conhecimento-portal.ts: a busca da ajuda do
//    associado procura no corpo dos artigos, não só nos títulos (A111).
// USO: node scripts/gerar-base-ajuda.mjs            (as duas; roda no prebuild)
//      node scripts/gerar-base-ajuda.mjs portal     (só a do portal)
// Re-rode quando um manual mudar — o `npm run build` já roda sozinho.
import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs"
import { join } from "node:path"

const ALVOS = {
  painel: {
    raiz: "src/conteudo/ajuda",
    saida: "src/lib/ajuda/base-conhecimento.ts",
    nome: "BASE_AJUDA",
  },
  portal: {
    raiz: "src/conteudo/portal",
    saida: "src/lib/ajuda/base-conhecimento-portal.ts",
    nome: "BASE_AJUDA_PORTAL",
  },
}

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

function gerar({ raiz, saida, nome }) {
  const artigos = []
  for (const arq of listarMdx(raiz)) {
    const partes = arq.split(/[\\/]+/)
    const slug = partes[partes.length - 1].replace(/\.mdx$/, "")
    const area = partes[partes.length - 2]
    const texto = limpar(readFileSync(arq, "utf8"))
    if (texto) artigos.push({ area, slug, texto })
  }
  artigos.sort((a, b) => (a.area + a.slug).localeCompare(b.area + b.slug, "pt-BR"))

  const cabecalho =
    "// GERADO por scripts/gerar-base-ajuda.mjs — NÃO edite à mão.\n" +
    `// Re-rode o script quando o manual (${raiz}) mudar.\n\n` +
    "export type ArtigoBase = { area: string; slug: string; texto: string }\n\n" +
    `export const ${nome}: ArtigoBase[] = ` +
    JSON.stringify(artigos, null, 2) +
    "\n"
  writeFileSync(saida, cabecalho)
  const chars = artigos.reduce((s, a) => s + a.texto.length, 0)
  console.log(`OK: ${artigos.length} artigos, ${chars} chars -> ${saida}`)
}

const pedidos = process.argv.slice(2)
for (const chave of pedidos.length ? pedidos : Object.keys(ALVOS)) {
  const alvo = ALVOS[chave]
  if (!alvo) {
    console.error(`Alvo desconhecido: ${chave} (use ${Object.keys(ALVOS).join(" ou ")})`)
    process.exit(1)
  }
  gerar(alvo)
}
