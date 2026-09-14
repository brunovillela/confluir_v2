/**
 * Etiquetas de endereçamento — o texto de cada etiqueta, já medido e quebrado
 * em linhas. Puro e seguro para o client: o PDF e a prévia da tela usam o
 * mesmo encaixe, então o que a tela mostra é o que sai na folha.
 *
 * A medida usa as larguras AFM das fontes-padrão do PDF (Helvetica e
 * Helvetica-Bold, em milésimos do corpo). Acento não muda a largura da letra
 * nessas fontes, então a letra acentuada mede como a letra-base.
 */

// Larguras dos caracteres 32 (espaço) a 126 (~), na ordem do ASCII.
const LARGURAS_REGULAR = [
  278, 278, 355, 556, 556, 889, 667, 191, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 278, 278, 584, 584, 584, 556,
  1015, 667, 667, 722, 722, 667, 611, 778, 722, 278, 500, 667, 556, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 278, 278, 278, 469, 556,
  333, 556, 556, 500, 556, 556, 278, 556, 556, 222, 222, 500, 222, 833, 556, 556,
  556, 556, 333, 500, 278, 556, 500, 722, 500, 500, 500, 334, 260, 334, 584,
]
const LARGURAS_NEGRITO = [
  278, 333, 474, 556, 556, 889, 722, 238, 333, 333, 389, 584, 278, 333, 278, 278,
  556, 556, 556, 556, 556, 556, 556, 556, 556, 556, 333, 333, 584, 584, 584, 611,
  975, 722, 722, 722, 722, 667, 611, 778, 722, 278, 556, 722, 611, 833, 722, 778,
  667, 778, 722, 667, 611, 722, 667, 944, 667, 667, 611, 333, 278, 333, 584, 556,
  333, 556, 611, 556, 611, 556, 333, 611, 611, 278, 278, 556, 278, 889, 611, 611,
  611, 611, 389, 556, 333, 611, 556, 778, 556, 556, 500, 389, 280, 389, 584,
]
// Fora do ASCII que aparece em endereço.
const LARGURAS_EXTRAS: Record<string, [number, number]> = {
  "º": [365, 365],
  "ª": [370, 370],
  "°": [400, 400],
  "–": [556, 556],
  "—": [1000, 1000],
  "…": [1000, 1000],
  "’": [222, 278],
  "“": [333, 500],
  "”": [333, 500],
  "\u00A0": [278, 278],
}

/** Largura do texto em pontos, no corpo `corpo`. */
export function larguraDoTexto(texto: string, corpo: number, negrito = false): number {
  const tabela = negrito ? LARGURAS_NEGRITO : LARGURAS_REGULAR
  let milesimos = 0
  for (const ch of texto) {
    const extra = LARGURAS_EXTRAS[ch]
    if (extra) {
      milesimos += extra[negrito ? 1 : 0]
      continue
    }
    const base = ch.normalize("NFD").charCodeAt(0)
    milesimos += base >= 32 && base <= 126 ? tabela[base - 32] : negrito ? 611 : 556
  }
  return (milesimos * corpo) / 1000
}

// ── Endereço no padrão dos Correios ────────────────────────────────────────

export type EnderecoPostal = {
  nome: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  cep: string | null
}

const limpo = (v: string | null | undefined) =>
  (v ?? "").replace(/\s+/g, " ").trim()

/**
 * CEP com 8 dígitos, ou null. Sete dígitos é CEP de São Paulo (começa em 0)
 * que perdeu o zero à esquerda numa planilha — recupera.
 */
export function normalizarCep(cep: string | null): string | null {
  const digitos = (cep ?? "").replace(/\D/g, "")
  if (digitos.length === 8) return digitos
  if (digitos.length === 7) return `0${digitos}`
  return null
}

export function formatarCepPostal(cep: string): string {
  return `${cep.slice(0, 5)}-${cep.slice(5)}`
}

/** O que falta para o endereço ser postável (vazio = completo). */
export function faltasDoEndereco(e: EnderecoPostal): string[] {
  const faltas: string[] = []
  if (!limpo(e.nome)) faltas.push("nome")
  if (!normalizarCep(e.cep)) faltas.push("CEP")
  if (!limpo(e.logradouro)) faltas.push("logradouro")
  if (!limpo(e.cidade)) faltas.push("cidade")
  if (!limpo(e.uf)) faltas.push("UF")
  return faltas
}

