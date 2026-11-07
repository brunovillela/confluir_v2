/**
 * DISTRIBUIÇÃO DE COMPROVANTES (07/11/2026): casa um comprovante lido pela IA
 * com as ordens que estão sem comprovante. Puro (sem banco), para servir ao
 * servidor e à tela e ser testado sozinho (tests/unidade/comprovantes-casamento).
 *
 * Pontuação somada por sinal; a linha digitável e a chave Pix praticamente
 * decidem, o valor é quase obrigatório (valor diferente derruba), nome,
 * documento e data desempatam.
 */

export type ComprovanteLido = {
  /** Páginas do arquivo (1 = primeira) que pertencem a este comprovante. */
  paginas: number[]
  tipo: string | null
  valor: number | null
  /** AAAA-MM-DD. */
  data: string | null
  favorecido: string | null
  /** Como aparece: pode vir mascarado (***.456.789-**). */
  documento: string | null
  chavePix: string | null
  linhaDigitavel: string | null
}

export type OrdemCandidata = {
  id: string
  codigo: string | null
  situacao: string | null
  descricao: string | null
  forma: string | null
  /** Valor cobrado. */
  valor: number | null
  valorPago: number | null
  vencimento: string | null
  dataPagamento: string | null
  favorecido: string | null
  documento: string | null
  linhaDigitavel: string | null
  chavesPix: string[]
}

export type Sugestao = {
  ordemId: string
  pontos: number
  motivos: string[]
}

/** A partir de quantos pontos a ordem aparece como sugestão. */
export const PONTOS_MINIMOS = 35
/** A partir de quantos pontos (e com folga sobre a segunda) já vem marcada. */
export const PONTOS_CONFIANCA = 60
const FOLGA = 15

const so = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "")
const centavos = (v: number) => Math.round(v * 100)

const PALAVRAS_VAZIAS = new Set([
  "de", "da", "do", "das", "dos", "e", "ltda", "me", "mei", "eireli", "epp", "sa", "s", "a", "cia", "the",
])

function palavras(nome: string | null): string[] {
  return (nome ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((p) => p.length > 1 && !PALAVRAS_VAZIAS.has(p))
}

/** 0 a 1: quanto os nomes se parecem (bancos abreviam e cortam nomes). */
export function semelhancaNome(a: string | null, b: string | null): number {
  const pa = palavras(a)
  const pb = palavras(b)
  if (!pa.length || !pb.length) return 0
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa]
  let comuns = 0
  for (const p of menor) {
    if (maior.some((q) => q === p || (p.length >= 4 && q.length >= 4 && (q.startsWith(p) || p.startsWith(q))))) comuns += 1
  }
  return comuns / menor.length
}

/** Linha digitável de boleto bancário (47) → código de barras (44); o resto fica como veio. */
export function codigoDeBarras(codigo: string | null): string {
  const d = so(codigo)
  if (d.length === 47) return d.slice(0, 4) + d.slice(32, 33) + d.slice(33, 47) + d.slice(4, 9) + d.slice(10, 20) + d.slice(21, 31)
  if (d.length === 48) {
    // Arrecadação: 4 blocos de 11 + DV.
    return d.slice(0, 11) + d.slice(12, 23) + d.slice(24, 35) + d.slice(36, 47)
  }
  return d
}

function chavePix(c: string | null): string {
  const t = (c ?? "").trim().toLowerCase()
  if (!t) return ""
  if (t.includes("@")) return t
  // CPF, CNPJ e telefone: só dígitos (telefone sem o +55).
  const d = so(t)
  if (/^[0-9a-f-]{36}$/.test(t)) return t
  return d.length === 13 && d.startsWith("55") ? d.slice(2) : d || t
}

