/**
 * MODELO DA CARTA DE OPOSIÇÃO (14/11/2026). O texto da carta é um modelo com
 * referências entre colchetes — [NOME_COMPLETO], [CPF]… — que o sistema troca
 * pelos dados de cada oposição. A entidade tem um padrão (Oposição › Carta de
 * oposição) e cada campanha pode ter o seu; sem nenhum dos dois, vale
 * CARTA_PADRAO, que reproduz a carta de antes letra por letra.
 *
 * Sintaxe (pensada para quem não programa):
 * - linha em branco separa parágrafos;
 * - [REFERENCIA] é trocada pelo dado (ver REFERENCIAS_CARTA);
 * - {trecho} é OPCIONAL: some inteiro se alguma referência dentro dele estiver
 *   vazia (ex.: "{, matrícula [MATRICULA]}" para quem não tem matrícula);
 * - **texto** sai em negrito;
 * - um parágrafo só com [DECLARACAO] sai em destaque (caixa cinza), como antes.
 *
 * Cada oposição guarda o modelo que valia quando foi registrada
 * (oposicao_opositor.carta_modelo): mudar o texto depois não muda carta já
 * registrada nem invalida carta já assinada.
 */

export type ReferenciaCarta = {
  chave: string
  descricao: string
  exemplo: string
}

export const REFERENCIAS_CARTA: ReferenciaCarta[] = [
  { chave: "NOME_COMPLETO", descricao: "Nome completo do trabalhador", exemplo: "Maria da Silva Souza" },
  { chave: "CPF", descricao: "CPF do trabalhador", exemplo: "123.456.789-09" },
  { chave: "MATRICULA", descricao: "Matrícula na empresa (pode faltar)", exemplo: "004512" },
  { chave: "EMPRESA", descricao: "Fonte pagadora (pode faltar)", exemplo: "Empresa Exemplo S.A." },
  { chave: "CNPJ_EMPRESA", descricao: "CNPJ da fonte pagadora (pode faltar)", exemplo: "12.345.678/0001-90" },
  { chave: "ENTIDADE", descricao: "Nome da entidade sindical", exemplo: "Sindicato Exemplo" },
  { chave: "CAMPANHA", descricao: "Nome da campanha", exemplo: "Contribuição Assistencial 2026" },
  {
    chave: "DESCONTO",
    descricao: "O desconto, já com \"de\"/\"da\": o detalhe da campanha ou \"da contribuição assistencial\"",
    exemplo: "de 1% do salário-base, em parcela única",
  },
  { chave: "DETALHE_DESCONTO", descricao: "O detalhe do desconto, como cadastrado na campanha (pode faltar)", exemplo: "1% do salário-base, em parcela única" },
  { chave: "DECLARACAO", descricao: "A declaração que a pessoa aceitou (texto da campanha)", exemplo: "Declaro que não autorizo o desconto…" },
  { chave: "PROTOCOLO", descricao: "Número do protocolo da oposição", exemplo: "1234" },
  { chave: "DATA", descricao: "Data do registro, por extenso", exemplo: "14 de novembro de 2026" },
]

const CHAVES = new Set(REFERENCIAS_CARTA.map((r) => r.chave))

/** A carta de sempre, no formato de modelo. Muda só com nova versão do sistema. */
export const CARTA_PADRAO = [
  "Eu, **[NOME_COMPLETO]**, inscrito(a) no CPF sob o nº **[CPF]**{, matrícula [MATRICULA]}, trabalhador(a){ vinculado(a) à fonte pagadora **[EMPRESA]**}{, CNPJ [CNPJ_EMPRESA]}, venho, pela presente, manifestar de forma livre e expressa a minha **OPOSIÇÃO** ao desconto [DESCONTO]{ ([CAMPANHA])}, nos termos da legislação vigente.",
  "[DECLARACAO]",
  "Declaro estar ciente de que esta manifestação será encaminhada à entidade sindical e submetida à avaliação cabível.",
].join("\n\n")

export const MAX_CARTA_MODELO = 8000

export type ValoresCarta = Partial<Record<string, string | null>>

export type TrechoCarta = { texto: string; negrito: boolean }
export type ParagrafoCarta = { destaque: boolean; trechos: TrechoCarta[] }

/** Normaliza o texto salvo (quebras de linha, espaços nas pontas). */
export function normalizarModeloCarta(bruto: string): string {
  return bruto.replace(/\r\n?/g, "\n").trim()
}

/**
 * Confere o modelo antes de salvar: referência desconhecida (erro de
 * digitação some calado na carta), chaves e negrito sem par, e o nome e o CPF,
 * sem os quais a carta não identifica quem se opõe.
 */
