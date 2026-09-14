/**
 * Etiquetas para os Correios — gabaritos Pimaco, opções de impressão e os
 * filtros de quem recebe. Seguro para o client (tela, PDF e CSV usam o mesmo).
 */

import { FILIACAO_CONDICOES } from "@/lib/filiacao"

/** Pontos por milímetro (PDF trabalha em pontos: 72 por polegada). */
export const MM = 72 / 25.4

export type ModeloEtiqueta = {
  /** Código de referência (o mais vendido da família). */
  codigo: string
  /** Mesmos gabarito e medidas, com outro código na embalagem. */
  equivalentes: string[]
  folha: "carta" | "a4"
  /** Medidas em mm. */
  altura: number
  largura: number
  linhas: number
  colunas: number
  margemSuperior: number
  margemEsquerda: number
  /** Do início de uma etiqueta ao início da próxima. */
  passoVertical: number
  passoHorizontal: number
  indicacao: string
}

export const FOLHAS = {
  carta: { rotulo: "Carta", largura: 215.9, altura: 279.4 },
  a4: { rotulo: "A4", largura: 210, altura: 297 },
} as const

/**
 * Só os gabaritos que comportam um endereço (altura ≥ 25 mm, largura ≥ 63 mm)
 * e seguem no catálogo da Pimaco. Medidas conferidas em 14/09/2026 em três
 * fontes da própria Pimaco — a tabela "Parâmetros de impressão", os gabaritos
 * do Word (geometria em twips) e a API de produtos do editor
 * (editor.pimaco.com.br). ATENÇÃO: 6181–6184 e 6187 NÃO são iguais às Avery
 * 5161–5164/5167 — passo e margens diferem; usar os números da Pimaco.
 * O espaço vertical entre etiquetas é zero em todos (passo = altura).
 * Séries com o mesmo gabarito mudam só as folhas por pacote: Carta 60xx=10,
 * 62xx=25, 61xx=100, 625xx=250, SL610xx=1.000; A4 A42xx=25, A43xx=100.
 */
