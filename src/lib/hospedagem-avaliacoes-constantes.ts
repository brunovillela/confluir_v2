/**
 * Avaliação da hospedagem — regras PURAS (fora do `server-only`: o formulário
 * e os painéis usam). Leitura/gravação: src/lib/db/hospedagem-avaliacoes.ts.
 * SQL: supabase/hospedagem-avaliacoes.sql. Inspiração: o Uber (nota de 1 a 5
 * logo depois da viagem, etiquetas que mudam com a nota, motorista não sabe
 * quem avaliou).
 */

/**
 * Só pedem avaliação os cupons SOLICITADOS NO CONFLUIR (sem bubble_id) a
 * partir desta data — os do Bubble nunca, e os 7 de teste/transição criados
 * aqui entre julho e setembro também não (decisão de 02/10/2026).
 */
export const INICIO_AVALIACOES = "2026-10-02"

/** Dias depois do convite para o lembrete. */
export const DIAS_LEMBRETE = 3

/** Nota que exige o texto (como o Uber pede o motivo nas notas baixas). */
export const NOTA_EXIGE_COMENTARIO = 2

export const COMENTARIO_MAX = 1500

export type Etiqueta = {
  chave: string
  rotulo: string
  /** Fala do sistema do sindicato, não do hotel: o hotel não vê. */
  soSindicato?: boolean
}

export const ETIQUETAS: Etiqueta[] = [
  { chave: "limpeza", rotulo: "Limpeza" },
  { chave: "atendimento", rotulo: "Atendimento" },
  { chave: "cafe", rotulo: "Café da manhã" },
  { chave: "conforto", rotulo: "Conforto do quarto" },
  { chave: "silencio", rotulo: "Silêncio" },
  { chave: "localizacao", rotulo: "Localização" },
  { chave: "checkin", rotulo: "Check-in e recepção" },
  { chave: "custo", rotulo: "Custo-benefício" },
  { chave: "aplicativo", rotulo: "Aplicativo (portal e QR Code)", soSindicato: true },
]

export function rotuloEtiqueta(chave: string): string {
  return ETIQUETAS.find((e) => e.chave === chave)?.rotulo ?? chave
}

/** Com 5 estrelas as etiquetas são elogios; com 1–4, o que pode melhorar. */
export function etiquetasSaoElogio(nota: number): boolean {
  return nota === 5
}

export function perguntaDasEtiquetas(nota: number): string {
  return etiquetasSaoElogio(nota) ? "O que mais se destacou?" : "O que pode melhorar?"
}

export const ROTULO_NOTA: Record<number, string> = {
  1: "Muito ruim",
  2: "Ruim",
  3: "Regular",
  4: "Boa",
  5: "Excelente",
}

/** Valida o envio; devolve a mensagem de erro ou null. */
export function conferirAvaliacao(p: { nota: number; etiquetas: string[]; comentario: string }): string | null {
  if (!Number.isInteger(p.nota) || p.nota < 1 || p.nota > 5) return "Escolha de 1 a 5 estrelas."
  if (p.etiquetas.some((e) => !ETIQUETAS.some((x) => x.chave === e))) return "Etiqueta inválida."
  if (p.nota <= NOTA_EXIGE_COMENTARIO && p.comentario.trim().length < 10) {
    return "Conte em poucas palavras o que aconteceu — com 1 ou 2 estrelas o comentário é obrigatório."
  }
  if (p.comentario.length > COMENTARIO_MAX) return `O comentário passa de ${COMENTARIO_MAX} caracteres.`
  return null
}

// ── Indicadores (os dois painéis) ───────────────────────────────────────────

export type AvaliacaoParaIndicador = {
  nota: number | null
  etiquetas: string[]
  checkOut: string
  comentario: string | null
  situacao: "pendente" | "respondida"
}

export type Indicadores = {
  media: number | null
  respondidas: number
  pendentes: number
  /** Respondidas ÷ estadias que pediram avaliação no período. */
  taxaResposta: number | null
  percentual5: number | null
  /** Índice = nota (1–5). */
  distribuicao: Record<1 | 2 | 3 | 4 | 5, number>
  comComentario: number
  /** AAAA-MM → média e quantidade. */
  porMes: { mes: string; media: number; quantidade: number }[]
  elogios: { chave: string; quantidade: number }[]
  melhorar: { chave: string; quantidade: number }[]
}

export function calcularIndicadores(
  avaliacoes: AvaliacaoParaIndicador[],
  opcoes: { incluirSoSindicato: boolean }
): Indicadores {
  const resp = avaliacoes.filter((a) => a.situacao === "respondida" && a.nota !== null)
  const pendentes = avaliacoes.length - resp.length
  const distribuicao = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<1 | 2 | 3 | 4 | 5, number>
  const meses = new Map<string, { soma: number; n: number }>()
  const elogios = new Map<string, number>()
  const melhorar = new Map<string, number>()
  const visivel = (chave: string) =>
    opcoes.incluirSoSindicato || !ETIQUETAS.find((e) => e.chave === chave)?.soSindicato
  let soma = 0
  for (const a of resp) {
    const n = a.nota as 1 | 2 | 3 | 4 | 5
    soma += n
    distribuicao[n]++
    const mes = a.checkOut.slice(0, 7)
    const m = meses.get(mes) ?? { soma: 0, n: 0 }
    meses.set(mes, { soma: m.soma + n, n: m.n + 1 })
    const alvo = etiquetasSaoElogio(n) ? elogios : melhorar
    for (const e of a.etiquetas.filter(visivel)) alvo.set(e, (alvo.get(e) ?? 0) + 1)
  }
  const ordenar = (m: Map<string, number>) =>
    [...m.entries()].map(([chave, quantidade]) => ({ chave, quantidade })).sort((x, y) => y.quantidade - x.quantidade)
  return {
    media: resp.length ? Math.round((soma / resp.length) * 100) / 100 : null,
    respondidas: resp.length,
    pendentes,
    taxaResposta: avaliacoes.length ? resp.length / avaliacoes.length : null,
    percentual5: resp.length ? distribuicao[5] / resp.length : null,
    distribuicao,
    comComentario: resp.filter((a) => (a.comentario ?? "").trim()).length,
    porMes: [...meses.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([mes, v]) => ({ mes, media: Math.round((v.soma / v.n) * 100) / 100, quantidade: v.n })),
    elogios: ordenar(elogios),
    melhorar: ordenar(melhorar),
  }
}
