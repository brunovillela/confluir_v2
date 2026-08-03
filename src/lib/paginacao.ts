/**
 * Paginação dirigida por URL para listas renderizadas no servidor: a página
 * lê `?pagina=` e `?porPagina=` (com prefixo opcional quando há mais de uma
 * tabela na mesma página), fatia o array em memória e renderiza o
 * componente <Paginacao> (components/paginacao.tsx) no rodapé da tabela.
 *
 * Padrões combinados: 30 itens em páginas dedicadas à lista (título +
 * lista), 10 em páginas concorridas (lista dividindo espaço com cards,
 * formulários etc.).
 */

export const OPCOES_POR_PAGINA = [10, 30, 50, 100] as const

export type Paginacao = {
  pagina: number
  porPagina: number
}

export function lerPaginacao(
  params: Record<string, string | undefined>,
  padrao: number,
  prefixo = ""
): Paginacao {
  const chave = (nome: string) =>
    prefixo ? `${prefixo}${nome[0].toUpperCase()}${nome.slice(1)}` : nome
  const porPaginaBruto = Number(params[chave("porPagina")])
  const porPagina = (OPCOES_POR_PAGINA as readonly number[]).includes(
    porPaginaBruto
  )
    ? porPaginaBruto
    : padrao
  const paginaBruta = Number(params[chave("pagina")])
  const pagina =
    Number.isInteger(paginaBruta) && paginaBruta > 0 ? paginaBruta : 1
  return { pagina, porPagina }
}

export function paginar<T>(
  itens: T[],
  { pagina, porPagina }: Paginacao
): { linhas: T[]; pagina: number; totalPaginas: number; total: number } {
  const total = itens.length
  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const paginaValida = Math.min(pagina, totalPaginas)
  return {
    linhas: itens.slice((paginaValida - 1) * porPagina, paginaValida * porPagina),
    pagina: paginaValida,
    totalPaginas,
    total,
  }
}