export const MODELOS_PIMACO: ModeloEtiqueta[] = [
  // ── Carta (215,9 × 279,4 mm) ──
  {
    codigo: "6180",
    equivalentes: ["6080", "6280", "62580", "SL61080"],
    folha: "carta",
    altura: 25.4,
    largura: 66.7,
    linhas: 10,
    colunas: 3,
    margemSuperior: 12.7,
    margemEsquerda: 4.8,
    passoVertical: 25.4,
    passoHorizontal: 69.8,
    indicacao: "A clássica da mala direta — nome e endereço em até 4 linhas",
  },
  {
    codigo: "6181",
    equivalentes: ["6081", "6281", "62581", "SL61081"],
    folha: "carta",
    altura: 25.4,
    largura: 101.6,
    linhas: 10,
    colunas: 2,
    margemSuperior: 12.7,
    margemEsquerda: 4.0,
    passoVertical: 25.4,
    passoHorizontal: 106.8,
    indicacao: "Mesma altura da 6180, mais larga: endereço longo sem letra miúda",
  },
  {
    codigo: "6182",
    equivalentes: ["6082", "6282", "62582", "SL61082"],
    folha: "carta",
    altura: 33.9,
    largura: 101.6,
    linhas: 7,
    colunas: 2,
    margemSuperior: 21.2,
    margemEsquerda: 4.0,
    passoVertical: 33.9,
    passoHorizontal: 106.8,
    indicacao: "Letra maior e folga para a matrícula — boa para envelope ofício",
  },
  {
    codigo: "6183",
    equivalentes: ["6083", "6283", "SL61083"],
    folha: "carta",
    altura: 50.8,
    largura: 101.6,
    linhas: 5,
    colunas: 2,
    margemSuperior: 12.7,
    margemEsquerda: 4.0,
    passoVertical: 50.8,
    passoHorizontal: 106.8,
    indicacao: "Etiqueta grande, leitura fácil — envelope saco e pacote",
  },
  {
    codigo: "6184",
    equivalentes: ["6284", "SL61084"],
    folha: "carta",
    altura: 84.67,
    largura: 101.6,
    linhas: 3,
    colunas: 2,
    margemSuperior: 12.7,
    margemEsquerda: 4.0,
    passoVertical: 84.67,
    passoHorizontal: 106.8,
    indicacao: "Para caixas e pacotes volumosos",
  },
  // ── A4 (210 × 297 mm) ──
  {
    codigo: "A4256",
    equivalentes: ["A4356"],
    folha: "a4",
    altura: 25.4,
    largura: 63.5,
    linhas: 11,
    colunas: 3,
    margemSuperior: 8.78,
    margemEsquerda: 7.2,
    passoVertical: 25.4,
    passoHorizontal: 66.09,
    indicacao: "A equivalente da 6180 em folha A4 — mais etiquetas por folha",
  },
  {
    codigo: "A4254",
    equivalentes: ["A4354"],
    folha: "a4",
    altura: 25.4,
    largura: 99.0,
    linhas: 11,
    colunas: 2,
    margemSuperior: 8.8,
    margemEsquerda: 4.69,
    passoVertical: 25.4,
    passoHorizontal: 101.6,
    indicacao: "Baixa e larga: endereço longo em A4",
  },
  {
    codigo: "A4255",
    equivalentes: ["A4355"],
    folha: "a4",
    altura: 31.0,
    largura: 63.5,
    linhas: 9,
    colunas: 3,
    margemSuperior: 9.0,
    margemEsquerda: 7.2,
    passoVertical: 31.0,
    passoHorizontal: 66.09,
    indicacao: "Um pouco mais alta que a A4256 — cabe a matrícula com folga",
  },
  {
    codigo: "A4262",
    equivalentes: ["A4362", "SLA41062"],
    folha: "a4",
    altura: 33.9,
    largura: 99.0,
    linhas: 8,
    colunas: 2,
    margemSuperior: 12.9,
    margemEsquerda: 4.69,
    passoVertical: 33.9,
    passoHorizontal: 101.6,
    indicacao: "Letra maior e folga para a matrícula em A4",
  },
  {
    codigo: "A4260",
    equivalentes: ["A4360"],
    folha: "a4",
    altura: 38.1,
    largura: 63.5,
    linhas: 7,
    colunas: 3,
    margemSuperior: 15.21,
    margemEsquerda: 7.2,
    passoVertical: 38.1,
    passoHorizontal: 66.09,
    indicacao: "Quadradinha e alta — leitura fácil",
  },
  {
    codigo: "A4263",
    equivalentes: ["A4363", "SLA41063"],
    folha: "a4",
    altura: 38.1,
    largura: 99.0,
    linhas: 7,
    colunas: 2,
    margemSuperior: 15.19,
    margemEsquerda: 4.69,
    passoVertical: 38.1,
    passoHorizontal: 101.6,
    indicacao: "Envelope ofício e saco, com folga",
  },
  {
    codigo: "A4361",
    equivalentes: [],
    folha: "a4",
    altura: 46.5,
    largura: 63.5,
    linhas: 6,
    colunas: 3,
    margemSuperior: 9.08,
    margemEsquerda: 7.2,
    passoVertical: 46.5,
    passoHorizontal: 66.09,
    indicacao: "Alta e estreita — letra grande em coluna",
  },
  {
    codigo: "A4250",
    equivalentes: ["A4350"],
    folha: "a4",
    altura: 55.79,
    largura: 99.0,
    linhas: 5,
    colunas: 2,
    margemSuperior: 9.0,
    margemEsquerda: 4.69,
    passoVertical: 55.79,
    passoHorizontal: 101.6,
    indicacao: "Etiqueta grande para envelope saco e pacote",
  },
  {
    codigo: "A4365",
    equivalentes: [],
    folha: "a4",
    altura: 67.81,
    largura: 99.0,
    linhas: 4,
    colunas: 2,
    margemSuperior: 13.0,
    margemEsquerda: 4.69,
    passoVertical: 67.81,
    passoHorizontal: 101.6,
    indicacao: "Para caixas e pacotes volumosos",
  },
]

