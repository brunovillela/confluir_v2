import { lerPaginacao } from "@/lib/paginacao"

/** Abas da página do empregador. `chave` = permissão necessária (null = a da página). */
export const ABAS_EMPREGADOR = [
  { chave: "visao", rotulo: "Visão geral", permissao: null },
  { chave: "acordos", rotulo: "Acordos", permissao: "acordos_coletivos" },
  { chave: "votacoes", rotulo: "Votações", permissao: "assembleias" },
  { chave: "oposicoes", rotulo: "Oposições", permissao: "oposicao" },
  { chave: "reunioes", rotulo: "Reuniões", permissao: null },
  { chave: "setoriais", rotulo: "Setoriais", permissao: null },
] as const
export type AbaEmpregador = (typeof ABAS_EMPREGADOR)[number]["chave"]

export type Params = Record<string, string | undefined>

export const POR_PAGINA_PADRAO = 30
const DATA = /^\d{4}-\d{2}-\d{2}$/

export function lerAbaEmpregador(v: string | undefined, permitidas: AbaEmpregador[]): AbaEmpregador {
  return permitidas.includes(v as AbaEmpregador) ? (v as AbaEmpregador) : "visao"
}

/** Ordem padrão de cada lista (o mais recente/relevante primeiro). */
const PADRAO: Partial<Record<AbaEmpregador, { ordem: string; dir: "asc" | "desc" }>> = {
  acordos: { ordem: "fim", dir: "desc" },
  votacoes: { ordem: "atividade", dir: "desc" },
  oposicoes: { ordem: "data", dir: "desc" },
  reunioes: { ordem: "data", dir: "desc" },
  setoriais: { ordem: "data", dir: "desc" },
}

/** Ordem (validada contra as colunas permitidas), direção, paginação e período. */
export function lerLista(aba: AbaEmpregador, p: Params, colunas: readonly string[]) {
  const padrao = PADRAO[aba] ?? { ordem: colunas[0], dir: "desc" as const }
  const ordem = p.ordem && colunas.includes(p.ordem) ? p.ordem : padrao.ordem
  const dir: "asc" | "desc" = p.dir === "asc" || p.dir === "desc" ? p.dir : padrao.dir
  return {
    ordem,
    dir,
    ...lerPaginacao(p, POR_PAGINA_PADRAO),
    de: p.de && DATA.test(p.de) ? p.de : null,
    ate: p.ate && DATA.test(p.ate) ? p.ate : null,
    busca: (p.busca ?? "").trim().slice(0, 80) || null,
  }
}
