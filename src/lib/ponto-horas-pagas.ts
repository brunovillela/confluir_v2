/**
 * HORAS EXTRAS PAGAS LIDAS DO CONTRACHEQUE (Ponto, Fase 2 — 28/11/2026).
 *
 * Módulo puro (servidor e tela). Cada entidade configura as rubricas de hora
 * extra do seu contracheque (código e/ou descrição, faixa, se conta horas ou
 * só valor). As linhas do PDF são lidas no servidor, sem IA; aqui fica a regra
 * que acha a rubrica numa linha e tira dela a referência (horas) e o valor.
 *
 * O que não se resolve pelo texto vira "ambígua": a IA só a interpreta se a
 * entidade deixar, e recebe só aquela linha (ver linhaParaIA), sem nome nem CPF.
 */

export type TipoRubrica = "horas" | "valor"
export type FaixaRubrica = 1 | 2
export type ReferenciaHoras = "decimal" | "hhmm"

export type RubricaHE = {
  codigo: string | null
  descricao: string | null
  faixa: FaixaRubrica
  /** "valor": soma só o valor (ex.: DSR sobre horas extras), ignora a referência. */
  tipo: TipoRubrica
}

export type OrigemLeitura = "texto" | "ia" | "imagem"

export type LinhaHE = {
  /** Rubrica (descrição ou código) que casou. */
  rubrica: string
  faixa: FaixaRubrica
  tipo: TipoRubrica
  horas: number | null
  valor: number | null
  /** Trecho da linha, da rubrica em diante (sem nome nem CPF). */
  texto: string
  /** Não deu para tirar horas e valor com segurança. */
  ambigua?: boolean
  origem?: OrigemLeitura
}

export type SituacaoLeitura = "lido" | "sem_contracheque" | "sem_arquivo" | "sem_texto" | "ambigua" | "erro"

export type LeituraHE = {
  /** Assinatura das rubricas e do formato usados: muda → relê. */
  chave: string
  situacao: SituacaoLeitura
  linhas: LinhaHE[]
  erro?: string
}

export const semAcentoMaiusc = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim()

/** Assinatura das rubricas + formato da referência (para o cache da leitura). */
export function chaveDaConfig(rubricas: RubricaHE[], referencia: ReferenciaHoras): string {
  const base = JSON.stringify([referencia, rubricas.map((r) => [r.codigo ?? "", semAcentoMaiusc(r.descricao ?? ""), r.faixa, r.tipo])])
  let h = 0
  for (let i = 0; i < base.length; i++) h = (Math.imul(h, 31) + base.charCodeAt(i)) | 0
  return `v1:${(h >>> 0).toString(36)}`
}

/** Normaliza o que veio do formulário/JSON; descarta rubrica sem código nem descrição. */
export function normalizarRubricas(v: unknown): RubricaHE[] {
  if (!Array.isArray(v)) return []
  const saida: RubricaHE[] = []
  for (const x of v) {
    if (!x || typeof x !== "object") continue
    const o = x as Record<string, unknown>
    const codigo = String(o.codigo ?? "").trim() || null
    const descricao = String(o.descricao ?? "").replace(/\s+/g, " ").trim() || null
    if (!codigo && !descricao) continue
    saida.push({
      codigo,
      descricao,
      faixa: Number(o.faixa) === 2 ? 2 : 1,
      tipo: o.tipo === "valor" ? "valor" : "horas",
    })
  }
  return saida
}

export const rotuloRubrica = (r: RubricaHE) => [r.codigo, r.descricao].filter(Boolean).join(" · ")

// Números de contracheque: 1.234,56 · 10,50 · 10:30 · 220 (percentuais já removidos).
const NUMERO = /\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+:\d{2}|\d+,\d+|\d+/g
const CPF = /\d{3}\.?\d{3}\.?\d{3}-?\d{2}/g
const PERCENTUAL = /\d+(?:,\d+)?\s*%/g

