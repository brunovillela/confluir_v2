import "server-only"

import { esquemaAusente, lerEmLotesPorIds, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { acertosPorFuncionario } from "@/lib/db/ponto-acertos-leitura"
import { carregarBasePonto } from "@/lib/db/ponto-analise"
import { recalcularPosteriores } from "@/lib/db/ponto-cascata"
import { funcionariosDaArea } from "@/lib/db/pessoal-area"
import {
  saldoNoFechamento,
  zeraFaixa1,
  zeraFaixa2,
  type AlcanceAcerto,
  type FaixasAcerto,
  type MotivoAcerto,
} from "@/lib/ponto-acertos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * MARCOS DE ACERTO DO BANCO DE HORAS (27/11/2026): lista, prévia, criação e
 * exclusão. Criar ou apagar um acerto refaz a cadeia de saldos de cada pessoa
 * (lib/db/ponto-cascata) a partir do último registro até o mês do acerto.
 */

type Linha = Record<string, unknown>

async function ctx() {
  return { admin: await createAdminClient(), emp: await tenantAtual() }
}

const n = (v: unknown) => (v === null || v === undefined ? null : Number(v))

export type AcertoResumo = {
  id: string
  competencia: string
  faixas: FaixasAcerto
  motivo: MotivoAcerto
  alcance: AlcanceAcerto
  observacao: string | null
  criadoEm: string
  criadoPor: string | null
  pessoas: number
  /** Soma dos saldos positivos zerados (horas a favor do funcionário). */
  positivo: number
  /** Soma dos saldos negativos zerados (horas a descontar), negativa. */
  negativo: number
}

export type ItemAcerto = { funcionarioId: string; nome: string; saldo70: number | null; saldo100: number | null }

function resumoDe(a: Linha, itens: Linha[], nomes: Map<string, string>): AcertoResumo {
  let positivo = 0
  let negativo = 0
  for (const i of itens) {
    for (const v of [n(i.saldo_70), n(i.saldo_100)]) {
      if (v === null) continue
      if (v > 0) positivo += v
      else negativo += v
    }
  }
  return {
    id: String(a.id),
    competencia: String(a.competencia),
    faixas: (texto(a.faixas) ?? "ambas") as FaixasAcerto,
    motivo: (texto(a.motivo) ?? "outro") as MotivoAcerto,
    alcance: (texto(a.alcance) ?? "parcial") as AlcanceAcerto,
    observacao: texto(a.observacao),
    criadoEm: String(a.created_at),
    criadoPor: a.criado_por ? (nomes.get(String(a.criado_por)) ?? null) : null,
    pessoas: itens.length,
    positivo: Math.round(positivo * 100) / 100,
    negativo: Math.round(negativo * 100) / 100,
  }
}

/** Todos os acertos (mais recentes primeiro). disponivel=false: falta a migração. */
export async function listarAcertos(): Promise<{ disponivel: boolean; acertos: AcertoResumo[] }> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin.from("pessoal_ponto_acertos").select("*").eq("emp_proprietaria_id", emp).order("competencia", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, acertos: [] }
    throw new Error(error.message)
  }
  const lista = (data ?? []) as Linha[]
  if (!lista.length) return { disponivel: true, acertos: [] }
  const itens = await lerEmLotesPorIds<Linha>(
    lista.map((a) => String(a.id)),
    (fatia, de, ate) =>
      admin.from("pessoal_ponto_acerto_itens").select("acerto_id, saldo_70, saldo_100").in("acerto_id", fatia).order("id").range(de, ate)
  )
  const nomes = await nomesDosUsuarios([...new Set(lista.map((a) => texto(a.criado_por)).filter((x): x is string => Boolean(x)))])
  return {
    disponivel: true,
    acertos: lista.map((a) => resumoDe(a, itens.filter((i) => String(i.acerto_id) === String(a.id)), nomes)),
  }
}

