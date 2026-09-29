import "server-only"

import { estadoVigencia, type EstadoVigencia, type SituacaoAcordo, type TipoAcordo } from "@/lib/acordos-constantes"
import { hojeSP, lerEmLotes, texto } from "@/lib/db/comum"
import type { SituacaoOpositor } from "@/lib/oposicao-constantes"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Página do empregador: o que já existe em outros módulos, filtrado pela
 * empresa — acordos (acordo_fontes), oposições (oposicao_opositor.empregador_id).
 * As votações usam listarCampanhas({ empresaId }) de lib/db/assembleias.ts.
 */

// ── Acordos ──────────────────────────────────────────────────────────────────

export type AcordoDoEmpregador = {
  id: string
  titulo: string
  tipo: TipoAcordo
  situacao: SituacaoAcordo
  vigenciaInicio: string | null
  vigenciaFim: string | null
  estado: EstadoVigencia | null
  clausulas: number
}

export const FILTROS_ACORDO = {
  fechados: "Fechados (vigentes e arquivados)",
  vigente: "Só vigentes",
  arquivado: "Só arquivados",
  em_negociacao: "Em negociação",
  todos: "Todos",
} as const
export type FiltroAcordo = keyof typeof FILTROS_ACORDO

export async function acordosDoEmpregador(empresaId: string): Promise<AcordoDoEmpregador[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: fontes } = await admin
    .from("acordo_fontes")
    .select("acordo_id")
    .eq("empresa_id", empresaId)
    .eq("emp_proprietaria_id", emp)
  const ids = [...new Set((fontes ?? []).map((f) => String(f.acordo_id)))]
  if (!ids.length) return []
  const { data: acordos } = await admin
    .from("acordo_coletivo")
    .select("id, titulo, tipo, situacao, vigencia_inicio, vigencia_fim")
    .in("id", ids)
    .eq("emp_proprietaria_id", emp)
    // Pauta e propostas de negociação são sigilosas: ficam na área de Negociações.
    .is("negociacao_id", null)
  const contagem = new Map<string, number>()
  const { data: cls } = await admin.from("acordo_clausulas").select("acordo_id").in("acordo_id", ids).eq("emp_proprietaria_id", emp)
  for (const c of cls ?? []) contagem.set(String(c.acordo_id), (contagem.get(String(c.acordo_id)) ?? 0) + 1)
  const hoje = hojeSP()
  return (acordos ?? []).map((a) => {
    const situacao = (a.situacao ?? "em_negociacao") as SituacaoAcordo
    return {
      id: String(a.id),
      titulo: String(a.titulo ?? "(sem título)"),
      tipo: (a.tipo ?? "act") as TipoAcordo,
      situacao,
      vigenciaInicio: texto(a.vigencia_inicio),
      vigenciaFim: texto(a.vigencia_fim),
      estado: situacao === "vigente" ? estadoVigencia(texto(a.vigencia_fim), hoje) : null,
      clausulas: contagem.get(String(a.id)) ?? 0,
    }
  })
}

export function filtrarAcordos(lista: AcordoDoEmpregador[], filtro: FiltroAcordo): AcordoDoEmpregador[] {
  if (filtro === "todos") return lista
  if (filtro === "fechados") return lista.filter((a) => a.situacao === "vigente" || a.situacao === "arquivado")
  return lista.filter((a) => a.situacao === filtro)
}

// ── Oposições (cartas dos trabalhadores desta empresa) ───────────────────────

export type OposicaoDoEmpregador = {
  id: string
  campanhaId: string | null
  campanhaNome: string | null
  nome: string | null
  cpf: string | null
  matricula: string | null
  lotacao: string | null
  situacao: SituacaoOpositor
  ehFiliado: boolean
  protocolo: string | null
  criadoEm: string | null
}

export const ORDENS_OPOSICAO = { data: "created_at", nome: "nome_completo", situacao: "situacao" } as const

