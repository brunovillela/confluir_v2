/**
 * Saúde — constantes client-safe (sem "server-only"), usadas por forms e
 * badges. A camada de dados fica em lib/db/saude.ts.
 *
 * Os agrupamentos abaixo existem porque o dado migrado do Bubble tem
 * variantes de caixa e digitação para o mesmo valor. Medido em 20/07/2026
 * sobre as 13.086 CATs: `tipo_acidente` tem 5 valores distintos para 3
 * conceitos, `trabalhador_sexo` tem 10 para 2. Filtrar pelo texto cru
 * deixaria registros de fora, então cada opção de filtro carrega a lista
 * de variantes que ela cobre.
 */

/** Tipos de acidente (CAT campo 22) e as variantes que cada um cobre. */
export const TIPOS_ACIDENTE = [
  { valor: "tipico", rotulo: "Típico", variantes: ["Típico", "TIPICO", "1 - Típico", "Tipico"] },
  { valor: "trajeto", rotulo: "Trajeto", variantes: ["Trajeto", "TRAJETO", "2 - Trajeto"] },
  {
    valor: "doenca",
    rotulo: "Doença ocupacional",
    variantes: ["Doença Ocupacional", "DOENÇA OCUPACIONAL", "Doenca Ocupacional", "3 - Doença Ocupacional"],
  },
] as const

export type TipoAcidente = (typeof TIPOS_ACIDENTE)[number]["valor"]

export function variantesDoTipo(valor: string): string[] | null {
  return TIPOS_ACIDENTE.find((t) => t.valor === valor)?.variantes.slice() ?? null
}

/** Rótulo curto do tipo, tolerando as variantes do legado. */
export function rotuloTipoAcidente(bruto: string | null): string | null {
  if (!bruto) return null
  const achado = TIPOS_ACIDENTE.find((t) =>
    t.variantes.some((v) => v.toLowerCase() === bruto.trim().toLowerCase())
  )
  return achado?.rotulo ?? bruto
}

/** Campos ordenáveis da listagem de CATs (usados na URL como ?ordem=). */
export const ORDENS_CAT = {
  data: { coluna: "data_acidente", rotulo: "Data do acidente" },
  numero: { coluna: "numero_cat", rotulo: "Nº da CAT" },
  trabalhador: { coluna: "trabalhador_nome", rotulo: "Acidentado" },
  empregador: { coluna: "empregador_razao_social", rotulo: "Empregador" },
  municipio: { coluna: "local_municipio", rotulo: "Município" },
} as const

export type OrdemCat = keyof typeof ORDENS_CAT

export function lerOrdem(valor: string | undefined): OrdemCat {
  return valor && valor in ORDENS_CAT ? (valor as OrdemCat) : "data"
}

export function lerDirecao(valor: string | undefined): "asc" | "desc" {
  return valor === "asc" ? "asc" : "desc"
}

/**
 * Filtros de sim/não. Cada um aponta para a coluna que REALMENTE tem dado:
 * o campo 23 (houve_afastamento) só foi preenchido em 8 dos 13.086
 * registros, enquanto o campo 44 tem 1.819 sim / 11.189 não — então o
 * filtro de afastamento usa o 44. Ver nota em lib/db/saude.ts.
 */
export const FILTROS_BOOLEANOS = {
  afastamento: {
    coluna: "afastamento_durante_tratamento",
    rotulo: "Afastamento do trabalho",
  },
  internacao: { coluna: "houve_internacao", rotulo: "Internação" },
  obito: { coluna: "houve_morte", rotulo: "Óbito" },
} as const

export type FiltroBooleano = keyof typeof FILTROS_BOOLEANOS

/** Situação da descrição — expõe a fila de revisão da migração. */
export const OPCOES_REVISAO = [
  { valor: "todas", rotulo: "Todas as descrições" },
  { valor: "completas", rotulo: "Com código oficial" },
  { valor: "truncadas", rotulo: "Sem código (revisar)" },
] as const