export async function obterAcerto(id: string): Promise<{ acerto: AcertoResumo; itens: ItemAcerto[] } | null> {
  const { admin, emp } = await ctx()
  const { data: a, error } = await admin.from("pessoal_ponto_acertos").select("*").eq("emp_proprietaria_id", emp).eq("id", id).maybeSingle()
  if (error || !a) return null
  const { data: its } = await admin.from("pessoal_ponto_acerto_itens").select("funcionario_id, saldo_70, saldo_100").eq("acerto_id", id)
  const itens = (its ?? []) as Linha[]
  const nomes = await nomesDosUsuarios([...itens.map((i) => String(i.funcionario_id)), ...(a.criado_por ? [String(a.criado_por)] : [])])
  return {
    acerto: resumoDe(a, itens, nomes),
    itens: itens
      .map((i) => ({
        funcionarioId: String(i.funcionario_id),
        nome: nomes.get(String(i.funcionario_id)) ?? "(sem nome)",
        saldo70: n(i.saldo_70),
        saldo100: n(i.saldo_100),
      }))
      .sort((x, y) => x.nome.localeCompare(y.nome, "pt-BR")),
  }
}

// ── Prévia ──────────────────────────────────────────────────────────────────

export type LinhaPrevia = {
  funcionarioId: string
  nome: string
  departamento: string
  ativo: boolean
  saldo70: number
  saldo100: number
  /** De onde vem o saldo (remessa do último registro até o mês). */
  origem: string | null
  /** Por que não pode entrar (já tem acerto no mês, remessa seguinte finalizada…). */
  bloqueio: string | null
}

/** Quem pode entrar num acerto do mês e com que saldo (no fechamento do mês). */
export async function previaAcerto(competencia: string): Promise<LinhaPrevia[]> {
  const { admin, emp } = await ctx()
  const [base, area, { data: rems }] = await Promise.all([
    carregarBasePonto(),
    funcionariosDaArea(),
    admin.from("pessoal_registro_ponto_remessas").select("id, finalizada").eq("emp_proprietaria_id", emp),
  ])
  const finalizada = new Set(((rems ?? []) as Linha[]).filter((r) => r.finalizada === true).map((r) => String(r.id)))
  const nomeRemessa = new Map(base.remessas.map((r) => [r.id, r.nome]))
  const porFunc = new Map<string, typeof base.registros>()
  for (const r of base.registros) porFunc.set(r.funcionarioId, [...(porFunc.get(r.funcionarioId) ?? []), r])
  const ativoDe = new Map(area.map((f) => [f.usuarioId, f.ativo]))
  const ids = [...new Set([...porFunc.keys(), ...area.filter((f) => f.ativo).map((f) => f.usuarioId)])]
  const nomeArea = new Map(area.map((f) => [f.usuarioId, f.nome]))
  const depArea = new Map(area.map((f) => [f.usuarioId, f.departamento]))
  const saida: LinhaPrevia[] = []
  for (const f of ids) {
    const regs = porFunc.get(f) ?? []
    const acertos = base.acertos?.get(f) ?? []
    const s = saldoNoFechamento(
      regs.map((r) => ({ competencia: r.competencia, remessaId: r.remessaId, saldo70: r.saldo70, saldo100: r.saldo100 })),
      acertos,
      competencia
    )
    const proxima = regs.filter((r) => r.competencia > competencia).sort((a, b) => a.competencia.localeCompare(b.competencia))[0]
    const bloqueio = acertos.some((a) => a.competencia === competencia)
      ? "Já tem acerto neste mês."
      : !s.registro
        ? "Sem registro de ponto até este mês."
        : proxima && finalizada.has(proxima.remessaId)
          ? `A remessa seguinte (${nomeRemessa.get(proxima.remessaId) ?? "—"}) está finalizada: reabra-a para lançar o acerto.`
          : null
    saida.push({
      funcionarioId: f,
      nome: nomeArea.get(f) ?? regs[0]?.nome ?? "(sem nome)",
      departamento: depArea.get(f) ?? regs[regs.length - 1]?.departamento.nome ?? "Sem departamento",
      ativo: ativoDe.get(f) ?? false,
      saldo70: Math.round(s.saldo70 * 100) / 100,
      saldo100: Math.round(s.saldo100 * 100) / 100,
      origem: s.registro ? (nomeRemessa.get(s.registro.remessaId) ?? null) : null,
      bloqueio,
    })
  }
  return saida.sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, "pt-BR"))
}

