import { semAcento } from "@/lib/texto"
import type { Permissoes } from "@/lib/permissoes"

/**
 * PADRÃO DAS ÁREAS DO PESSOAL (16/10/2026) — três níveis por área:
 *
 *   1. a ÁREA  (/painel/pessoal/<area>): indicadores, o que precisa de
 *      atenção e as abas — "Funcionários" (a inicial) e a visão própria da
 *      área (Remessas, Solicitações…);
 *   2. o FUNCIONÁRIO NA ÁREA (/painel/pessoal/<area>/funcionario/<usuarioId>):
 *      indicadores da pessoa e o histórico, cada linha levando ao nível 3;
 *   3. o REGISTRO (o funcionário naquela remessa, período ou solicitação),
 *      com anterior/próximo na remessa e na pessoa.
 *
 * Aqui ficam os filtros comuns da lista de funcionários — os mesmos nomes de
 * parâmetro em todas as áreas: busca, situacao, departamento, ordem, dir,
 * pagina, porPagina (e `aba`, `ano` quando a área usa).
 */

export type SituacaoFuncionario = "ativos" | "desligados" | "todos"

export type FiltrosArea<O extends string = string> = {
  busca: string
  situacao: SituacaoFuncionario
  departamento: string
  ordem: O
  dir: "asc" | "desc"
}

export const SITUACOES_FUNCIONARIO: { valor: SituacaoFuncionario; rotulo: string }[] = [
  { valor: "ativos", rotulo: "Ativos" },
  { valor: "desligados", rotulo: "Desligados" },
  { valor: "todos", rotulo: "Todos" },
]

export function lerFiltrosArea<O extends string>(
  sp: Record<string, string | undefined>,
  ordens: readonly O[],
  padrao: { ordem: O; dir?: "asc" | "desc" }
): FiltrosArea<O> {
  return {
    busca: (sp.busca ?? "").trim(),
    situacao: (["ativos", "desligados", "todos"] as const).find((s) => s === sp.situacao) ?? "ativos",
    departamento: (sp.departamento ?? "").trim(),
    ordem: ordens.find((o) => o === sp.ordem) ?? padrao.ordem,
    dir: sp.dir === "asc" || sp.dir === "desc" ? sp.dir : (padrao.dir ?? "asc"),
  }
}

/** Parâmetros não-padrão dos filtros (para montar links preservando o recorte). */
export function paramsDosFiltros(
  f: FiltrosArea,
  extras: Record<string, string | undefined> = {}
): Record<string, string | undefined> {
  return {
    ...extras,
    busca: f.busca || undefined,
    situacao: f.situacao !== "ativos" ? f.situacao : undefined,
    departamento: f.departamento || undefined,
    ordem: f.ordem,
    dir: f.dir,
  }
}

export type FuncionarioBasico = {
  usuarioId: string
  nome: string
  matricula: string | null
  cargo: string | null
  departamento: string | null
  ativo: boolean
}

/** Busca (sem acento, por palavras), situação e departamento. */
export function filtrarFuncionarios<T extends FuncionarioBasico>(linhas: T[], f: FiltrosArea): T[] {
  const termos = semAcento(f.busca).split(/\s+/).filter(Boolean)
  return linhas.filter((l) => {
    if (f.situacao === "ativos" && !l.ativo) return false
    if (f.situacao === "desligados" && l.ativo) return false
    if (f.departamento && (l.departamento ?? "") !== f.departamento) return false
    if (termos.length) {
      const alvo = semAcento([l.nome, l.matricula, l.cargo, l.departamento].filter(Boolean).join(" "))
      if (!termos.every((t) => alvo.includes(t))) return false
    }
    return true
  })
}

/** Ordena pela coluna escolhida; vazios sempre no fim; empate pelo nome. */
export function ordenarPor<T extends FuncionarioBasico>(
  linhas: T[],
  dir: "asc" | "desc",
  valor: (l: T) => string | number | null | undefined
): T[] {
  const fator = dir === "asc" ? 1 : -1
  return [...linhas].sort((a, b) => {
    const va = valor(a)
    const vb = valor(b)
    const vazioA = va === null || va === undefined || va === ""
    const vazioB = vb === null || vb === undefined || vb === ""
    if (vazioA !== vazioB) return vazioA ? 1 : -1
    let c = 0
    if (!vazioA && !vazioB) {
      c = typeof va === "number" && typeof vb === "number" ? va - vb : String(va).localeCompare(String(vb), "pt-BR")
    }
    return fator * c || a.nome.localeCompare(b.nome, "pt-BR")
  })
}

// ── Áreas que já seguem o padrão (os atalhos do cabeçalho do funcionário) ──

export type AreaFuncionario =
  | "contracheques"
  | "ponto"
  | "ferias"
  | "carreira"
  | "informes"
  | "diarias"
  | "reembolsos"
  | "faltas"

/** Ordem e permissão de cada área com página do funcionário (nível 2). */
const AREAS: { chave: AreaFuncionario; rotulo: string; permissoes: string[]; href: (id: string) => string }[] = [
  { chave: "contracheques", rotulo: "Contracheques", permissoes: ["pessoal_gestao", "pessoal_contracheque"], href: (id) => `/painel/pessoal/contracheques/funcionario/${id}` },
  { chave: "ponto", rotulo: "Ponto", permissoes: ["pessoal_gestao"], href: (id) => `/painel/pessoal/ponto/funcionario/${id}` },
  { chave: "ferias", rotulo: "Férias", permissoes: ["pessoal_gestao"], href: (id) => `/painel/pessoal/ferias/funcionario/${id}` },
  { chave: "carreira", rotulo: "Carreira", permissoes: ["pessoal_gestao", "pessoal_anuenios", "pessoal_niveis_salariais"], href: (id) => `/painel/pessoal/carreira/funcionario/${id}` },
  { chave: "diarias", rotulo: "Diárias", permissoes: ["pessoal_gestao", "pessoal_diarias"], href: (id) => `/painel/pessoal/diarias/funcionario/${id}` },
  { chave: "reembolsos", rotulo: "Reembolsos", permissoes: ["pessoal_gestao"], href: (id) => `/painel/pessoal/reembolsos/funcionario/${id}` },
  { chave: "faltas", rotulo: "Faltas", permissoes: ["pessoal_gestao", "pessoal_faltas_justificadas"], href: (id) => `/painel/pessoal/faltas/funcionario/${id}` },
  { chave: "informes", rotulo: "Informes", permissoes: ["pessoal_gestao", "pessoal_informes_rendimentos"], href: (id) => `/painel/pessoal/informes/funcionario/${id}` },
]

export function areasDoFuncionario(permissoes: Permissoes | null) {
  return AREAS.filter((a) => a.permissoes.some((p) => permissoes?.[p] === true))
}
