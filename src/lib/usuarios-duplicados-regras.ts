import { semAcento } from "@/lib/texto"

/**
 * Regras puras dos cadastros repetidos em `usuarios` (sem banco, testadas em
 * tests/unidade/usuarios-duplicados.spec.ts). O acesso ao banco fica em
 * src/lib/db/usuarios-duplicados.ts.
 */

/** Palavras do nome, sem acento, sem caixa e sem espaços repetidos. */
export function nomeComparavel(nome: string | null | undefined): string {
  return semAcento(nome ?? "").replace(/\s+/g, " ").trim()
}

/**
 * Padrão de `ilike` que acha o mesmo nome com ou sem acento: primeira e
 * última palavra, com as letras que podem levar acento trocadas por `_`. O
 * resultado é largo de propósito; quem chama compara o nome inteiro depois.
 * Null com menos de duas palavras.
 */
export function padraoDoNome(nome: string): string | null {
  const palavras = nomeComparavel(nome).split(" ").filter(Boolean)
  if (palavras.length < 2) return null
  const solta = (p: string) => p.replace(/[%_\\]/g, "").replace(/[aeiouc]/g, "_")
  return `${solta(palavras[0])}%${solta(palavras[palavras.length - 1])}`
}

type Comparavel = { temLogin: boolean; temAcesso: boolean; criadoEm: string | null }

/** Ordem de preferência: com login, depois com acesso, depois o mais antigo. */
export function preferencia(a: Comparavel, b: Comparavel): number {
  if (a.temLogin !== b.temLogin) return a.temLogin ? -1 : 1
  if (a.temAcesso !== b.temAcesso) return a.temAcesso ? -1 : 1
  return String(a.criadoEm ?? "").localeCompare(String(b.criadoEm ?? ""))
}

/**
 * Qual dos dois cadastros fica: o que tem login. Sem login nos dois, o
 * `preferido` (o da página onde se clicou). Login nos dois: não dá.
 */
export function escolherPrincipal(
  preferido: { usuarioId: string; temLogin: boolean },
  outro: { usuarioId: string; temLogin: boolean }
): { principal: string; secundario: string } | { erro: string } {
  if (preferido.temLogin && outro.temLogin) {
    return {
      erro: "Os dois cadastros têm login. Decida antes qual login fica: revogue o login de um deles em Gestão › Usuários.",
    }
  }
  if (outro.temLogin) return { principal: outro.usuarioId, secundario: preferido.usuarioId }
  return { principal: preferido.usuarioId, secundario: outro.usuarioId }
}
