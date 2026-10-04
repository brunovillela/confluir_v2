import {
  ehProblema,
  ROTULO_PROBLEMA,
  type CodigoProblema,
  type LinhaFornecedor,
} from "@/lib/db/fornecedores-indicadores"

/**
 * Filtros, ordenação e opções da lista de fornecedores — compartilhados pela
 * página e pela exportação XLSX (onda 3, I8), para a planilha sair com a
 * mesma seleção da tela.
 */

export const ORDENS = ["nome", "documento", "pago12m", "ultima", "cadastro", "problemas"] as const
export type Ordem = (typeof ORDENS)[number]
export const SITUACOES = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "bloqueados", rotulo: "Bloqueados" },
  { valor: "inativos", rotulo: "Inativos" },
  { valor: "todos", rotulo: "Todos" },
] as const
export const NATUREZAS = [
  { valor: "todas", rotulo: "Todas as naturezas" },
  { valor: "pj", rotulo: "Pessoa jurídica" },
  { valor: "pf", rotulo: "Pessoa física" },
  { valor: "apoiada", rotulo: "Entidade apoiada" },
] as const
export const PROBLEMAS = [
  { valor: "todos", rotulo: "Com ou sem problema" },
  { valor: "com", rotulo: "Com algum problema" },
  { valor: "trava", rotulo: "CPF/CNPJ que trava pagamento" },
  ...(Object.entries(ROTULO_PROBLEMA) as [CodigoProblema, string][]).map(([valor, rotulo]) => ({ valor, rotulo })),
] as const

export type Filtros = {
  busca: string
  situacao: string
  natureza: string
  problema: string
  ordem: Ordem
  dir: "asc" | "desc"
  pagina: number
  porPagina: number
}
export const PADRAO_POR_PAGINA = 30

export const semAcento = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
export const TRAVA: CodigoProblema[] = ["sem_documento", "documento_invalido"]

export function filtrar(linhas: LinhaFornecedor[], f: Filtros): LinhaFornecedor[] {
  const termo = semAcento(f.busca.trim())
  const dig = f.busca.replace(/\D/g, "")
  return linhas.filter((l) => {
    if (f.situacao === "ativos" && l.inativa) return false
    if (f.situacao === "inativos" && !l.inativa) return false
    if (f.situacao === "bloqueados" && (!l.bloqueado || l.inativa)) return false
    if (f.natureza === "pj" && !l.pessoa_juridica) return false
    if (f.natureza === "pf" && l.pessoa_juridica) return false
    if (f.natureza === "apoiada" && !l.apoiada) return false
    if (f.problema === "com" && !l.problemas.some(ehProblema)) return false
    if (f.problema === "trava" && !l.problemas.some((p) => TRAVA.includes(p.codigo))) return false
    if (f.problema in ROTULO_PROBLEMA && !l.problemas.some((p) => p.codigo === f.problema)) return false
    if (termo) {
      const alvo = semAcento(`${l.nome} ${l.nome_razao ?? ""}`)
      if (!alvo.includes(termo) && !(dig.length >= 3 && (l.cnpj_cpf ?? "").replace(/\D/g, "").includes(dig))) return false
    }
    return true
  })
}

export function ordenar(linhas: LinhaFornecedor[], f: Filtros): LinhaFornecedor[] {
  const s = f.dir === "asc" ? 1 : -1
  const chave = (l: LinhaFornecedor): string | number => {
    switch (f.ordem) {
      case "documento": return (l.cnpj_cpf ?? "").replace(/\D/g, "") || "~"
      case "pago12m": return l.pago12m
      case "ultima": return l.ultimaOrdem ?? ""
      case "cadastro": return l.created_at ?? ""
      case "problemas": return l.problemas.filter((p) => p.gravidade === "alta").length * 100 + l.problemas.filter(ehProblema).length * 10 + l.problemas.length
      default: return semAcento(l.nome)
    }
  }
  return [...linhas].sort((a, b) => {
    const x = chave(a), y = chave(b)
    const c = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")
    return c * s || semAcento(a.nome).localeCompare(semAcento(b.nome), "pt-BR")
  })
}