// ── Gravação ────────────────────────────────────────────────────────────────

/** Refaz a cadeia de saldos da pessoa a partir do último registro até o mês do acerto. */
async function recalcularDoAcerto(
  base: Awaited<ReturnType<typeof carregarBasePonto>>,
  funcionarioId: string,
  competencia: string
): Promise<string | null> {
  const reg = base.registros
    .filter((r) => r.funcionarioId === funcionarioId && r.competencia <= competencia)
    .sort((a, b) => b.competencia.localeCompare(a.competencia))[0]
  if (!reg) return null
  const r = await recalcularPosteriores(reg.remessaId, funcionarioId)
  return r.paradaEm
}

export async function criarAcerto(
  dados: { competencia: string; faixas: FaixasAcerto; motivo: MotivoAcerto; observacao: string | null; alcance: AlcanceAcerto },
  funcionarioIds: string[],
  usuarioId: string
): Promise<{ erro?: string; id?: string; avisos?: string[] }> {
  if (!funcionarioIds.length) return { erro: "Escolha ao menos uma pessoa." }
  const previa = new Map((await previaAcerto(dados.competencia)).map((p) => [p.funcionarioId, p]))
  const bloqueados = funcionarioIds.map((f) => previa.get(f)).filter((p) => !p || p.bloqueio)
  if (bloqueados.length) {
    return { erro: `Não dá para incluir: ${bloqueados.map((p) => (p ? `${p.nome} (${p.bloqueio})` : "pessoa sem registro")).join("; ")}` }
  }
  const { admin, emp } = await ctx()
  const { data: a, error } = await admin
    .from("pessoal_ponto_acertos")
    .insert({ emp_proprietaria_id: emp, ...dados, criado_por: usuarioId })
    .select("id")
    .single()
  if (error || !a) return { erro: esquemaAusente(error ?? {}) ? "Os acertos ainda não estão ligados nesta entidade (falta a atualização do banco)." : (error?.message ?? "Falha ao gravar.") }
  const itens = funcionarioIds.map((f) => {
    const p = previa.get(f)!
    return {
      emp_proprietaria_id: emp,
      acerto_id: a.id,
      funcionario_id: f,
      competencia: dados.competencia,
      saldo_70: zeraFaixa1(dados.faixas) ? p.saldo70 : null,
      saldo_100: zeraFaixa2(dados.faixas) ? p.saldo100 : null,
    }
  })
  const { error: e2 } = await admin.from("pessoal_ponto_acerto_itens").insert(itens)
  if (e2) {
    await admin.from("pessoal_ponto_acertos").delete().eq("id", a.id)
    return { erro: e2.code === "23505" ? "Alguém da lista já tem acerto neste mês." : e2.message }
  }
  const avisos: string[] = []
  const base = await carregarBasePonto()
  for (const f of funcionarioIds) {
    const parada = await recalcularDoAcerto(base, f, dados.competencia)
    if (parada) avisos.push(`${previa.get(f)?.nome}: o recálculo parou na remessa finalizada ${parada}.`)
  }
  return { id: String(a.id), avisos }
}

