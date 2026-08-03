import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { estatisticasFontes } from "@/lib/db/fontes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Prontuário do filiado — "log de vida" no sindicato (atendimentos,
 * homologações, hospedagens, atualizações cadastrais…). Tabela
 * `filiacao_prontuario` migrada do Bubble (12,9k registros previstos):
 *  - FK principal: `filiacao_id` → filiacoes
 *  - `tipo` categoriza o evento; `data` é TIMESTAMPTZ
 *  - `diretor_funcionario_id` → usuarios (responsável pelo registro)
 *  - FKs opcionais: homologacao_id, hospedagem_id
 * Permissões: filiacao_filiados vê; filiacao_gestao cria/edita.
 */

export type Apontamento = {
  id: string
  data: string | null
  tipo: string | null
  descricao: string | null
  autor: string | null
  homologacaoId: string | null
  hospedagemId: string | null
  created_at: string | null
}

export type ProntuarioFiliado = {
  disponivel: boolean
  total: number
  apontamentos: Apontamento[]
}

/** PGRST205/42P01 = tabela ainda não existe no banco. */
function tabelaAusente(erro: { code?: string } | null): boolean {
  return erro?.code === "PGRST205" || erro?.code === "42P01"
}

async function nomesDeUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  if (ids.length === 0) return nomes
  const admin = await createAdminClient()
  for (let de = 0; de < ids.length; de += 100) {
    const { data } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", ids.slice(de, de + 100))
    for (const u of data ?? []) {
      const nome = u.nome_guerra ?? u.nome_completo
      if (nome) nomes.set(u.id, nome)
    }
  }
  return nomes
}

export async function listarProntuario(
  filiacaoId: string,
  limite?: number
): Promise<ProntuarioFiliado> {
  const admin = await createAdminClient()
  let q = admin
    .from("filiacao_prontuario")
    .select(
      "id, data, tipo, descricao, diretor_funcionario_id, homologacao_id, hospedagem_id, created_at",
      { count: "exact" }
    )
    .eq("filiacao_id", filiacaoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("data", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false, nullsFirst: false })
  if (limite) q = q.limit(limite)

  const { data, count, error } = await q
  if (error) {
    if (tabelaAusente(error)) {
      return { disponivel: false, total: 0, apontamentos: [] }
    }
    throw new Error(`Falha ao carregar o prontuário: ${error.message}`)
  }

  const autores = await nomesDeUsuarios([
    ...new Set(
      (data ?? [])
        .map((a) => a.diretor_funcionario_id)
        .filter((v): v is string => Boolean(v))
    ),
  ])

  return {
    disponivel: true,
    total: count ?? 0,
    apontamentos: (data ?? []).map((a) => ({
      id: a.id,
      data: a.data,
      tipo: a.tipo,
      descricao: a.descricao,
      autor: a.diretor_funcionario_id
        ? (autores.get(a.diretor_funcionario_id) ?? null)
        : null,
      homologacaoId: a.homologacao_id,
      hospedagemId: a.hospedagem_id,
      created_at: a.created_at,
    })),
  }
}

export type ApontamentoGeral = Apontamento & {
  filiadoId: string | null
  filiadoNome: string | null
  filiadoCondicao: string | null
}

/**
 * Todos os apontamentos do tenant (página geral). ~13k linhas quando a
 * carga terminar — leitura em lotes com cache em memória por 5 minutos;
 * nomes de filiados resolvidos pelo snapshot de fontes (sem N queries).
 */
let cacheGeral: {
  expira: number
  dados: { apontamentos: ApontamentoGeral[]; tipos: string[] }
} | null = null

export function invalidarCacheProntuarios() {
  cacheGeral = null
}

export async function listarTodosProntuarios(): Promise<{
  disponivel: boolean
  apontamentos: ApontamentoGeral[]
  tipos: string[]
}> {
  if (cacheGeral && cacheGeral.expira > Date.now()) {
    return { disponivel: true, ...cacheGeral.dados }
  }

  const admin = await createAdminClient()

  type Bruto = {
    id: string
    filiacao_id: string | null
    data: string | null
    tipo: string | null
    descricao: string | null
    diretor_funcionario_id: string | null
    homologacao_id: string | null
    hospedagem_id: string | null
    created_at: string | null
  }
  const brutos: Bruto[] = []
  const LOTE = 1000
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await admin
      .from("filiacao_prontuario")
      .select(
        "id, filiacao_id, data, tipo, descricao, diretor_funcionario_id, homologacao_id, hospedagem_id, created_at"
      )
      .eq("emp_proprietaria_id", await tenantAtual())
      .order("id", { ascending: true })
      .range(de, de + LOTE - 1)
    if (error) {
      if (tabelaAusente(error)) {
        return { disponivel: false, apontamentos: [], tipos: [] }
      }
      throw new Error(`Falha ao carregar os prontuários: ${error.message}`)
    }
    brutos.push(...(data ?? []))
    if (!data || data.length < LOTE) break
  }

  // Nomes dos filiados via snapshot (todas as filiações já estão em memória)
  const stats = await estatisticasFontes()
  const registroPorId = new Map(stats.registros.map((r) => [r.id, r]))

  const autores = await nomesDeUsuarios([
    ...new Set(
      brutos
        .map((a) => a.diretor_funcionario_id)
        .filter((v): v is string => Boolean(v))
    ),
  ])

  const apontamentos: ApontamentoGeral[] = brutos
    .map((a) => {
      const registro = a.filiacao_id
        ? registroPorId.get(a.filiacao_id)
        : undefined
      return {
        id: a.id,
        data: a.data,
        tipo: a.tipo,
        descricao: a.descricao,
        autor: a.diretor_funcionario_id
          ? (autores.get(a.diretor_funcionario_id) ?? null)
          : null,
        homologacaoId: a.homologacao_id,
        hospedagemId: a.hospedagem_id,
        created_at: a.created_at,
        filiadoId: a.filiacao_id,
        filiadoNome: registro?.nome_completo ?? null,
        filiadoCondicao: registro?.filiacao_condicao ?? null,
      }
    })
    .sort((a, b) => {
      const da = a.data ?? a.created_at
      const db = b.data ?? b.created_at
      if (da === null && db === null) return 0
      if (da === null) return 1
      if (db === null) return -1
      return db.localeCompare(da)
    })

  const tipos = [
    ...new Set(
      apontamentos.map((a) => a.tipo).filter((v): v is string => Boolean(v))
    ),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"))

  cacheGeral = {
    expira: Date.now() + 5 * 60_000,
    dados: { apontamentos, tipos },
  }
  return { disponivel: true, apontamentos, tipos }
}

/** Tipos já usados (datalist do formulário). */
export async function tiposDeProntuario(): Promise<string[]> {
  const geral = await listarTodosProntuarios()
  return geral.tipos
}
