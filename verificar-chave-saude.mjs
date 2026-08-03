/**
 * Confere se uma cópia da SAUDE_RELATORIO_CHAVE confere com a que está em uso,
 * sem exibir nenhuma das duas.
 *
 *   node verificar-chave-saude.mjs      → mostra a digital da chave em uso
 *
 * A digital é um hash truncado: serve para comparar, não para reconstruir a
 * chave, e por isso pode circular à vontade.
 *
 * PARA CONFERIR UM BACKUP: rode sem argumento e compare a digital com a que
 * você anotou junto da cópia. NÃO passe a chave por argumento — ela ficaria
 * visível na tela e no histórico do terminal. Foi assim que uma chave
 * precisou ser rotacionada em 21/07/2026.
 */
import { createHash } from "node:crypto"
import fs from "node:fs"

const digital = (b64) =>
  createHash("sha256").update(Buffer.from(b64, "base64")).digest("hex").slice(0, 16)

const atual = Object.fromEntries(
  fs
    .readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l.includes("=") && !l.startsWith("#"))
    .map((l) => {
      const i = l.indexOf("=")
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()]
    })
).SAUDE_RELATORIO_CHAVE

if (!atual) {
  console.error("SAUDE_RELATORIO_CHAVE não encontrada no .env.local")
  process.exit(1)
}

if (process.argv[2]) {
  console.error(
    "Não passe a chave por argumento: ela fica visível na tela e no\n" +
      "histórico do terminal. Rode sem argumento e compare a digital com a\n" +
      "que você anotou junto do backup."
  )
  process.exit(1)
}

console.log("digital da chave em uso: " + digital(atual))
console.log("Compare com a digital anotada junto do seu backup.")
