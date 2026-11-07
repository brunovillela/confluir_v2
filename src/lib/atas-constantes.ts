/**
 * Atas de reunião — tipos de reunião. Client-safe (usado por forms/listas) —
 * não importa de server-only.
 */
export const TIPOS_REUNIAO = [
  { chave: "diretoria", rotulo: "Diretoria" },
  { chave: "conselho_fiscal", rotulo: "Conselho fiscal" },
  { chave: "assembleia", rotulo: "Assembleia" },
  { chave: "outra", rotulo: "Outra" },
] as const

export type TipoReuniao = (typeof TIPOS_REUNIAO)[number]["chave"]

/**
 * No lugar do título de uma ata cujo sigilo está acima do nível de quem vê
 * (07/11/2026): o título pode revelar o assunto da reunião.
 */
export const TITULO_SOB_SIGILO = "(título sob sigilo)"

export const ROTULO_TIPO_REUNIAO = Object.fromEntries(
  TIPOS_REUNIAO.map((t) => [t.chave, t.rotulo])
) as Record<TipoReuniao, string>

/** O mínimo de uma ata para numerá-la. */
export type AtaParaNumerar = {
  id: string
  tipo: TipoReuniao
  orgao: string | null
  data: string | null
  hora: string | null
  criadaEm: string | null
}

/** "14h00", "14:00", "9h" → minutos (sem hora = antes de todas no dia). */
function minutosDaHora(hora: string | null): number {
  const m = /(\d{1,2})\s*[h:]\s*(\d{2})?/i.exec(hora ?? "")
  return m ? Number(m[1]) * 60 + Number(m[2] ?? 0) : -1
}

/**
 * Numeração anual das atas (07/11/2026): cada série — o tipo de reunião (e,
 * em "outra", o órgão) — recomeça em 01 a cada ano, na ordem da data e da
 * hora da reunião (empate: a lançada antes). Calculada, não gravada: uma
 * ata antiga lançada depois de uma mais recente entra no lugar dela e as
 * seguintes se renumeram sozinhas. Ata sem data fica sem número.
 * Devolve id → "03/2026".
 */
export function numerarAtas(atas: AtaParaNumerar[]): Map<string, string> {
  const series = new Map<string, AtaParaNumerar[]>()
  for (const a of atas) {
    if (!a.data || !/^\d{4}-/.test(a.data)) continue
    const serie = a.tipo === "outra" ? `outra:${(a.orgao ?? "").trim().toLowerCase()}` : a.tipo
    const chave = `${a.data.slice(0, 4)}|${serie}`
    const lista = series.get(chave) ?? []
    lista.push(a)
    series.set(chave, lista)
  }
  const numeros = new Map<string, string>()
  for (const [chave, lista] of series) {
    const ano = chave.slice(0, 4)
    lista.sort(
      (x, y) =>
        (x.data ?? "").localeCompare(y.data ?? "") ||
        minutosDaHora(x.hora) - minutosDaHora(y.hora) ||
        (x.criadaEm ?? "").localeCompare(y.criadaEm ?? "") ||
        x.id.localeCompare(y.id)
    )
    lista.forEach((a, i) => numeros.set(a.id, `${String(i + 1).padStart(2, "0")}/${ano}`))
  }
  return numeros
}
