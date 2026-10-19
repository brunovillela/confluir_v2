import { createHash } from "node:crypto"

/**
 * Integridade da votação (dossiê de auditoria, docs/votacao/dossie-auditoria.md,
 * C-3 e C-5). O banco calcula o hash e roda a conferência no encerramento
 * (migração 20261019083424_votacao_integridade); aqui ficam o mesmo texto
 * canônico, para recalcular e mostrar, e os tipos da conferência.
 */

/** Uma linha de voto_resultado_final. */
export type LinhaResultado = {
  pergunta_id: string
  opcao_id: string | null
  tipo: string
  quantidade: number
}

/** Ordem de bytes, como o `collate "C"` do banco. */
function ordemDeBytes(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Texto canônico do resultado congelado — igual a `voto_resultado_texto()` no
 * banco: uma linha por registro, "assembleia;pergunta;opção|branco|nulo;quantidade",
 * ordenadas por pergunta, tipo e opção, separadas por \n, sem \n no fim.
 */
export function textoCanonicoResultado(assembleiaId: string, linhas: LinhaResultado[]): string {
  return [...linhas]
    .sort(
      (x, y) =>
        ordemDeBytes(x.pergunta_id, y.pergunta_id) ||
        ordemDeBytes(x.tipo, y.tipo) ||
        ordemDeBytes(x.opcao_id ?? "", y.opcao_id ?? "")
    )
    .map((l) => `${assembleiaId};${l.pergunta_id};${l.opcao_id ?? l.tipo};${l.quantidade}`)
    .join("\n")
}

/** SHA-256 (hex) do texto canônico. */
export function hashResultado(texto: string): string {
  return createHash("sha256").update(texto, "utf8").digest("hex")
}

/** Hash em blocos de 8 para ler em voz alta ou conferir no papel. */
export function hashLegivel(hash: string): string {
  return hash.match(/.{1,8}/g)?.join(" ") ?? hash
}

export type VerificacaoConferencia = {
  id: string
  nome: string
  ok: boolean
  detalhe: string
}

/** Saída de `votacao_conferencia()` (C1–C6), gravada no encerramento. */
export type Conferencia = {
  ok: boolean
  gerado_em: string | null
  rodada_id: string | null
  verificacoes: VerificacaoConferencia[]
  erro?: string
}

export function lerConferencia(v: unknown): Conferencia | null {
  if (!v || typeof v !== "object") return null
  const o = v as Record<string, unknown>
  const lista = Array.isArray(o.verificacoes) ? o.verificacoes : []
  return {
    ok: o.ok === true,
    gerado_em: typeof o.gerado_em === "string" ? o.gerado_em : null,
    rodada_id: typeof o.rodada_id === "string" ? o.rodada_id : null,
    verificacoes: lista
      .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === "object")
      .map((x) => ({
        id: String(x.id ?? ""),
        nome: String(x.nome ?? ""),
        ok: x.ok === true,
        detalhe: String(x.detalhe ?? ""),
      })),
    ...(typeof o.erro === "string" ? { erro: o.erro } : {}),
  }
}