export const MODELO_PADRAO = "6180"

export function modeloPorCodigo(codigo: string | undefined): ModeloEtiqueta {
  return (
    MODELOS_PIMACO.find((m) => m.codigo === codigo || m.equivalentes.includes(codigo ?? "")) ??
    MODELOS_PIMACO.find((m) => m.codigo === MODELO_PADRAO)!
  )
}

export const porFolha = (m: ModeloEtiqueta) => m.linhas * m.colunas

const virgula = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })

/** "25,4 × 66,7 mm" — altura × largura, como a Pimaco escreve na caixa. */
export const medidasDoModelo = (m: ModeloEtiqueta) => `${virgula(m.altura)} × ${virgula(m.largura)} mm`

export const codigosDoModelo = (m: ModeloEtiqueta) => [m.codigo, ...m.equivalentes].join(" / ")

/**
 * Área útil da etiqueta (pt) e o corpo máximo do texto. A margem interna
 * afasta o texto do corte — a folha nunca passa na impressora 100% no lugar.
 */
export function areaUtil(m: ModeloEtiqueta) {
  const margemX = Math.min(3, m.largura * 0.05) * MM
  const margemY = Math.min(2, m.altura * 0.06) * MM
  return {
    margemX,
    margemY,
    largura: m.largura * MM - 2 * margemX,
    altura: m.altura * MM - 2 * margemY,
    corpoMaximo: Math.min(12, Math.max(7, m.altura * 0.33)),
  }
}

// ── Lotes ───────────────────────────────────────────────────────────────────

/** Um PDF por lote: arquivo leve para gerar e para mandar à impressora. */
export const ETIQUETAS_POR_LOTE = 2000

export type Lote = { numero: number; de: number; ate: number; folhas: number }

/**
 * Divide as etiquetas em lotes de folhas inteiras. `inicio` é a posição da
 * primeira etiqueta na primeira folha (para aproveitar folha já usada).
 * `de`/`ate` contam a partir de 1, na ordem da lista.
 */
export function planoDeLotes(total: number, m: ModeloEtiqueta, inicio = 1): Lote[] {
  const pf = porFolha(m)
  const deslocamento = Math.min(Math.max(inicio, 1), pf) - 1
  const folhasPorLote = Math.max(1, Math.round(ETIQUETAS_POR_LOTE / pf))
  const totalFolhas = Math.ceil((total + deslocamento) / pf)
  const lotes: Lote[] = []
  for (let n = 0; n * folhasPorLote < totalFolhas; n++) {
    const primeiraPosicao = n * folhasPorLote * pf
    const ultimaPosicao = Math.min((n + 1) * folhasPorLote, totalFolhas) * pf
    const de = Math.max(0, primeiraPosicao - deslocamento)
    const ate = Math.min(total, ultimaPosicao - deslocamento)
    lotes.push({
      numero: n + 1,
      de: de + 1,
      ate,
      folhas: Math.min(folhasPorLote, totalFolhas - n * folhasPorLote),
    })
  }
  return lotes
}

// ── Filtros e opções (querystring) ─────────────────────────────────────────

export const CONDICAO_SEM = "sem_condicao"

export const CONDICOES_ETIQUETA = [
  ...FILIACAO_CONDICOES.map((c) => ({ valor: c as string, rotulo: c as string })),
  { valor: CONDICAO_SEM, rotulo: "Sem condição informada" },
]

