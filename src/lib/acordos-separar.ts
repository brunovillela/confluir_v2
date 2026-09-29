/**
 * Separa o texto de um acordo coletivo (ACT/CCT) em cláusulas — sem IA, para
 * que o texto de cada cláusula seja LITERALMENTE o do documento.
 *
 * Cada acordo escreve o cabeçalho de um jeito:
 *   "Cláusula 1. Tabela Salarial"            (Petrobras)
 *   "CLÁUSULA 1ª – DATA BASE E PAGAMENTO"      (ACTs regionais)
 *   "CLÁUSULA PRIMEIRA - VIGÊNCIA E DATA-BASE" (registrados no MTE)
 *   "CLÁUSULA\nQUARTA -"                       (quebra de linha no meio)
 * e o corpo cita outras cláusulas ("…conforme a Cláusula Segunda.") — o que
 * parece cabeçalho mas não é. A regra que separa um do outro é a SEQUÊNCIA:
 * só vale como início de cláusula o número que continua a contagem.
 *
 * Funções puras, sem dependências (roda no servidor, no cliente e em script).
 */

export type ClausulaSeparada = {
  numero: number
  /** Como veio no documento: "1ª", "PRIMEIRA", "1". */
  rotuloNumero: string
  titulo: string
  /** Grupo temático impresso antes da cláusula (formato do MTE), se houver. */
  grupo: string | null
  /** Texto integral da cláusula, sem a linha do cabeçalho. */
  texto: string
}

export type Separacao = {
  preambulo: string
  clausulas: ClausulaSeparada[]
  /** Linhas de cabeçalho/rodapé de página retiradas (repetidas em muitas páginas). */
  linhasRemovidas: string[]
  /** Números que faltaram na sequência (ex.: 12 → 14 pulou o 13). */
  lacunas: number[]
  /** Encerramento, assinaturas e anexos depois da última cláusula (fora das cláusulas). */
  anexos: string
}

const UNIDADES: Record<string, number> = {
  PRIMEIRA: 1, PRIMEIRO: 1, UNICA: 1, SEGUNDA: 2, SEGUNDO: 2, TERCEIRA: 3, TERCEIRO: 3,
  QUARTA: 4, QUARTO: 4, QUINTA: 5, QUINTO: 5, SEXTA: 6, SEXTO: 6, SETIMA: 7, SETIMO: 7,
  OITAVA: 8, OITAVO: 8, NONA: 9, NONO: 9,
}
const DEZENAS: Record<string, number> = {
  DECIMA: 10, DECIMO: 10, VIGESIMA: 20, VIGESIMO: 20, TRIGESIMA: 30, TRIGESIMO: 30,
  QUADRAGESIMA: 40, QUADRAGESIMO: 40, QUINQUAGESIMA: 50, QUINQUAGESIMO: 50,
  SEXAGESIMA: 60, SEXAGESIMO: 60, SEPTUAGESIMA: 70, SETUAGESIMA: 70, SEPTUAGESIMO: 70,
  OCTOGESIMA: 80, OCTOGESIMO: 80, NONAGESIMA: 90, NONAGESIMO: 90, CENTESIMA: 100, CENTESIMO: 100,
}

const semAcento = (s: string) => s.normalize("NFD").replace(/\p{M}/gu, "")

/** "TRIGÉSIMA OITAVA" → 38; "1ª" → 1; "12" → 12; inválido → null. */
export function numeroDaClausula(rotulo: string): number | null {
  const r = semAcento(rotulo).toUpperCase().trim()
  const digitos = r.match(/^(\d{1,3})/)
  if (digitos) return Number(digitos[1])
  let total = 0
  const palavras = r.split(/[\s-]+/).filter(Boolean)
  if (palavras.length === 0) return null
  for (const p of palavras) {
    if (p === "E") continue
    if (DEZENAS[p] !== undefined) total += DEZENAS[p]
    else if (UNIDADES[p] !== undefined) total += UNIDADES[p]
    else return null
  }
  return total > 0 ? total : null
}

// Palavras ordinais aceitas no cabeçalho (sem acento, maiúsculas).
const ORDINAIS = [...Object.keys(UNIDADES), ...Object.keys(DEZENAS)].join("|")

// "CLÁUSULA" + (número com ª/º/°/. opcional | ordinais por extenso) + separador + título.
const CABECALHO = new RegExp(
  String.raw`^\s*CLAUSULA\s+(\d{1,3}\s*[ªºAO°]?|(?:(?:${ORDINAIS})(?:\s+|\s*-\s*)?)+)\s*(?:[.\-–—:)]\s*)?(.*)$`,
  "i"
)