/** Campanhas com carta de trabalhador desta empresa (para o filtro e o resumo). */
export async function campanhasDeOposicaoDoEmpregador(
  empresaId: string
): Promise<{ id: string; nome: string; total: number; prazoFim: string | null }[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<{ campanha_id: string | null }>((de, ate) =>
    admin
      .from("oposicao_opositor")
      .select("campanha_id")
      .eq("emp_proprietaria_id", emp)
      .eq("empregador_id", empresaId)
      .order("id")
      .range(de, ate)
  ).catch(() => [])
  const total = new Map<string, number>()
  for (const l of linhas) if (l.campanha_id) total.set(l.campanha_id, (total.get(l.campanha_id) ?? 0) + 1)
  // Campanhas ligadas à empresa, mesmo sem carta ainda.
  const { data: vinc } = await admin.from("oposicao_campanha_fontes").select("campanha_id").eq("empresa_id", empresaId).eq("emp_proprietaria_id", emp)
  for (const v of vinc ?? []) if (!total.has(String(v.campanha_id))) total.set(String(v.campanha_id), 0)
  if (!total.size) return []
  const { data: cs } = await admin
    .from("oposicao_campanha")
    .select("id, nome, codigo, prazo_fim")
    .in("id", [...total.keys()])
    .eq("emp_proprietaria_id", emp)
  return (cs ?? [])
    .map((c) => ({
      id: String(c.id),
      nome: String(c.nome ?? c.codigo ?? "(sem nome)"),
      total: total.get(String(c.id)) ?? 0,
      prazoFim: texto(c.prazo_fim),
    }))
    .sort((a, b) => (b.prazoFim ?? "").localeCompare(a.prazoFim ?? ""))
}

export async function oposicoesDoEmpregador(
  empresaId: string,
  f: {
    pagina: number
    porPagina: number
    ordem: keyof typeof ORDENS_OPOSICAO
    asc: boolean
    campanhaId?: string | null
    situacao?: SituacaoOpositor | null
    busca?: string | null
  },
  nomesCampanhas: Map<string, string>
): Promise<{ linhas: OposicaoDoEmpregador[]; total: number }> {
  const admin = await createAdminClient()
  let q = admin
    .from("oposicao_opositor")
    .select("id, campanha_id, nome_completo, cpf, matricula, lotacao, situacao, filiacao_id, protocolo, created_at", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("empregador_id", empresaId)
  if (f.campanhaId) q = q.eq("campanha_id", f.campanhaId)
  if (f.situacao) q = q.eq("situacao", f.situacao)
  const busca = (f.busca ?? "").replace(/[,()%*]/g, " ").trim()
  if (busca) q = q.or(`nome_completo.ilike.%${busca}%,cpf.ilike.%${busca}%,matricula.ilike.%${busca}%,protocolo.ilike.%${busca}%`)
  const de = (f.pagina - 1) * f.porPagina
  const { data, count, error } = await q
    .order(ORDENS_OPOSICAO[f.ordem], { ascending: f.asc, nullsFirst: false })
    .order("id")
    .range(de, de + f.porPagina - 1)
  if (error) throw new Error(`Falha ao listar oposições: ${error.message}`)
  return {
    total: count ?? 0,
    linhas: (data ?? []).map((o) => ({
      id: String(o.id),
      campanhaId: texto(o.campanha_id),
      campanhaNome: o.campanha_id ? (nomesCampanhas.get(String(o.campanha_id)) ?? null) : null,
      nome: texto(o.nome_completo),
      cpf: texto(o.cpf),
      matricula: texto(o.matricula),
      lotacao: texto(o.lotacao),
      situacao: (o.situacao ?? "nao_avaliada") as SituacaoOpositor,
      ehFiliado: Boolean(o.filiacao_id),
      protocolo: texto(o.protocolo),
      criadoEm: texto(o.created_at),
    })),
  }
}

/** Quantas campanhas de votação têm esta empresa entre as fontes. */
export async function contarVotacoesDoEmpregador(empresaId: string): Promise<number> {
  const admin = await createAdminClient()
  const { data } = await admin.from("voto_campanha_fontes").select("campanha_id").eq("empresa_id", empresaId)
  if (!data?.length) return 0
  const { count } = await admin
    .from("voto_campanha")
    .select("id", { count: "exact", head: true })
    .in("id", [...new Set(data.map((d) => String(d.campanha_id)))])
    .eq("emp_proprietaria_id", await tenantAtual())
  return count ?? 0
}
