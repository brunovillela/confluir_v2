/**
 * Tabelas salariais: nome, equivalência de degraus e o plano de levar os
 * funcionários para uma nova tabela — módulo puro: vale no servidor e na tela.
 */

/** Nome gerado pelo sistema: "[Ano de início] - [Ano de término]". */
export function nomeTabelaSalarial(inicio: string, fim: string): string {
  return `${inicio.slice(0, 4)} - ${fim.slice(0, 4)}`
}

export function rotuloTabelaSalarial(t: { nome: string | null }): string {
  return t.nome ?? "Tabela atual (sem vigência)"
}

export type DegrauChave = {
  cargo_id: string | null
  nivel_vertical: string | null
  nivel_horizontal: string | null
  nivel_carreira: string | null
}

const parte = (v: string | null) => (v ?? "").trim().toLowerCase()

/** O mesmo degrau em tabelas diferentes: cargo, vertical, horizontal e carreira. */
export function chaveDegrau(d: DegrauChave): string {
  return [d.cargo_id ?? "", parte(d.nivel_vertical), parte(d.nivel_horizontal), parte(d.nivel_carreira)].join("|")
}

export type DegrauDestino = DegrauChave & { id: string; salario_base: number | null }

export type NivelAtual = {
  lancamentoId: string
  funcionarioId: string
  funcionarioNome: string | null
  desde: string | null
  nivelAtualId: string | null
  atual: (DegrauChave & { salario_base: number | null }) | null
  proximoId: string | null
  proximo: DegrauChave | null
}

export type Mudanca = NivelAtual & {
  para: DegrauDestino
  /** Degrau equivalente ao próximo nível; null quando não há. */
  proximoPara: DegrauDestino | null
  proximoSemEquivalente: boolean
  /**
   * novo: lançamento datado do início da tabela. atualiza: o lançamento atual é
   * dessa data ou mais recente, então só troca o degrau dele (um novo não seria
   * o mais recente, e o funcionário continuaria na tabela antiga).
   */
  modo: "novo" | "atualiza"
}

export type PlanoVigencia = {
  mudam: Mudanca[]
  semEquivalente: NivelAtual[]
  jaNaTabela: number
}

/** Quem muda de degrau ao tornar vigente a tabela que começa em `inicio`. */
export function planejarVigencia(atuais: NivelAtual[], degraus: DegrauDestino[], inicio: string): PlanoVigencia {
  const porChave = new Map<string, DegrauDestino>()
  // Degraus repetidos na tabela: vale o primeiro.
  for (const d of degraus) if (!porChave.has(chaveDegrau(d))) porChave.set(chaveDegrau(d), d)
  const nestaTabela = new Set(degraus.map((d) => d.id))

  const plano: PlanoVigencia = { mudam: [], semEquivalente: [], jaNaTabela: 0 }
  for (const n of atuais) {
    if (n.nivelAtualId && nestaTabela.has(n.nivelAtualId)) {
      plano.jaNaTabela++
      continue
    }
    const para = n.atual ? porChave.get(chaveDegrau(n.atual)) : undefined
    if (!para) {
      plano.semEquivalente.push(n)
      continue
    }
    const proximoPara = n.proximo ? (porChave.get(chaveDegrau(n.proximo)) ?? null) : null
    plano.mudam.push({
      ...n,
      para,
      proximoPara,
      proximoSemEquivalente: Boolean(n.proximo && !proximoPara),
      modo: n.desde && n.desde >= inicio ? "atualiza" : "novo",
    })
  }
  return plano
}
