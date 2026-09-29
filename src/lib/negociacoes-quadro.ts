/**
 * Quadro comparativo da negociação: acordo VIGENTE × PAUTA × PROPOSTA, em três
 * colunas, cláusula a cláusula. Puro (sem banco nem IA) — usa o mesmo
 * pareamento do comparador de dois documentos (acordos-comparar.ts).
 *
 * Ordem das linhas: as cláusulas do vigente (na ordem dele), depois as
 * reivindicações novas da pauta, depois o que só a proposta traz.
 */

import { parear, situacaoDoPar, type ClausulaComparavel } from "@/lib/acordos-comparar"

/** O que a proposta faz com a cláusula, em relação ao vigente. */
export type LeituraProposta = "mantida" | "alterada" | "retirada" | "nova" | "sem_proposta"
/** Como a proposta responde ao item da pauta. */
export type LeituraPauta = "atendida" | "diferente" | "sem_resposta" | null

export type LinhaQuadro<C extends ClausulaComparavel = ClausulaComparavel> = {
  vigente: C | null
  pauta: C | null
  proposta: C | null
  leituraProposta: LeituraProposta
  leituraPauta: LeituraPauta
}

export const ROTULO_LEITURA_PROPOSTA: Record<LeituraProposta, string> = {
  mantida: "Mantida",
  alterada: "Alterada pela proposta",
  retirada: "Retirada na proposta",
  nova: "Nova na proposta",
  sem_proposta: "—",
}

export const ROTULO_LEITURA_PAUTA: Record<Exclude<LeituraPauta, null>, string> = {
  atendida: "Pauta atendida",
  diferente: "Proposta difere da pauta",
  sem_resposta: "Pauta sem resposta",
}

function mapa(pares: ReturnType<typeof parear>): Map<string, string> {
  const m = new Map<string, string>()
  for (const p of pares) if (p.a && p.b) m.set(p.a, p.b)
  return m
}

export function montarQuadro<C extends ClausulaComparavel>(
  vigente: C[],
  pauta: C[],
  proposta: C[] | null
): LinhaQuadro<C>[] {
  const porId = new Map<string, C>()
  for (const c of [...vigente, ...pauta, ...(proposta ?? [])]) porId.set(c.id, c)
  const temProposta = proposta !== null

  const vr = mapa(parear(vigente, proposta ?? []))
  const vp = mapa(parear(vigente, pauta))
  const pautaUsada = new Set(vp.values())
  const propostaUsada = new Set(vr.values())
  const pautaSobra = pauta.filter((c) => !pautaUsada.has(c.id))
  const propostaSobra = (proposta ?? []).filter((c) => !propostaUsada.has(c.id))
  const pr = mapa(parear(pautaSobra, propostaSobra))
  for (const r of pr.values()) propostaUsada.add(r)

  const leituraPauta = (p: C | null, r: C | null): LeituraPauta => {
    if (!p || !temProposta) return null
    if (!r) return "sem_resposta"
    return situacaoDoPar(p, r) === "igual" ? "atendida" : "diferente"
  }

  const linhas: LinhaQuadro<C>[] = []
  for (const v of vigente) {
    const p = vp.has(v.id) ? porId.get(vp.get(v.id)!)! : null
    const r = vr.has(v.id) ? porId.get(vr.get(v.id)!)! : null
    linhas.push({
      vigente: v,
      pauta: p,
      proposta: r,
      leituraProposta: !temProposta
        ? "sem_proposta"
        : !r
          ? "retirada"
          : situacaoDoPar(v, r) === "igual"
            ? "mantida"
            : "alterada",
      leituraPauta: leituraPauta(p, r),
    })
  }
  for (const p of pautaSobra) {
    const r = pr.has(p.id) ? porId.get(pr.get(p.id)!)! : null
    linhas.push({
      vigente: null,
      pauta: p,
      proposta: r,
      leituraProposta: !temProposta ? "sem_proposta" : r ? "nova" : "sem_proposta",
      leituraPauta: leituraPauta(p, r),
    })
  }
  for (const r of (proposta ?? []).filter((c) => !propostaUsada.has(c.id))) {
    linhas.push({ vigente: null, pauta: null, proposta: r, leituraProposta: "nova", leituraPauta: null })
  }
  return linhas
}