function dias(a: string, b: string): number {
  return Math.abs(Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86_400_000
}

/** Pontua uma ordem para um comprovante, com os motivos legíveis. */
export function pontuar(c: ComprovanteLido, o: OrdemCandidata): Sugestao {
  let pontos = 0
  const motivos: string[] = []
  const paga = o.situacao === "Paga"

  // Valor: o pago (ordem Paga) ou o cobrado.
  const alvo = paga ? (o.valorPago ?? o.valor) : o.valor
  if (c.valor !== null && alvo !== null && alvo > 0) {
    if (centavos(c.valor) === centavos(alvo)) {
      pontos += 45
      motivos.push("mesmo valor")
    } else if (!paga && c.valor > alvo && c.valor <= alvo * 1.1) {
      pontos += 15
      motivos.push("valor com acréscimo (juros/multa?)")
    } else {
      pontos -= 40
    }
  }

  const barrasC = codigoDeBarras(c.linhaDigitavel)
  const barrasO = codigoDeBarras(o.linhaDigitavel)
  if (barrasC.length >= 44 && barrasO.length >= 44 && barrasC === barrasO) {
    pontos += 80
    motivos.push("mesmo código de barras")
  }

  const pix = chavePix(c.chavePix)
  if (pix && o.chavesPix.some((k) => chavePix(k) === pix)) {
    pontos += 40
    motivos.push("mesma chave Pix")
  }

  // Documento: completo compara inteiro; mascarado, o trecho visível.
  const docC = so(c.documento)
  const docO = so(o.documento)
  if (docC && docO) {
    if ((docC.length === 11 || docC.length === 14) && !/[*x•]/i.test(c.documento ?? "")) {
      if (docC === docO) {
        pontos += 40
        motivos.push("mesmo CPF/CNPJ")
      } else pontos -= 20
    } else if (docC.length >= 5 && docO.includes(docC)) {
      pontos += 25
      motivos.push("CPF/CNPJ confere no trecho visível")
    }
  }

  const nome = semelhancaNome(c.favorecido, o.favorecido)
  if (nome >= 0.5) {
    pontos += Math.round(30 * nome)
    motivos.push(nome >= 0.99 ? "mesmo favorecido" : "favorecido parecido")
  }

  if (c.data) {
    if (paga && o.dataPagamento) {
      const d = dias(c.data, o.dataPagamento)
      if (d === 0) {
        pontos += 20
        motivos.push("mesma data de pagamento")
      } else if (d <= 3) {
        pontos += 10
        motivos.push("data de pagamento próxima")
      } else if (d > 15) pontos -= 10
    } else if (!paga && o.vencimento) {
      const d = dias(c.data, o.vencimento)
      if (d <= 5) {
        pontos += 10
        motivos.push("pago perto do vencimento")
      } else if (d > 45) pontos -= 10
    }
  }

  return { ordemId: o.id, pontos, motivos }
}

/** As melhores ordens para o comprovante (até `limite`), da mais provável à menos. */
export function sugerirOrdens(c: ComprovanteLido, candidatas: OrdemCandidata[], limite = 5): Sugestao[] {
  return candidatas
    .map((o) => pontuar(c, o))
    .filter((s) => s.pontos >= PONTOS_MINIMOS)
    .sort((a, b) => b.pontos - a.pontos)
    .slice(0, limite)
}

/**
 * Escolha inicial de cada comprovante: a sugestão confiável (pontos e folga
 * sobre a segunda), sem repetir a mesma ordem — o comprovante mais seguro
 * fica com ela, o outro passa à próxima. null = o usuário escolhe.
 */
export function atribuirOrdens(itens: { chave: string; sugestoes: Sugestao[] }[]): Map<string, string | null> {
  const escolha = new Map<string, string | null>(itens.map((i) => [i.chave, null]))
  const usadas = new Set<string>()
  const ordem = [...itens].sort((a, b) => (b.sugestoes[0]?.pontos ?? 0) - (a.sugestoes[0]?.pontos ?? 0))
  for (const item of ordem) {
    const livres = item.sugestoes.filter((s) => !usadas.has(s.ordemId))
    const [primeira, segunda] = livres
    if (!primeira || primeira.pontos < PONTOS_CONFIANCA) continue
    if (segunda && primeira.pontos - segunda.pontos < FOLGA) continue
    escolha.set(item.chave, primeira.ordemId)
    usadas.add(primeira.ordemId)
  }
  return escolha
}
