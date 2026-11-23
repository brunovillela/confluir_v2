import { somarDias } from "./deliberacoes-constantes"
import { segundaDaSemana } from "./nucleo-constantes"

/**
 * ONDA 4 (acompanhamento, 23/11/2026): menções na conversa da tarefa, filtros
 * salvos e as contas dos painéis por departamento. Só funções puras (servem
 * ao cliente e ao servidor); testes em tests/unidade/ferramentas-acompanhamento.spec.ts.
 */

// ── Menções ─────────────────────────────────────────────────────────────────

export type PessoaMencionavel = { id: string; nome: string }

const LETRA = /[\p{L}\p{N}_]/u

/**
 * As menções do texto: "@Nome" de cada pessoa, sem diferença de maiúsculas,
 * seguido de algo que não seja letra ou número. O nome mais longo ganha
 * ("@Ana Paula" é a Ana Paula, não a Ana). Devolve os trechos na ordem do
 * texto, cada um com a pessoa.
 */
export function trechosMencionados(texto: string, pessoas: PessoaMencionavel[]): { inicio: number; fim: number; pessoa: PessoaMencionavel }[] {
  const minusculo = texto.toLocaleLowerCase("pt-BR")
  const ordenadas = [...pessoas].filter((p) => p.nome.trim()).sort((a, b) => b.nome.length - a.nome.length)
  const achados: { inicio: number; fim: number; pessoa: PessoaMencionavel }[] = []
  const ocupado = (i: number, f: number) => achados.some((a) => i < a.fim && f > a.inicio)
  for (const p of ordenadas) {
    const alvo = `@${p.nome.trim().toLocaleLowerCase("pt-BR")}`
    let de = 0
    for (;;) {
      const i = minusculo.indexOf(alvo, de)
      if (i < 0) break
      const f = i + alvo.length
      const antes = i > 0 ? texto[i - 1] : ""
      const depois = texto[f] ?? ""
      if (!LETRA.test(antes) && !LETRA.test(depois) && !ocupado(i, f)) achados.push({ inicio: i, fim: f, pessoa: p })
      de = f
    }
  }
  return achados.sort((a, b) => a.inicio - b.inicio)
}

/** Os ids das pessoas mencionadas no texto (sem repetir). */
export function mencoesNoTexto(texto: string, pessoas: PessoaMencionavel[]): string[] {
  return [...new Set(trechosMencionados(texto, pessoas).map((t) => t.pessoa.id))]
}

/** O texto em pedaços, com as menções marcadas (para destacar na conversa). */
export function partesComMencoes(texto: string, pessoas: PessoaMencionavel[]): { texto: string; mencao: boolean }[] {
  const partes: { texto: string; mencao: boolean }[] = []
  let cursor = 0
  for (const t of trechosMencionados(texto, pessoas)) {
    if (t.inicio > cursor) partes.push({ texto: texto.slice(cursor, t.inicio), mencao: false })
    partes.push({ texto: texto.slice(t.inicio, t.fim), mencao: true })
    cursor = t.fim
  }
  if (cursor < texto.length) partes.push({ texto: texto.slice(cursor), mencao: false })
  return partes
}

/**
 * A palavra que está sendo digitada depois de "@" (o que o seletor de
 * menção filtra), ou null se o cursor não está numa menção. Aceita espaço
 * dentro do nome ("@Ana Pa"), até 30 caracteres.
 */
export function mencaoEmDigitacao(texto: string, cursor: number): { inicio: number; busca: string } | null {
  const antes = texto.slice(0, cursor)
  const i = antes.lastIndexOf("@")
  if (i < 0) return null
  if (i > 0 && LETRA.test(antes[i - 1])) return null
  const busca = antes.slice(i + 1)
  if (busca.length > 30 || /[\n@]/.test(busca) || /\s{2,}/.test(busca)) return null
  return { inicio: i, busca }
}

/** Compara sem acento e sem maiúsculas (o filtro do seletor de menção). */
export function semAcento(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("pt-BR")
}

// ── Filtros salvos ──────────────────────────────────────────────────────────

export const PAGINAS_FILTRO = ["tarefas", "demandas"] as const
export type PaginaFiltro = (typeof PAGINAS_FILTRO)[number]