export function conferirModeloCarta(modelo: string): string[] {
  const erros: string[] = []
  const texto = normalizarModeloCarta(modelo)
  if (!texto) return ["O texto da carta está vazio."]
  if (texto.length > MAX_CARTA_MODELO) erros.push(`O texto passa de ${MAX_CARTA_MODELO.toLocaleString("pt-BR")} caracteres.`)
  const desconhecidas = [...new Set([...texto.matchAll(/\[([^\]\n]*)\]/g)].map((m) => m[1]))].filter((c) => !CHAVES.has(c))
  if (desconhecidas.length > 0) {
    erros.push(
      `Referência${desconhecidas.length > 1 ? "s" : ""} desconhecida${desconhecidas.length > 1 ? "s" : ""}: ${desconhecidas
        .map((c) => `[${c}]`)
        .join(", ")}. Use só as da lista, em maiúsculas.`
    )
  }
  let nivel = 0
  for (const ch of texto) {
    if (ch === "{") nivel++
    if (ch === "}") nivel--
    if (nivel < 0 || nivel > 1) break
  }
  if (nivel !== 0) erros.push("Há chave { } sem par, ou uma dentro de outra: cada trecho opcional abre com { e fecha com }.")
  for (const p of texto.split(/\n\s*\n/)) {
    if ((p.match(/\*\*/g) ?? []).length % 2 !== 0) {
      erros.push("Há ** sem par: o negrito abre e fecha com ** no mesmo parágrafo.")
      break
    }
  }
  const foraDosOpcionais = texto.replace(/\{[^{}]*\}/g, "")
  for (const obrigatoria of ["NOME_COMPLETO", "CPF"]) {
    if (!foraDosOpcionais.includes(`[${obrigatoria}]`)) {
      erros.push(`A carta precisa de [${obrigatoria}] fora de trecho opcional, para identificar quem se opõe.`)
    }
  }
  return erros
}

const vazio = (v: string | null | undefined) => !v || !v.trim()

/** Troca as referências; desconhecida fica como está (a conferência avisa antes). */
function trocar(texto: string, valores: ValoresCarta): string {
  return texto.replace(/\[([A-Z_]+)\]/g, (m, chave: string) => (CHAVES.has(chave) ? (valores[chave] ?? "").trim() : m))
}

/**
 * Monta a carta: parágrafos com trechos em negrito. Trecho opcional com
 * referência vazia some; parágrafo que fica vazio some.
 */
export function montarCarta(modelo: string, valores: ValoresCarta): ParagrafoCarta[] {
  const paragrafos: ParagrafoCarta[] = []
  for (const bruto of normalizarModeloCarta(modelo).split(/\n\s*\n/)) {
    const soDeclaracao = bruto.trim() === "[DECLARACAO]"
    // {trecho}: some se alguma referência dentro dele estiver vazia.
    const semOpcionais = bruto.replace(/\{([^{}]*)\}/g, (_m, dentro: string) => {
      const refs = [...dentro.matchAll(/\[([A-Z_]+)\]/g)].map((r) => r[1]).filter((c) => CHAVES.has(c))
      return refs.some((c) => vazio(valores[c])) ? "" : dentro
    })
    const texto = trocar(semOpcionais, valores)
      .split("\n")
      .map((l) => l.replace(/[ \t]+/g, " ").trim())
      .join("\n")
      .trim()
    if (!texto.replace(/\*\*/g, "").trim()) continue
    const trechos: TrechoCarta[] = texto
      .split("**")
      .map((t, i) => ({ texto: t, negrito: i % 2 === 1 }))
      .filter((t) => t.texto.length > 0)
    paragrafos.push({ destaque: soDeclaracao, trechos })
  }
  return paragrafos
}

/** Os valores de exemplo, para a prévia da gestão. */
export function valoresDeExemplo(sem: { matricula?: boolean; empresa?: boolean } = {}): ValoresCarta {
  const v: ValoresCarta = Object.fromEntries(REFERENCIAS_CARTA.map((r) => [r.chave, r.exemplo]))
  if (sem.matricula) v.MATRICULA = null
  if (sem.empresa) {
    v.EMPRESA = null
    v.CNPJ_EMPRESA = null
  }
  return v
}

/** O texto plano da carta (trilha, testes, conferência). */
export function cartaEmTexto(paragrafos: ParagrafoCarta[]): string {
  return paragrafos.map((p) => p.trechos.map((t) => t.texto).join("")).join("\n\n")
}

/**
 * "31 de outubro de 2026" no fuso de São Paulo (A109). `confirmado_em` é ISO
 * em UTC e o servidor roda em UTC: sem o fuso, uma oposição das 22h de 31/10
 * saía datada de 1º de novembro — fora do prazo, num documento assinado.
 */
export function dataPorExtensoSP(iso: string | null): string {
  const d = iso ? new Date(iso) : new Date()
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(Number.isNaN(d.getTime()) ? new Date() : d)
}

/** Os dados de uma oposição, como a carta os recebe. */
export type DadosParaCarta = {
  organizacao: string | null
  nome: string | null
  cpf: string | null
  matricula: string | null
  empregador: string | null
  empregadorCnpj?: string | null
  campanha: string | null
  detalhe: string | null
  declaracao: string | null
  protocolo: number | null
  data: string | null
}

/** Os valores das referências para uma oposição. `cpf` formata o CPF (PDF inteiro, tela como a tela mostra). */
export function valoresDaCarta(d: DadosParaCarta, cpf: (c: string) => string): ValoresCarta {
  return {
    NOME_COMPLETO: d.nome ?? "—",
    CPF: d.cpf ? cpf(d.cpf) : "—",
    MATRICULA: d.matricula,
    EMPRESA: d.empregador,
    CNPJ_EMPRESA: d.empregadorCnpj ?? null,
    ENTIDADE: d.organizacao,
    CAMPANHA: d.campanha,
    DESCONTO: d.detalhe ? `de ${d.detalhe}` : "da contribuição assistencial",
    DETALHE_DESCONTO: d.detalhe,
    DECLARACAO: d.declaracao,
    PROTOCOLO: d.protocolo != null ? String(d.protocolo) : null,
    DATA: dataPorExtensoSP(d.data),
  }
}