/** Desfaz o acerto: apaga e refaz a cadeia de saldos de quem estava nele. */
export async function apagarAcerto(id: string): Promise<{ erro?: string; avisos?: string[] }> {
  const det = await obterAcerto(id)
  if (!det) return { erro: "Acerto não encontrado." }
  const { admin, emp } = await ctx()
  const { error } = await admin.from("pessoal_ponto_acertos").delete().eq("emp_proprietaria_id", emp).eq("id", id)
  if (error) return { erro: error.message }
  const avisos: string[] = []
  const base = await carregarBasePonto()
  for (const i of det.itens) {
    const parada = await recalcularDoAcerto(base, i.funcionarioId, det.acerto.competencia)
    if (parada) avisos.push(`${i.nome}: o recálculo parou na remessa finalizada ${parada}.`)
  }
  return { avisos }
}

/** Os acertos de uma pessoa, com o que cada um zerou (página do funcionário e Meu perfil). */
export async function acertosDoFuncionario(
  funcionarioId: string
): Promise<{ id: string; competencia: string; faixas: FaixasAcerto; motivo: MotivoAcerto; observacao: string | null; saldo70: number | null; saldo100: number | null }[]> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin
    .from("pessoal_ponto_acerto_itens")
    .select("acerto_id, saldo_70, saldo_100")
    .eq("emp_proprietaria_id", emp)
    .eq("funcionario_id", funcionarioId)
  if (error || !data?.length) return []
  const { data: as } = await admin
    .from("pessoal_ponto_acertos")
    .select("id, competencia, faixas, motivo, observacao")
    .in("id", data.map((d) => d.acerto_id))
  const porId = new Map(((as ?? []) as Linha[]).map((a) => [String(a.id), a]))
  return (data as Linha[])
    .map((i) => {
      const a = porId.get(String(i.acerto_id))
      return a
        ? {
            id: String(a.id),
            competencia: String(a.competencia),
            faixas: (texto(a.faixas) ?? "ambas") as FaixasAcerto,
            motivo: (texto(a.motivo) ?? "outro") as MotivoAcerto,
            observacao: texto(a.observacao),
            saldo70: n(i.saldo_70),
            saldo100: n(i.saldo_100),
          }
        : null
    })
    .filter((x): x is NonNullable<typeof x> => Boolean(x))
    .sort((a, b) => b.competencia.localeCompare(a.competencia))
}

// ── Acerto recorrente (configuração da entidade) ────────────────────────────

export type ConfigAcerto = { meses: number[]; faixas: FaixasAcerto; motivo: MotivoAcerto }

export async function configAcerto(): Promise<ConfigAcerto> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin.from("pessoal_folha_config").select("acerto_meses, acerto_faixas, acerto_motivo").eq("emp_proprietaria_id", emp).maybeSingle()
  if (error || !data) return { meses: [], faixas: "ambas", motivo: "compensado" }
  return {
    meses: Array.isArray(data.acerto_meses) ? (data.acerto_meses as number[]).map(Number).sort((a, b) => a - b) : [],
    faixas: (texto(data.acerto_faixas) ?? "ambas") as FaixasAcerto,
    motivo: (texto(data.acerto_motivo) ?? "compensado") as MotivoAcerto,
  }
}

export async function salvarConfigAcerto(c: ConfigAcerto): Promise<{ erro?: string }> {
  const { admin, emp } = await ctx()
  const { error } = await admin
    .from("pessoal_folha_config")
    .upsert(
      { emp_proprietaria_id: emp, acerto_meses: c.meses.length ? c.meses : null, acerto_faixas: c.faixas, acerto_motivo: c.motivo },
      { onConflict: "emp_proprietaria_id" }
    )
  return error ? { erro: esquemaAusente(error) ? "Falta a atualização do banco." : error.message } : {}
}

/** Competências que já têm acerto (para o lembrete do acerto recorrente). */
export async function competenciasComAcerto(): Promise<Set<string>> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin.from("pessoal_ponto_acertos").select("competencia").eq("emp_proprietaria_id", emp)
  if (error) return new Set()
  return new Set(((data ?? []) as Linha[]).map((a) => String(a.competencia)))
}

export { acertosPorFuncionario }