/** Tira linhas que se repetem em muitas páginas (cabeçalho, rodapé, número de página). */
function limparPaginas(paginas: string[]): { linhas: string[]; removidas: string[] } {
  // Compara sem os números: "Página 3 de 20" e "Página 4 de 20" são o mesmo rodapé.
  const chave = (l: string) => l.replace(/\d+/g, "#")
  const contagem = new Map<string, number>()
  for (const p of paginas) {
    for (const l of new Set(p.split("\n").map((x) => chave(x.trim())).filter(Boolean))) {
      contagem.set(l, (contagem.get(l) ?? 0) + 1)
    }
  }
  const minimo = Math.max(3, Math.ceil(paginas.length * 0.4))
  const repetidas = new Set(
    [...contagem].filter(([l, n]) => n >= minimo && l.length <= 160).map(([l]) => l)
  )
  const linhas: string[] = []
  for (const p of paginas) {
    for (const bruta of p.split("\n")) {
      const l = bruta.replace(/\s+$/g, "")
      const t = l.trim()
      if (repetidas.has(chave(t))) continue
      if (/^\d{1,3}$/.test(t)) continue // número de página solto
      if (/^(p[áa]gina\s+)?\d{1,3}\s*(de|\/)\s*\d{1,3}$/i.test(t)) continue
      linhas.push(l)
    }
  }
  return { linhas, removidas: [...repetidas] }
}

/** Junta "CLÁUSULA" sozinha na linha com a linha seguinte ("CLÁUSULA\nQUARTA -"). */
function juntarCabecalhosQuebrados(linhas: string[]): string[] {
  const saida: string[] = []
  for (let i = 0; i < linhas.length; i++) {
    const t = semAcento(linhas[i]).trim().toUpperCase()
    if (/^CLAUSULA$/.test(t) && i + 1 < linhas.length) {
      saida.push(`${linhas[i].trim()} ${linhas[i + 1].trim()}`)
      i++
    } else {
      saida.push(linhas[i])
    }
  }
  return saida
}

// Onde acabam as cláusulas: anexos, tabelas soltas e o bloco de assinaturas.
const FIM_DAS_CLAUSULAS = [
  /^ANEXOS?\b/,
  /^Anexos?\s+([IVX]+|\d+|[ÚU]nico)\b/,
  /^assinam\s*:?$/i,
  /^(e,?\s+)?por estarem (justos|de acordo|assim)/i,
  /^pel[oa]s?\s+(o\s+|a\s+)?(sindicato|sindipetro|empresa|companhia|federa)/i,
  // "Rio de Janeiro, ____" / "Macaé, 10 de maio de 2025"
  /^[A-Z][A-Za-z ]{2,40},\s*(_{3,}|\d{1,2}\s+de\s+[a-z]+)/,
]

// Política interna numerada por seção: "1. Abrangência", "2) Degraus de Resultado".
const SECAO = /^\s*(\d{1,2})\s*[.)–-]\s+([A-Z][^\n]{1,90})$/

type Marco = { linha: number; numero: number; rotulo: string; titulo: string; fimCorpo?: number }

/** Candidatos a cabeçalho filtrados pela SEQUÊNCIA (cada um é o próximo, ou pula até 2). */
function encontrarMarcos(linhas: string[], padrao: RegExp): { marcos: Marco[]; lacunas: number[] } {
  const candidatos: Marco[] = []
  for (let i = 0; i < linhas.length; i++) {
    const m = semAcento(linhas[i]).match(padrao)
    if (!m) continue
    const numero = numeroDaClausula(m[1])
    if (numero === null) continue
    // Recupera o título com acentos a partir da linha original (mesmo comprimento).
    const original = linhas[i]
    const titulo = original.slice(original.length - m[2].length).trim()
    // "Cláusula 5 deste acordo…" é citação no corpo, não cabeçalho.
    if (/^[a-zà-ú]/.test(titulo)) continue
    candidatos.push({ linha: i, numero, rotulo: m[1].trim(), titulo })
  }
  const marcos: Marco[] = []
  const lacunas: number[] = []
  let esperado = 1
  for (const c of candidatos) {
    if (c.numero >= esperado && c.numero <= esperado + 2) {
      for (let n = esperado; n < c.numero; n++) lacunas.push(n)
      marcos.push(c)
      esperado = c.numero + 1
    }
  }
  return { marcos, lacunas }
}

/**
 * Linhas de grupo temático logo antes de um cabeçalho: curtas, começam em
 * maiúscula, não terminam em pontuação, e a linha anterior a elas fecha frase.
 */
function grupoAntes(linhas: string[], de: number, ate: number): { texto: string; inicio: number } | null {
  let i = ate - 1
  const partes: string[] = []
  while (i >= de && partes.length < 2) {
    const t = linhas[i].trim()
    if (!t) {
      i--
      continue
    }
    if (t.length > 70 || /[.:;,!?)]$/.test(t) || !/^[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(t) || /^(par[áa]grafo|§)/i.test(t)) break
    partes.unshift(t)
    i--
  }
  if (partes.length === 0) return null
  // A linha que antecede o grupo precisa fechar frase — senão é continuação do corpo.
  let j = i
  while (j >= de && !linhas[j].trim()) j--
  if (j >= de && !/[.:;!?)]$/.test(linhas[j].trim())) return null
  return { texto: partes.join(" · "), inicio: i + 1 }
}

/**
 * Separa o documento. `paginas` = texto de cada página (na ordem); passar uma
 * só string também funciona (sem a limpeza de cabeçalho/rodapé).
 */