export const ORDENS_ETIQUETA = [
  { valor: "cep", rotulo: "CEP (ordem de triagem dos Correios)" },
  { valor: "nome", rotulo: "Nome" },
  { valor: "cidade", rotulo: "UF e cidade" },
] as const

export type FiltrosEtiquetas = {
  condicoes: string[]
  situacao: string
  fonte?: string
  condicaoFonte?: string
  uf?: string
  cidade?: string
  busca?: string
  ordem: "cep" | "nome" | "cidade"
}

export type OpcoesEtiquetas = {
  modelo: ModeloEtiqueta
  inicio: number
  caixaAlta: boolean
  matricula: boolean
  contorno: boolean
  ajusteX: number
  ajusteY: number
}

export type ParametrosBrutos = Record<string, string | string[] | undefined>

/** A querystring de um route handler no formato do `searchParams` da página. */
export function parametrosDaUrl(busca: URLSearchParams): ParametrosBrutos {
  const brutos: ParametrosBrutos = {}
  for (const k of new Set(busca.keys())) {
    const valores = busca.getAll(k)
    brutos[k] = valores.length > 1 ? valores : valores[0]
  }
  return brutos
}

const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || undefined
const lista = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : [])

function milimetros(v: string | undefined): number {
  const n = Number((v ?? "").replace(",", "."))
  return Number.isFinite(n) ? Math.min(10, Math.max(-10, Math.round(n * 2) / 2)) : 0
}

export function lerFiltrosEtiquetas(p: ParametrosBrutos): FiltrosEtiquetas {
  const validas = new Set(CONDICOES_ETIQUETA.map((c) => c.valor))
  const condicoes = lista(p.cond).filter((c) => validas.has(c))
  const ordem = um(p.ordem)
  return {
    condicoes: condicoes.length ? condicoes : ["Ativo"],
    situacao: ["ativas", "excluidas", "todas"].includes(um(p.situacao) ?? "") ? um(p.situacao)! : "ativas",
    fonte: um(p.fonte),
    condicaoFonte: um(p.condicaoFonte),
    uf: um(p.uf),
    cidade: um(p.cidade),
    busca: um(p.busca),
    ordem: ordem === "nome" || ordem === "cidade" ? ordem : "cep",
  }
}

export function lerOpcoesEtiquetas(p: ParametrosBrutos): OpcoesEtiquetas {
  const modelo = modeloPorCodigo(um(p.modelo))
  const inicio = Number(um(p.inicio))
  return {
    modelo,
    inicio: Number.isInteger(inicio) ? Math.min(Math.max(inicio, 1), porFolha(modelo)) : 1,
    caixaAlta: um(p.caixaAlta) === "1",
    matricula: um(p.matricula) === "1",
    contorno: um(p.contorno) === "1",
    ajusteX: milimetros(um(p.ajusteX)),
    ajusteY: milimetros(um(p.ajusteY)),
  }
}

/** Querystring que reproduz filtros e opções (links de PDF, CSV e lotes). */
export function consultaEtiquetas(f: FiltrosEtiquetas, o: OpcoesEtiquetas): URLSearchParams {
  const q = new URLSearchParams()
  for (const c of f.condicoes) q.append("cond", c)
  q.set("situacao", f.situacao)
  for (const k of ["fonte", "condicaoFonte", "uf", "cidade", "busca"] as const) {
    const v = f[k]
    if (v && v !== "todas" && v !== "todos") q.set(k, v)
  }
  q.set("ordem", f.ordem)
  q.set("modelo", o.modelo.codigo)
  if (o.inicio > 1) q.set("inicio", String(o.inicio))
  if (o.caixaAlta) q.set("caixaAlta", "1")
  if (o.matricula) q.set("matricula", "1")
  if (o.contorno) q.set("contorno", "1")
  if (o.ajusteX) q.set("ajusteX", String(o.ajusteX))
  if (o.ajusteY) q.set("ajusteY", String(o.ajusteY))
  return q
}
