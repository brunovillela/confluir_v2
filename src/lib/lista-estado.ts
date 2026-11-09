/**
 * Recorte de uma lista na URL (página, itens por página, filtros, busca,
 * ordem, aba) para os botões das linhas não devolverem o usuário à página 1.
 *
 * O "Editar" de uma linha leva o recorte junto (`urlNaLista`) e a action, ao
 * salvar, devolve à mesma URL (`voltarNaLista`, em lista-estado-servidor.ts)
 * com uma âncora na linha, para a tela não pular para o topo.
 *
 * Seguro para o client (sem `server-only`).
 */

/**
 * Parâmetros que não fazem parte do recorte: avisos de uma ação já feita
 * ("Salvo", "Excluído"…) e os que abrem um formulário. Não voltam na URL.
 */
export const PARAMS_DE_ACAO = new Set([
  "salvo",
  "salva",
  "criado",
  "criada",
  "excluido",
  "excluida",
  "transferido",
  "recalculadas",
  "parada",
  "erro_cascata",
  "erro",
  "ok",
  "aviso",
  "linha",
  "editar",
  "novo",
])

type Params =
  | URLSearchParams
  | Record<string, string | string[] | undefined>

/** O recorte da lista nos parâmetros da URL, sem os de ação e aviso. */
export function recorteDaLista(params: Params): URLSearchParams {
  const recorte = new URLSearchParams()
  const entradas =
    params instanceof URLSearchParams
      ? [...params.entries()]
      : Object.entries(params).flatMap(([k, v]) =>
          v === undefined ? [] : (Array.isArray(v) ? v : [v]).map((x) => [k, x] as [string, string])
        )
  for (const [k, v] of entradas) {
    if (PARAMS_DE_ACAO.has(k) || v === "") continue
    recorte.append(k, v)
  }
  return recorte
}

/**
 * `caminho` com o recorte da lista mais os parâmetros novos (`extras`; valor
 * null/undefined remove) e a âncora da linha. `extras` também aceita a forma
 * "a=1&b=2" (com ou sem & no começo).
 */
export function urlNaLista(
  caminho: string,
  recorte: URLSearchParams,
  extras: Record<string, string | null | undefined> | string = {},
  ancora?: string
): string {
  const q = new URLSearchParams(recorte)
  const novos =
    typeof extras === "string"
      ? Object.fromEntries(new URLSearchParams(extras.replace(/^[&?]/, "")))
      : extras
  for (const [k, v] of Object.entries(novos)) {
    if (v === null || v === undefined || v === "") q.delete(k)
    else q.set(k, v)
  }
  const query = q.toString()
  return `${caminho}${query ? `?${query}` : ""}${ancora ? `#${ancora}` : ""}`
}

/**
 * Página (1, 2…) em que está o item `indice` de uma lista paginada: para abrir
 * na página certa a linha que se está editando ou que acabou de ser salva.
 */
export function paginaDoIndice(indice: number, porPagina: number): number {
  return indice < 0 ? 1 : Math.floor(indice / porPagina) + 1
}