function valorEmReais(s: string): number | null {
  if (!/,\d{2}$/.test(s)) return null
  const n = Number(s.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

/** Referência impressa → horas decimais. null = não dá para ler com segurança. */
export function horasDaReferencia(s: string, formato: ReferenciaHoras): number | null {
  const doisPontos = s.match(/^(\d+):(\d{2})$/)
  if (doisPontos) {
    const m = Number(doisPontos[2])
    return m < 60 ? Math.round((Number(doisPontos[1]) + m / 60) * 100) / 100 : null
  }
  const virgula = s.match(/^(\d+),(\d+)$/)
  if (virgula) {
    if (formato === "hhmm") {
      const m = Number(virgula[2].padEnd(2, "0").slice(0, 2))
      return m < 60 ? Math.round((Number(virgula[1]) + m / 60) * 100) / 100 : null
    }
    return Math.round(Number(`${virgula[1]}.${virgula[2]}`) * 100) / 100
  }
  if (/^\d+$/.test(s)) return Number(s)
  return null
}

/**
 * O código da rubrica como palavra solta seguida da descrição (zeros à
 * esquerda não importam: 150 = 0150). Exigir a letra depois evita casar com
 * uma referência ou um valor ("220" horas no mês).
 */
function regexCodigo(codigo: string): RegExp {
  const sem = codigo.replace(/^0+(?=\d)/, "").replace(/[^\dA-Z]/gi, "")
  return new RegExp(`(^|[^\\d.,:])(0*${sem})\\s+(?=[A-Z])`, "i")
}

/**
 * Onde a rubrica aparece na linha normalizada: do código (ou da descrição) ao
 * fim da descrição. Com código e descrição configurados, basta um dos dois —
 * o código manda, a descrição impressa pode variar.
 */
function casaRubrica(linha: string, r: RubricaHE): { ini: number; fim: number } | null {
  const d = r.descricao ? semAcentoMaiusc(r.descricao) : null
  const cod = r.codigo ? regexCodigo(r.codigo).exec(linha) : null
  if (cod) {
    const ini = cod.index + cod[1].length
    const aposCodigo = ini + cod[2].length
    const i = d ? linha.indexOf(d, aposCodigo) : -1
    if (d && i >= 0 && i - aposCodigo < 3) return { ini, fim: i + d.length }
    // Descrição impressa diferente (ou não configurada): vai até o primeiro número.
    const desc = linha.slice(aposCodigo).match(/^\s*[^\d]*/)?.[0] ?? ""
    return { ini, fim: aposCodigo + desc.length }
  }
  if (d) {
    const i = linha.indexOf(d)
    if (i >= 0) return { ini: i, fim: i + d.length }
  }
  return null
}

/**
 * Procura as rubricas numa linha do contracheque. Devolve no máximo uma linha
 * de hora extra (a primeira rubrica que casar). Linha com duas vias lado a
 * lado: vale só a primeira ocorrência.
 */
export function lerLinha(linhaOriginal: string, rubricas: RubricaHE[], formato: ReferenciaHoras): LinhaHE | null {
  const linha = semAcentoMaiusc(linhaOriginal)
  for (const r of rubricas) {
    const casou = casaRubrica(linha, r)
    if (!casou) continue
    let depois = linha.slice(casou.fim)
    // Segunda via na mesma linha: corta na repetição da rubrica.
    const marca = semAcentoMaiusc(r.descricao ?? "") || null
    if (marca) {
      const j = depois.indexOf(marca)
      if (j >= 0) depois = depois.slice(0, j)
    }
    const texto = linha.slice(casou.ini, casou.fim) + depois.replace(CPF, "").replace(/\s+$/, "")
    const numeros = (depois.replace(PERCENTUAL, " ").replace(CPF, " ").match(NUMERO) ?? []).filter((n) => n !== "")
    const base = { rubrica: rotuloRubrica(r), faixa: r.faixa, tipo: r.tipo, texto: texto.slice(0, 160) }
    if (r.tipo === "valor") {
      const valor = numeros.length ? valorEmReais(numeros[numeros.length - 1]) : null
      return { ...base, horas: null, valor, ambigua: valor === null }
    }
    if (numeros.length === 2) {
      const horas = horasDaReferencia(numeros[0], formato)
      const valor = valorEmReais(numeros[1])
      return { ...base, horas, valor, ambigua: horas === null || valor === null }
    }
    return { ...base, horas: null, valor: numeros.length ? valorEmReais(numeros[numeros.length - 1]) : null, ambigua: true }
  }
  return null
}

/** Todas as linhas de hora extra de um contracheque (linhas repetidas — outra via — contam uma vez). */
export function lerLinhas(linhas: string[], rubricas: RubricaHE[], formato: ReferenciaHoras): LinhaHE[] {
  const vistas = new Set<string>()
  const saida: LinhaHE[] = []
  for (const l of linhas) {
    const chave = semAcentoMaiusc(l)
    if (!chave || vistas.has(chave)) continue
    vistas.add(chave)
    const lida = lerLinha(l, rubricas, formato)
    if (lida) saida.push({ ...lida, origem: "texto" })
  }
  return saida
}

export type TotaisHE = { horas1: number; horas2: number; valor1: number; valor2: number; ambiguas: number }

export function totaisDasLinhas(linhas: LinhaHE[]): TotaisHE {
  const t: TotaisHE = { horas1: 0, horas2: 0, valor1: 0, valor2: 0, ambiguas: 0 }
  for (const l of linhas) {
    if (l.ambigua) {
      t.ambiguas++
      continue
    }
    if (l.tipo === "horas" && l.horas !== null) {
      if (l.faixa === 1) t.horas1 += l.horas
      else t.horas2 += l.horas
    }
    if (l.valor !== null) {
      if (l.faixa === 1) t.valor1 += l.valor
      else t.valor2 += l.valor
    }
  }
  const r = (n: number) => Math.round(n * 100) / 100
  return { horas1: r(t.horas1), horas2: r(t.horas2), valor1: r(t.valor1), valor2: r(t.valor2), ambiguas: t.ambiguas }
}

/** Palavras que denunciam uma linha de hora extra (para sugerir rubricas na configuração). */
const PISTA_HE = /\b(HORAS? EXTRAS?|H\.? ?EXTRAS?|H\.E\.?|HE|EXTRAORDINARIAS?|ADIC(IONAL)? (DE )?HORAS?|DSR S\/? ?H|REFLEXO)\b/

/**
 * Linha que parece ser de hora extra → {codigo, descricao} sem números de valor
 * (só o que identifica a rubrica). Usado para sugerir rubricas sem mostrar
 * valores de ninguém.
 */
export function rubricaCandidata(linhaOriginal: string): { codigo: string | null; descricao: string } | null {
  const linha = semAcentoMaiusc(linhaOriginal).replace(CPF, " ")
  if (!PISTA_HE.test(linha)) return null
  // Descrição = palavras até o primeiro número solto (percentual faz parte dela).
  const tokens = linha.replace(/(\d)\s+%/g, "$1%").split(" ")
  const codigo = /^\d{1,6}$/.test(tokens[0] ?? "") ? tokens.shift()! : null
  const palavras: string[] = []
  for (const t of tokens) {
    if (/^[\d.,:]+$/.test(t)) break
    palavras.push(t)
  }
  const descricao = palavras.join(" ").trim()
  if (descricao.length < 3 || descricao.length > 60 || !/^[A-Z]/.test(descricao) || !PISTA_HE.test(descricao)) return null
  return { codigo, descricao }
}

/** Texto que vai à IA: só o trecho da rubrica em diante, sem CPF. */
export function linhaParaIA(l: LinhaHE): string {
  return l.texto.replace(CPF, "").slice(0, 160)
}
