import { lerPaginacao } from "@/lib/paginacao"
import { ORDENS_CONDUTOR, type OrdemLista } from "@/lib/db/veiculos-condutor"

/** Abas da página do condutor — cada uma é uma lista com filtros próprios. */
export const ABAS = [
  { chave: "movimentacoes", rotulo: "Movimentações" },
  { chave: "reservas", rotulo: "Reservas" },
  { chave: "abastecimentos", rotulo: "Abastecimentos" },
  { chave: "infracoes", rotulo: "Infrações" },
  { chave: "checklists", rotulo: "Checklists" },
] as const
export type Aba = (typeof ABAS)[number]["chave"]

export type Params = Record<string, string | undefined>

export const POR_PAGINA_PADRAO = 30

const DATA = /^\d{4}-\d{2}-\d{2}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function lerAba(v: string | undefined): Aba {
  return ABAS.some((a) => a.chave === v) ? (v as Aba) : "movimentacoes"
}

/** Ordem padrão de cada lista: o mais recente primeiro. */
const PADRAO: Record<Aba, string> = {
  movimentacoes: "saida",
  reservas: "retirada",
  abastecimentos: "data",
  infracoes: "data",
  checklists: "data",
}

/** Filtros comuns + ordem validada contra as colunas permitidas da aba. */
export function lerFiltrosBase(aba: Aba, p: Params) {
  const colunas = ORDENS_CONDUTOR[aba] as Record<string, string>
  const chave = p.ordem && p.ordem in colunas ? p.ordem : PADRAO[aba]
  const dir: "asc" | "desc" = p.dir === "asc" ? "asc" : p.dir === "desc" ? "desc" : "desc"
  const ordem: OrdemLista = { coluna: colunas[chave], asc: dir === "asc" }
  const { pagina, porPagina } = lerPaginacao(p, POR_PAGINA_PADRAO)
  return {
    chaveOrdem: chave,
    dir,
    base: {
      pagina,
      porPagina,
      ordem,
      veiculoId: p.veiculo && UUID.test(p.veiculo) ? p.veiculo : null,
      de: p.de && DATA.test(p.de) ? p.de : null,
      ate: p.ate && DATA.test(p.ate) ? p.ate : null,
    },
  }
}