/** Os parâmetros que cada página aceita num filtro salvo (o resto é ignorado). */
export const CHAVES_FILTRO: Record<PaginaFiltro, readonly string[]> = {
  tarefas: ["busca", "status", "responsavel", "minhas", "etiqueta", "departamento", "visao"],
  demandas: ["busca", "situacao", "responsavel", "departamento", "visao"],
}

export function ehPaginaFiltro(v: unknown): v is PaginaFiltro {
  return typeof v === "string" && (PAGINAS_FILTRO as readonly string[]).includes(v)
}

/**
 * A consulta em forma canônica: só as chaves da página, sem valores vazios,
 * em ordem alfabética, cada valor com até 120 caracteres. É o que se grava e
 * o que se compara para marcar o filtro ativo.
 */
export function consultaCanonica(pagina: PaginaFiltro, entrada: string | Record<string, string | string[] | undefined>): string {
  const origem =
    typeof entrada === "string"
      ? Object.fromEntries(new URLSearchParams(entrada.replace(/^\?/, "")).entries())
      : Object.fromEntries(Object.entries(entrada).map(([k, v]) => [k, Array.isArray(v) ? v[0] : v]))
  const p = new URLSearchParams()
  for (const chave of [...CHAVES_FILTRO[pagina]].sort()) {
    const v = String(origem[chave] ?? "").trim().slice(0, 120)
    if (v) p.set(chave, v)
  }
  return p.toString()
}

// ── Painéis por departamento ────────────────────────────────────────────────

/** As segundas-feiras das últimas `n` semanas, da mais antiga à desta semana. */
export function semanasAte(hoje: string, n: number): string[] {
  const atual = segundaDaSemana(hoje)
  return Array.from({ length: n }, (_, i) => somarDias(atual, -7 * (n - 1 - i)))
}

/** "2026-11-16" → "16/11". */
export function rotuloSemana(segunda: string): string {
  return `${segunda.slice(8, 10)}/${segunda.slice(5, 7)}`
}

export type ItemVazao = { criadaEm: string | null; concluidaEm: string | null }

/** Criadas e concluídas por semana (segunda a domingo), nas semanas dadas. */
export function vazaoPorSemana(itens: ItemVazao[], semanas: string[]): { criadas: number[]; concluidas: number[] } {
  const criadas = semanas.map(() => 0)
  const concluidas = semanas.map(() => 0)
  const indice = (data: string | null) => {
    if (!data) return -1
    const seg = segundaDaSemana(data.slice(0, 10))
    return semanas.indexOf(seg)
  }
  for (const it of itens) {
    const c = indice(it.criadaEm)
    if (c >= 0) criadas[c] += 1
    const f = indice(it.concluidaEm)
    if (f >= 0) concluidas[f] += 1
  }
  return { criadas, concluidas }
}

/** Dias entre duas datas ISO (só a parte da data). */
function dias(de: string, ate: string): number {
  const a = Date.UTC(+de.slice(0, 4), +de.slice(5, 7) - 1, +de.slice(8, 10))
  const b = Date.UTC(+ate.slice(0, 4), +ate.slice(5, 7) - 1, +ate.slice(8, 10))
  return Math.round((b - a) / 86_400_000)
}

/**
 * Tempo médio, em dias, da criação à conclusão das concluídas a partir de
 * `desde` (null se nenhuma). Conclusão antes da criação (dado migrado) não conta.
 */
export function tempoMedioDias(itens: ItemVazao[], desde: string): number | null {
  const prazos = itens
    .filter((i) => i.criadaEm && i.concluidaEm && i.concluidaEm.slice(0, 10) >= desde)
    .map((i) => dias(i.criadaEm as string, i.concluidaEm as string))
    .filter((d) => d >= 0)
  if (!prazos.length) return null
  return prazos.reduce((s, d) => s + d, 0) / prazos.length
}

/** "1 dia", "2,5 dias", "menos de 1 dia". */
export function rotuloDiasMedios(v: number | null): string {
  if (v == null) return "—"
  if (v < 1) return "menos de 1 dia"
  const n = Math.round(v * 10) / 10
  return `${n.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${n === 1 ? "dia" : "dias"}`
}
