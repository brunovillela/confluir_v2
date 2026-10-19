/**
 * Onda F (docs/plano-documentacao.md): notas de versão em
 * docs/produto/notas-de-versao.md, geradas de src/lib/novidades.ts — a mesma
 * fonte do "O que há de novo" que os usuários veem no sistema. Assim o
 * documento e a tela nunca divergem.
 *
 * Uso: npm run produto:notas
 * (Node 22.6+ lê o .ts direto, removendo os tipos.)
 */
import { writeFileSync, mkdirSync } from "node:fs"
import { pathToFileURL } from "node:url"
import { resolve } from "node:path"

const { NOVIDADES } = await import(pathToFileURL(resolve("src/lib/novidades.ts")).href)

const dataBR = (iso) => iso.split("-").reverse().join("/")
const L = [
  "<!-- GERADO por scripts/gerar-notas-versao.mjs a partir de src/lib/novidades.ts. Não editar à mão: acrescente a entrada em novidades.ts (regra da ADR 0024) e rode `npm run produto:notas`. -->",
  "",
  "# Notas de versão",
  "",
  "O que mudou para quem usa o Confluir, da entrega mais recente para a mais antiga. É o mesmo conteúdo do aviso \"O que há de novo\" dentro do sistema. O detalhe técnico de cada entrega está no histórico do git; as decisões de arquitetura, em [`docs/arquitetura/adr/`](../arquitetura/adr/LEIA-ME.md).",
  "",
]
for (const n of NOVIDADES) {
  L.push(`## ${dataBR(n.id)} — ${n.titulo}`, "", ...n.itens.map((i) => `- ${i}`), "")
}
L.push("---", "", "Entregas anteriores a 05/10/2026 não têm nota de versão; ver o histórico do git e as fichas de módulo no manual (`src/conteudo/ajuda/`).", "")
mkdirSync("docs/produto", { recursive: true })
writeFileSync("docs/produto/notas-de-versao.md", L.join("\n"))
console.log(`Notas de versão: ${NOVIDADES.length} entregas → docs/produto/notas-de-versao.md`)
