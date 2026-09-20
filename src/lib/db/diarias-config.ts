import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Configuração das diárias: os TIPOS DE DESPESA EXTRA que podem acompanhar
 * uma diária (hospedagem, alimentação, passagem) e o DE-PARA das contas
 * contábeis — ver supabase/diarias-diretoria.sql.
 *
 * A conta sai de três coisas: o QUADRO de quem recebe (funcionário ou
 * diretor), o DEPARTAMENTO que banca a atividade e o TIPO DE GASTO (a diária
 * em si ou a despesa extra). É o desenho do plano de contas da entidade:
 * "Desp. C/Desloc e Diárias Func." é uma conta só, enquanto "Deslocamento
 * Diretores" e "Hotel <área> Diretoria" existem repetidos em cada
 * departamento.
 *
 * Busca em cascata: (quadro, departamento, tipo) → (quadro, sem
 * departamento, tipo) → nada. Sem conta, a ordem de pagamento sai para o
 * financeiro classificar na autorização, como era antes.
 */

export type QuadroDiaria = "funcionario" | "diretor"

export const ROTULO_QUADRO: Record<QuadroDiaria, string> = {
  funcionario: "Funcionário",
  diretor: "Diretoria",
}

export type TipoDespesaDiaria = {
  id: string
  nome: string
  descricao: string | null
  exigeComprovante: boolean
  ativa: boolean
  ordem: number
}

export type ContaDiaria = {
  id: string
  quadro: QuadroDiaria
  departamentoId: string | null
  despesaTipoId: string | null
  centroCustoId: string
}

// ── Tipos de despesa ────────────────────────────────────────────────────────

export async function listarTiposDespesaDiaria(): Promise<{
  disponivel: boolean
  tipos: TipoDespesaDiaria[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_despesa_tipos")
    .select("id, nome, descricao, exige_comprovante, ativa, ordem")
    .order("ordem", { ascending: true })
    .order("nome", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, tipos: [] }
    throw new Error(`Falha ao listar tipos de despesa: ${error.message}`)
  }
  return {
    disponivel: true,
    tipos: (data ?? []).map((t) => ({
      id: String(t.id),
      nome: String(t.nome ?? "(sem nome)"),
      descricao: texto(t.descricao),
      exigeComprovante: t.exige_comprovante !== false,
      ativa: t.ativa !== false,
      ordem: Number(t.ordem ?? 0),
    })),
  }
}

export async function salvarTipoDespesaDiaria(dados: {
  id?: string
  nome: string
  descricao: string | null
  exigeComprovante: boolean
  ativa: boolean
  ordem: number
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const campos = {
    nome: dados.nome,
    descricao: dados.descricao,
    exige_comprovante: dados.exigeComprovante,
    ativa: dados.ativa,
    ordem: dados.ordem,
  }
  const { error } = dados.id
    ? await admin
        .from("pessoal_diarias_despesa_tipos")
        .update({ ...campos, updated_at: new Date().toISOString() })
        .eq("id", dados.id)
    : await admin
        .from("pessoal_diarias_despesa_tipos")
        .insert({ ...campos, emp_proprietaria_id: await tenantAtual() })
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Rode supabase/diarias-diretoria.sql antes de configurar as despesas." }
    }
    if (error.code === "23505") return { erro: "Já existe um tipo de despesa com esse nome." }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  return {}
}

// ── De-para das contas ──────────────────────────────────────────────────────

export async function listarContasDiaria(): Promise<{
  disponivel: boolean
  contas: ContaDiaria[]
}> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_centros_custo")
    .select("id, quadro, departamento_id, despesa_tipo_id, centro_custo_id")
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, contas: [] }
    throw new Error(`Falha ao listar as contas das diárias: ${error.message}`)
  }
  return {
    disponivel: true,
    contas: (data ?? []).map((c) => ({
      id: String(c.id),
      quadro: (c.quadro as QuadroDiaria) ?? "funcionario",
      departamentoId: texto(c.departamento_id),
      despesaTipoId: texto(c.despesa_tipo_id),
      centroCustoId: String(c.centro_custo_id),
    })),
  }
}

