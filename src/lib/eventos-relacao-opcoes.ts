/**
 * Opções do "Baixar confirmados…" (19/11/2026). Puro, fora do `server-only`:
 * o painel do cliente monta a URL com estes nomes e as rotas leem de volta com
 * `lerOpcoesRelacao`, então os dois lados não desencontram.
 */

export type QuemNaRelacao = "todos" | "filiados" | "convidados" | "nao_filiados"
export type FormatoRelacao = "xlsx" | "pdf" | "assinatura"

export type OpcoesRelacao = {
  quem: QuemNaRelacao
  /** Inclui a lista de espera, além dos confirmados. */
  espera: boolean
  /** CPF parcial (***.456.789-**): basta para conferir na porta. */
  cpfParcial: boolean
  /** Leva e-mail e telefone. Desligado para arquivo que vai a terceiro. */
  contato: boolean
}

export const QUEM_NA_RELACAO: { valor: QuemNaRelacao; rotulo: string }[] = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "filiados", rotulo: "Só filiados" },
  { valor: "convidados", rotulo: "Só convidados" },
  { valor: "nao_filiados", rotulo: "Só não filiados" },
]

export const OPCOES_PADRAO: OpcoesRelacao = { quem: "todos", espera: false, cpfParcial: false, contato: true }

export function lerOpcoesRelacao(sp: URLSearchParams): OpcoesRelacao {
  const quem = sp.get("quem") as QuemNaRelacao | null
  return {
    // `filiados=1` era o parâmetro do primeiro "Excel só filiados".
    quem: QUEM_NA_RELACAO.some((q) => q.valor === quem) ? quem! : sp.get("filiados") === "1" ? "filiados" : "todos",
    espera: sp.get("espera") === "1",
    cpfParcial: sp.get("cpf") === "parcial",
    contato: sp.get("contato") !== "0",
  }
}

export function urlRelacao(eventoId: string, formato: FormatoRelacao, o: OpcoesRelacao): string {
  const sp = new URLSearchParams()
  if (formato === "assinatura") sp.set("assinatura", "1")
  if (o.quem !== "todos") sp.set("quem", o.quem)
  if (o.espera) sp.set("espera", "1")
  if (o.cpfParcial) sp.set("cpf", "parcial")
  if (!o.contato) sp.set("contato", "0")
  const q = sp.toString()
  return `/painel/eventos/${eventoId}/confirmados/${formato === "xlsx" ? "xlsx" : "pdf"}${q ? `?${q}` : ""}`
}

/** "012.345.678-90" → "***.345.678-**": os dígitos do meio bastam para conferir. */
export function cpfParcial(cpf: string | null): string | null {
  const d = (cpf ?? "").replace(/\D/g, "")
  if (d.length !== 11) return cpf ? "***" : null
  return `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
}

/** Recorte em palavras, para o subtítulo do PDF e o livro de exportações. */
export function descreverRecorte(o: OpcoesRelacao): string {
  const partes = [
    o.espera ? "confirmados e lista de espera" : "confirmados",
    o.quem !== "todos" ? QUEM_NA_RELACAO.find((q) => q.valor === o.quem)!.rotulo.toLowerCase() : null,
    o.cpfParcial ? "CPF parcial" : null,
    o.contato ? null : "sem contato",
  ]
  return partes.filter(Boolean).join(" · ")
}