const SIGLAS_UF: Record<string, string> = {
  acre: "AC", alagoas: "AL", amapa: "AP", amazonas: "AM", bahia: "BA", ceara: "CE",
  "distrito federal": "DF", "espirito santo": "ES", goias: "GO", maranhao: "MA",
  "mato grosso": "MT", "mato grosso do sul": "MS", "minas gerais": "MG", para: "PA",
  paraiba: "PB", parana: "PR", pernambuco: "PE", piaui: "PI", "rio de janeiro": "RJ",
  "rio grande do norte": "RN", "rio grande do sul": "RS", rondonia: "RO", roraima: "RR",
  "santa catarina": "SC", "sao paulo": "SP", sergipe: "SE", tocantins: "TO",
}

/** "rj", "Rio de Janeiro", "SE - Sergipe" → sigla; o que não reconhece, como veio. */
export function siglaDaUf(uf: string | null): string {
  const t = limpo(uf)
  const sigla = t.match(/^([A-Za-z]{2})(\s*[-–(].*)?$/)
  if (sigla) return sigla[1].toUpperCase()
  const nome = t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
  return SIGLAS_UF[nome] ?? t
}

/**
 * As quatro linhas do endereçamento (sem medir): destinatário; logradouro,
 * número e complemento; bairro; CEP e cidade/UF — a ordem que os Correios
 * pedem, com o CEP na última linha. Número "0" ou vazio sai do texto (no
 * cadastro migrado, o número costuma estar dentro do logradouro).
 * `inseparavel` cola o número e o traço do complemento à palavra anterior com
 * espaço inseparável, para a quebra de linha não abrir linha com ", 100" ou "- ".
 */
export function linhasDoEndereco(
  e: EnderecoPostal,
  caixaAlta = false,
  inseparavel = false
): { nome: string; endereco: string; bairro: string; cep: string; cidade: string } {
  const espaco = inseparavel ? "\u00A0" : " "
  const numero = limpo(e.numero)
  const temNumero = numero !== "" && !/^0+$/.test(numero)
  const endereco = [
    [limpo(e.logradouro), temNumero ? numero : ""].filter(Boolean).join(`,${espaco}`),
    limpo(e.complemento),
  ]
    .filter(Boolean)
    .join(`${espaco}- `)
  const cep = normalizarCep(e.cep)
  const cidade = [limpo(e.cidade), siglaDaUf(e.uf)].filter(Boolean).join("/")
  const alta = (t: string) => (caixaAlta ? t.toLocaleUpperCase("pt-BR") : t)
  return {
    nome: alta(limpo(e.nome)),
    endereco: alta(endereco),
    bairro: alta(limpo(e.bairro)),
    cep: cep ? formatarCepPostal(cep) : "",
    cidade: alta(cidade),
  }
}

// ── Encaixe na etiqueta ────────────────────────────────────────────────────

export type LinhaEncaixada = {
  texto: string
  corpo: number
  negrito: boolean
  /** Deslocamento do topo da linha a partir do topo da área útil, em pt. */
  topo: number
  alinhamento: "esquerda" | "direita"
}

export type BlocoDeTexto = {
  texto: string
  negrito?: boolean
  /** Máximo de linhas em que o bloco pode quebrar. */
  maxLinhas: number
  /** Corpo relativo ao corpo do texto (ex.: 0,8 para uma linha menor). */
  escala?: number
  alinhamento?: "esquerda" | "direita"
  /** Pode sair da etiqueta quando nada mais cabe. */
  dispensavel?: boolean
}

const ENTRELINHA = 1.18
// Folga contra arredondamento na renderização: nunca encostar na borda útil.
const FOLGA = 0.97

function quebrar(texto: string, largura: number, corpo: number, negrito: boolean): string[] {
  const linhas: string[] = []
  let atual = ""
  for (const palavra of texto.split(" ").filter(Boolean)) {
    const tentativa = atual ? `${atual} ${palavra}` : palavra
    if (larguraDoTexto(tentativa, corpo, negrito) <= largura) {
      atual = tentativa
      continue
    }
    if (atual) linhas.push(atual)
    // Palavra que sozinha não cabe: parte por caractere.
    let resto = palavra
    while (larguraDoTexto(resto, corpo, negrito) > largura && resto.length > 1) {
      let corte = resto.length - 1
      while (corte > 1 && larguraDoTexto(resto.slice(0, corte), corpo, negrito) > largura) corte--
      linhas.push(resto.slice(0, corte))
      resto = resto.slice(corte)
    }
    atual = resto
  }
  if (atual) linhas.push(atual)
  return linhas
}

function reticencias(texto: string, largura: number, corpo: number, negrito: boolean): string {
  if (larguraDoTexto(texto, corpo, negrito) <= largura) return texto
  let t = texto
  while (t.length > 1 && larguraDoTexto(`${t}…`, corpo, negrito) > largura) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/**
 * Encaixa os blocos na área útil (pt): procura o MAIOR corpo, entre
 * `corpoMaximo` e `corpoMinimo`, em que todo bloco cabe no seu limite de
 * linhas e a altura total cabe na etiqueta. Se nem no mínimo couber, corta
 * com reticências (o bloco perde as últimas palavras, não a etiqueta).
 * O conjunto sai centralizado na vertical.
 */
export function encaixarBlocos(
  blocos: BlocoDeTexto[],
  largura: number,
  altura: number,
  corpoMaximo: number,
  corpoMinimo = 6
): LinhaEncaixada[] {
  const util = largura * FOLGA
  const visiveis = blocos.filter((b) => b.texto)

  const montar = (corpoBase: number, forcar: boolean, lista = visiveis) => {
    const saida: Omit<LinhaEncaixada, "topo">[] = []
    let alturaTotal = 0
    for (const b of lista) {
      const corpo = corpoBase * (b.escala ?? 1)
      const negrito = b.negrito ?? false
      let linhas = quebrar(b.texto, util, corpo, negrito)
      if (linhas.length > b.maxLinhas) {
        if (!forcar) return null
        const cabem = linhas.slice(0, b.maxLinhas)
        const ultima = [cabem[cabem.length - 1], ...linhas.slice(b.maxLinhas)].join(" ")
        cabem[cabem.length - 1] = reticencias(ultima, util, corpo, negrito)
        linhas = cabem
      }
      for (const texto of linhas) {
        saida.push({ texto, corpo, negrito, alinhamento: b.alinhamento ?? "esquerda" })
        alturaTotal += corpo * ENTRELINHA
      }
    }
    if (alturaTotal > altura && !forcar) return null
    return { saida, alturaTotal }
  }

  let resultado: ReturnType<typeof montar> = null
  for (let corpo = corpoMaximo; corpo >= corpoMinimo; corpo -= 0.25) {
    resultado = montar(corpo, false)
    if (resultado) break
  }
  if (!resultado) {
    // Nem no mínimo: reticências no limite de linhas; se ainda sobrar altura,
    // uma linha por bloco; e, por fim, saem os blocos dispensáveis (os de
    // `dispensavel`), nunca o destinatário nem o CEP.
    resultado = montar(corpoMinimo, true)!
    let lista = visiveis.map((b) => ({ ...b, maxLinhas: 1 }))
    while (resultado.alturaTotal > altura) {
      resultado = montar(corpoMinimo, true, lista)!
      if (resultado.alturaTotal <= altura) break
      const i = lista.findIndex((b) => b.dispensavel)
      if (i < 0) break
      lista = lista.filter((_, j) => j !== i)
    }
  }

  let topo = Math.max(0, (altura - resultado.alturaTotal) / 2)
  return resultado.saida.map((l) => {
    const linha = { ...l, topo }
    topo += l.corpo * ENTRELINHA
    return linha
  })
}

/** Blocos de uma etiqueta de destinatário. */
export function blocosDoDestinatario(
  e: EnderecoPostal,
  opcoes: { caixaAlta?: boolean; referencia?: string | null } = {}
): BlocoDeTexto[] {
  const l = linhasDoEndereco(e, opcoes.caixaAlta, true)
  return [
    ...(opcoes.referencia
      ? [
          {
            texto: opcoes.referencia,
            maxLinhas: 1,
            escala: 0.75,
            alinhamento: "direita" as const,
            dispensavel: true,
          },
        ]
      : []),
    { texto: l.nome, negrito: true, maxLinhas: 2 },
    { texto: l.endereco, maxLinhas: 2 },
    { texto: l.bairro, maxLinhas: 1, dispensavel: true },
    { texto: [l.cep, l.cidade].filter(Boolean).join("  "), maxLinhas: 1 },
  ]
}