/**
 * Define (ou apaga, com centroCustoId nulo) a conta de um cruzamento.
 * `despesaTipoId` nulo é a diária em si; `departamentoId` nulo é o padrão.
 */
export async function definirContaDiaria(dados: {
  quadro: QuadroDiaria
  departamentoId: string | null
  despesaTipoId: string | null
  centroCustoId: string | null
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const base = admin.from("pessoal_diarias_centros_custo")
  const alvo = await (async () => {
    let q = admin
      .from("pessoal_diarias_centros_custo")
      .select("id")
      .eq("quadro", dados.quadro)
    q = dados.departamentoId
      ? q.eq("departamento_id", dados.departamentoId)
      : q.is("departamento_id", null)
    q = dados.despesaTipoId
      ? q.eq("despesa_tipo_id", dados.despesaTipoId)
      : q.is("despesa_tipo_id", null)
    const { data, error } = await q.maybeSingle()
    if (error && !esquemaAusente(error)) return null
    return data ? String(data.id) : null
  })()

  if (!dados.centroCustoId) {
    if (!alvo) return {}
    const { error } = await base.delete().eq("id", alvo)
    return error ? { erro: `Não foi possível limpar a conta: ${error.message}` } : {}
  }

  const { error } = alvo
    ? await base
        .update({ centro_custo_id: dados.centroCustoId, updated_at: new Date().toISOString() })
        .eq("id", alvo)
    : await base.insert({
        quadro: dados.quadro,
        departamento_id: dados.departamentoId,
        despesa_tipo_id: dados.despesaTipoId,
        centro_custo_id: dados.centroCustoId,
        emp_proprietaria_id: await tenantAtual(),
      })
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Rode supabase/diarias-diretoria.sql antes de configurar as contas." }
    }
    return { erro: `Não foi possível salvar a conta: ${error.message}` }
  }
  return {}
}

/** Resolve a conta de um gasto pela cascata departamento → padrão do quadro. */
export function contaDoGasto(
  contas: ContaDiaria[],
  quadro: QuadroDiaria,
  departamentoId: string | null,
  despesaTipoId: string | null
): string | null {
  const doTipo = contas.filter(
    (c) => c.quadro === quadro && (c.despesaTipoId ?? null) === (despesaTipoId ?? null)
  )
  const doDepartamento =
    departamentoId && doTipo.find((c) => c.departamentoId === departamentoId)
  return (doDepartamento || doTipo.find((c) => !c.departamentoId))?.centroCustoId ?? null
}

/** Centros de custo de despesa usáveis, para os selects da configuração. */
export async function centrosDeCustoDespesa(): Promise<
  { id: string; nome: string; classificador: string | null; departamentoId: string | null }[]
> {
  const admin = await createAdminClient()
  const linhas: Record<string, unknown>[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("centros_de_custo")
      .select("id, nome_da_conta, classificador, tipo_da_conta, usavel, departamento_id")
      .order("classificador", { ascending: true })
      .range(de, de + 999)
    if (error) {
      if (esquemaAusente(error)) return []
      throw new Error(`Falha ao listar centros de custo: ${error.message}`)
    }
    linhas.push(...((data ?? []) as Record<string, unknown>[]))
    if (!data || data.length < 1000) break
  }
  // Onde mora a palavra "Despesa" varia por organização: no tenant real é
  // `tipo_da_conta` (e o classificador é o código 5.1.02…); no demo é o
  // contrário. Aceita qualquer um dos dois.
  const ehDespesa = (c: Record<string, unknown>) =>
    [c.tipo_da_conta, c.classificador].some((v) =>
      semAcento(String(v ?? "")).startsWith("despesa")
    )
  return linhas
    .filter((c) => c.usavel !== false && ehDespesa(c))
    .map((c) => ({
      id: String(c.id),
      nome: String(c.nome_da_conta ?? "(sem nome)"),
      classificador: texto(c.classificador),
      departamentoId: texto(c.departamento_id),
    }))
}