export function separarClausulas(paginas: string[] | string): Separacao {
  const lista = (Array.isArray(paginas) ? paginas : [paginas]).map((p) =>
    p.replace(/DocuSign Envelope ID:\s*[0-9A-F-]{30,40}/gi, "")
  )
  const { linhas: limpas, removidas } =
    lista.length > 1 ? limparPaginas(lista) : { linhas: lista[0].split("\n"), removidas: [] }
  const linhas = juntarCabecalhosQuebrados(limpas)

  // 1º o formato de acordo ("CLÁUSULA …"); se quase nada casar, o de política
  // interna numerada por seção ("1. Abrangência").
  let { marcos, lacunas } = encontrarMarcos(linhas, CABECALHO)
  if (marcos.length < 3) {
    const secoes = encontrarMarcos(linhas, SECAO)
    if (secoes.marcos.length > marcos.length) ({ marcos, lacunas } = secoes)
  }

  // Anexos depois da última cláusula (linha "ANEXO I – …"): saem da última cláusula.
  let fimDasClausulas = linhas.length
  if (marcos.length > 0) {
    const ultima = marcos[marcos.length - 1].linha
    for (let i = ultima + 1; i < linhas.length; i++) {
      const tl = linhas[i].trim()
      if (tl.length <= 120 && FIM_DAS_CLAUSULAS.some((re) => re.test(semAcento(tl)))) {
        fimDasClausulas = i
        break
      }
    }
    marcos[marcos.length - 1].fimCorpo = fimDasClausulas
  }

  // Grupo temático do MTE ("Salários, Reajustes e Pagamento") logo antes do
  // cabeçalho: sai do fim da cláusula anterior e vira o grupo da seguinte.
  const grupos = new Map<number, string>()
  for (let k = 1; k < marcos.length; k++) {
    const g = grupoAntes(linhas, marcos[k - 1].linha + 1, marcos[k].linha)
    if (g) grupos.set(k, g.texto)
    if (g) marcos[k - 1].fimCorpo = g.inicio
  }

  const clausulas: ClausulaSeparada[] = marcos.map((m, k) => {
    const fim = m.fimCorpo ?? (k + 1 < marcos.length ? marcos[k + 1].linha : linhas.length)
    let corpo = linhas.slice(m.linha + 1, fim)
    let titulo = m.titulo
    // Título que continua na linha de baixo, em CAIXA ALTA (ex.: "...RESULTADO PARA / FINS DE CÁLCULO").
    if (titulo && titulo === titulo.toUpperCase() && corpo.length > 0) {
      const prox = corpo[0].trim()
      if (prox && prox.length <= 80 && prox === prox.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]{3}/.test(prox)) {
        titulo = `${titulo} ${prox}`
        corpo = corpo.slice(1)
      }
    }
    // Cabeçalho sem título na mesma linha ("CLÁUSULA 7ª –" / "Cláusula 3.") → 1ª linha do corpo.
    if (!titulo && corpo.length > 0 && corpo[0].trim().length <= 120) {
      titulo = corpo[0].trim()
      corpo = corpo.slice(1)
    }
    return {
      numero: m.numero,
      rotuloNumero: m.rotulo,
      titulo: titulo.replace(/\s+/g, " ").replace(/^[-–—.:\s]+/, "").trim(),
      grupo: grupos.get(k) ?? null,
      texto: arrumarTexto(corpo.join("\n")),
    }
  })

  const preambulo = arrumarTexto(linhas.slice(0, marcos[0]?.linha ?? linhas.length).join("\n"))
  const anexos = arrumarTexto(linhas.slice(fimDasClausulas).join("\n"))
  return { preambulo, clausulas, linhasRemovidas: removidas, lacunas, anexos }
}

/** Junta as quebras de linha do meio da frase (o PDF quebra por largura, não por parágrafo). */
export function arrumarTexto(t: string): string {
  const linhas = t.replace(/[ \t]+\n/g, "\n").split("\n")
  const saida: string[] = []
  for (const bruta of linhas) {
    const l = bruta.trim()
    const anterior = saida.length ? saida[saida.length - 1] : null
    const continua =
      anterior !== null &&
      l !== "" &&
      anterior !== "" &&
      !/[.:;!?]$/.test(anterior) &&
      !INICIO_DE_PARAGRAFO.test(l) &&
      // Linha curta sem ponto final é título/tabela — só junta se a seguinte começa em minúscula.
      (anterior.length >= 55 || /^[a-zà-ú0-9(]/.test(l))
    if (continua) saida[saida.length - 1] = `${anterior} ${l}`
    else saida.push(l)
  }
  return saida
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

// Começo de parágrafo/inciso: não é continuação da linha de cima.
const INICIO_DE_PARAGRAFO =
  /^(par[áa]grafo|§|[a-z]\)|[ivxlc]+\s*[-–—.)]\s|\d+(\.\d+)*\s*[-–—.)]\s|[●•▪◦*–-]\s|cl[áa]usula\s)/i
