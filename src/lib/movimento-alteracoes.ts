/**
 * Movimento da folha — alterações e exclusões DEPOIS do envio (15/11/2026).
 *
 * Férias, atestados e ausências entram no movimento uma vez (pela chave
 * `tipo:id`). Se depois de entregues as datas ou os dias mudam, ou o registro
 * é excluído, a contabilidade precisa saber. A fotografia de cada competência
 * enviada guarda o que foi informado (início, fim, quantidade); comparando com
 * o registro de hoje sai a linha de correção. Uma correção já entregue
 * (`tipo-alterada:…`) passa a ser a nova referência.
 *
 * Contas puras (sem servidor) para testar isoladas; quem lê o banco é
 * lib/db/folha-movimento.ts.
 */

export const TIPOS_CORRIGIVEIS = ["ferias", "atestado", "ausencia"] as const
export type TipoCorrigivel = (typeof TIPOS_CORRIGIVEIS)[number]

/** O que a contabilidade recebeu por último de um registro. */
export type Informado = {
  tipo: TipoCorrigivel
  id: string
  secao: string
  funcionarioId: string | null
  inicio: string | null
  fim: string | null
  quantidade: number | null
  /** Competência (AAAA-MM) em que isso foi informado. */
  competencia: string
}

type LinhaEntregue = {
  chave: string
  secao?: string
  funcionarioId?: string | null
  inicio?: string | null
  fim?: string | null
  quantidade?: number | null
}

const CHAVE = /^(ferias|atestado|ausencia)(-alterada)?:([0-9a-f-]{36})(?::|$)/i

/** Chave `tipo:id` (ou correção `tipo-alterada:id:…`) → tipo e id. */
export function lerChaveCorrigivel(chave: string): { tipo: TipoCorrigivel; id: string } | null {
  const m = CHAVE.exec(chave)
  return m ? { tipo: m[1].toLowerCase() as TipoCorrigivel, id: m[3].toLowerCase() } : null
}

/**
 * O último estado informado de cada registro, pela ordem das competências
 * (da mais antiga para a mais nova). Chave do mapa: `tipo:id`.
 */
export function ultimosInformados(
  enviadas: { competencia: string; snapshot: unknown }[]
): Map<string, Informado> {
  const saida = new Map<string, Informado>()
  const ordenadas = [...enviadas].sort((a, b) => a.competencia.localeCompare(b.competencia))
  for (const c of ordenadas) {
    const linhas = Array.isArray(c.snapshot) ? (c.snapshot as LinhaEntregue[]) : []
    for (const l of linhas) {
      const k = typeof l.chave === "string" ? lerChaveCorrigivel(l.chave) : null
      if (!k) continue
      saida.set(`${k.tipo}:${k.id}`, {
        tipo: k.tipo,
        id: k.id,
        secao: l.secao ?? "",
        funcionarioId: l.funcionarioId ?? null,
        inicio: l.inicio ?? null,
        fim: l.fim ?? null,
        quantidade: l.quantidade ?? null,
        competencia: c.competencia,
      })
    }
  }
  return saida
}

export type Atual = { inicio: string | null; fim: string | null; quantidade: number | null }

/** Mudou o que interessa à folha: início, fim ou quantidade de dias. */
export function mudou(informado: Pick<Informado, "inicio" | "fim" | "quantidade">, atual: Atual): boolean {
  return (
    (informado.inicio ?? null) !== (atual.inicio ?? null) ||
    (informado.fim ?? null) !== (atual.fim ?? null) ||
    (informado.quantidade ?? null) !== (atual.quantidade ?? null)
  )
}

/** Chave da correção: muda a cada novo estado (duas alterações = duas linhas). */
export function chaveAlteracao(tipo: TipoCorrigivel, id: string, atual: Atual): string {
  return `${tipo}-alterada:${id}:${atual.inicio ?? ""}:${atual.fim ?? ""}:${atual.quantidade ?? ""}`
}

export function chaveExclusao(tipo: TipoCorrigivel, id: string): string {
  return `${tipo}-excluida:${id}`
}

function dataBR(d: string | null): string {
  return d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—"
}

/** "05/10/2026 a 14/10/2026 (10 dias)" — ou só a data, quando é um dia. */
export function periodoTexto(p: Atual): string {
  const datas = p.fim && p.fim !== p.inicio ? `${dataBR(p.inicio)} a ${dataBR(p.fim)}` : dataBR(p.inicio)
  return p.quantidade ? `${datas} (${p.quantidade} dia${p.quantidade === 1 ? "" : "s"})` : datas
}

export function competenciaTexto(c: string): string {
  return `${c.slice(5, 7)}/${c.slice(0, 4)}`
}
