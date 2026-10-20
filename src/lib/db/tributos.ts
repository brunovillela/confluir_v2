import "server-only"

import { esquemaAusente, hojeSP, texto } from "@/lib/db/comum"
import { gerarCodigoProcesso, subirComprovanteCompras } from "@/lib/db/compras"
import { camposAutorizacaoInicial, registrarEvento } from "@/lib/db/ordens-ciclo"
import { inserirOrdemVerificada } from "@/lib/db/ordens-verificacao"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  rotuloCompetencia,
  TIPO_ORDEM_TRIBUTO,
  type EsferaTributo,
  type PeriodicidadeTributo,
  type SituacaoGuia,
} from "@/lib/tributos-constantes"

/**
 * TRIBUTOS (Financeiro › Tributos, docs/plano-tributos.md). No molde dos
 * Contratos: o tributo (financeiro_tributos) está para o contrato como a guia
 * (financeiro_tributos_lancamentos) para a parcela. Cada guia lançada gera
 * UMA ordem de pagamento tipo "Tributo" (ordens_pagamento.tributo_lancamento_id).
 *
 * - Tributo mensal: as guias dos próximos vencimentos ficam PREVISTAS
 *   ("aguardando_guia"), pelo dia habitual — como a parcela recorrente do
 *   contrato espera a nota.
 * - Autorização (decisão D1): tributo recorrente com guia no VALOR ESPERADO
 *   nasce "A pagar", com a dispensa registrada; fora disso, alçada.
 */

export const AVISO_SQL_TRIBUTOS = "Tributos indisponíveis — falta aplicar a migração 20261020003556_tributos."

/** Até onde se prevê: guias com vencimento nos próximos 40 dias. */
const DIAS_PREVISAO = 40
/** Previstas não retroagem mais que isto (tributo parado não acumula atraso). */
const DIAS_RETROATIVOS = 15

export type Tributo = {
  id: string
  nome: string
  abreviacao: string | null
  esfera: EsferaTributo
  beneficiarioId: string | null
  beneficiario: string | null
  centroCustoId: string | null
  departamentoId: string | null
  periodicidade: PeriodicidadeTributo
  diaVencimento: number | null
  valorEsperado: number | null
  formaPagamento: string | null
  ativo: boolean
  observacoes: string | null
}

export type GuiaTributo = {
  id: string
  tributoId: string
  competenciaInicio: string | null
  competenciaFim: string | null
  competencia: string
  valor: number | null
  vencimento: string | null
  arquivoGuia: string | null
  linhaDigitavel: string | null
  situacao: SituacaoGuia
  ordemId: string | null
  ordemCodigo: string | null
  ordemSituacao: string | null
  valorPago: number | null
  dataPagamento: string | null
}

export type TributoResumo = Tributo & {
  proxima: GuiaTributo | null
  ultimaLancada: GuiaTributo | null
  pagoNoAno: number
  guiasAguardando: number
}

const n = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(v))

function paraTributo(r: Record<string, unknown>): Tributo {
  const benef = r.beneficiario as { nome_fantasia?: string | null; nome_razao?: string | null } | null
  return {
    id: String(r.id),
    nome: String(r.nome),
    abreviacao: texto(r.abreviacao),
    esfera: (r.esfera as EsferaTributo) ?? "federal",
    beneficiarioId: texto(r.beneficiario_empresa_id),
    beneficiario: texto(benef?.nome_fantasia) ?? texto(benef?.nome_razao),
    centroCustoId: texto(r.centro_custo_despesa_id),
    departamentoId: texto(r.departamento_id),
    periodicidade: (r.periodicidade as PeriodicidadeTributo) ?? "mensal",
    diaVencimento: n(r.dia_vencimento),
    valorEsperado: n(r.valor_esperado),
    formaPagamento: texto(r.forma_pagamento),
    ativo: r.ativo !== false,
    observacoes: texto(r.observacoes),
  }
}

function paraGuia(r: Record<string, unknown>): GuiaTributo {
  const o = r.ordem as { codigo?: string | null; situacao?: string | null; valor_pago?: number | null; data_pagamento?: string | null } | null
  const ini = texto(r.competencia_inicio)
  const fim = texto(r.competencia_fim)
  return {
    id: String(r.id),
    tributoId: String(r.tributo_id),
    competenciaInicio: ini,
    competenciaFim: fim,
    competencia: rotuloCompetencia(ini, fim),
    valor: n(r.valor),
    vencimento: texto(r.vencimento),
    arquivoGuia: texto(r.arquivo_guia),
    linhaDigitavel: texto(r.linha_digitavel),
    situacao: (r.situacao as SituacaoGuia) ?? "aguardando_guia",
    ordemId: texto(r.ordem_pagamento_id),
    ordemCodigo: texto(o?.codigo),
    ordemSituacao: texto(o?.situacao),
    valorPago: n(o?.valor_pago),
    dataPagamento: texto(o?.data_pagamento),
  }
}

const SELECT_TRIBUTO = "*, beneficiario:beneficiario_empresa_id (nome_fantasia, nome_razao)"
const SELECT_GUIA =
  "id, tributo_id, competencia_inicio, competencia_fim, valor, vencimento, arquivo_guia, linha_digitavel, situacao, ordem_pagamento_id, ordem:ordem_pagamento_id (codigo, situacao, valor_pago, data_pagamento)"

/** Todas as guias do tenant (em lotes: o PostgREST corta em 1.000 linhas). */
async function todasAsGuias(tributoId?: string): Promise<GuiaTributo[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const out: GuiaTributo[] = []
  for (let de = 0; ; de += 1000) {
    let q = admin.from("financeiro_tributos_lancamentos").select(SELECT_GUIA).eq("emp_proprietaria_id", emp)
    if (tributoId) q = q.eq("tributo_id", tributoId)
    const { data, error } = await q.order("vencimento", { ascending: false, nullsFirst: false }).range(de, de + 999)
    if (error) throw new Error(`Falha ao ler as guias: ${error.message}`)
    out.push(...(data ?? []).map((r) => paraGuia(r as Record<string, unknown>)))
    if ((data ?? []).length < 1000) break
  }
  return out
}

// ── Leitura ─────────────────────────────────────────────────────────────────

export async function listarTributos(): Promise<{ disponivel: boolean; tributos: TributoResumo[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_tributos")
    .select(SELECT_TRIBUTO)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ativo", { ascending: false })
    .order("nome")
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, tributos: [] }
    throw new Error(`Falha ao listar tributos: ${error.message}`)
  }
  const guias = await todasAsGuias()
  const ano = hojeSP().slice(0, 4)
  return {
    disponivel: true,
    tributos: (data ?? []).map((r) => {
      const t = paraTributo(r as Record<string, unknown>)
      const minhas = guias.filter((g) => g.tributoId === t.id)
      const aguardando = minhas
        .filter((g) => g.situacao === "aguardando_guia")
        .sort((a, b) => (a.vencimento ?? "9").localeCompare(b.vencimento ?? "9"))
      const lancadas = minhas.filter((g) => g.situacao === "lancado")
      return {
        ...t,
        proxima: aguardando[0] ?? null,
        ultimaLancada: lancadas[0] ?? null,
        guiasAguardando: aguardando.length,
        pagoNoAno: Math.round(
          lancadas
            .filter((g) => g.ordemSituacao === "Paga" && (g.dataPagamento ?? "").startsWith(ano))
            .reduce((a, g) => a + (g.valorPago ?? g.valor ?? 0), 0) * 100
        ) / 100,
      }
    }),
  }
}

export async function obterTributo(id: string): Promise<{ tributo: Tributo; guias: GuiaTributo[] } | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("financeiro_tributos")
    .select(SELECT_TRIBUTO)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return null
  return { tributo: paraTributo(data as Record<string, unknown>), guias: await todasAsGuias(id) }
}

/** Guia de uma ordem (procedência da ordem "Tributo"). */
export async function guiaDaOrdem(ordemId: string): Promise<{ guia: GuiaTributo; tributo: Tributo } | null> {
  const admin = await createAdminClient()
  const { data: o } = await admin.from("ordens_pagamento").select("tributo_lancamento_id").eq("id", ordemId).maybeSingle()
  if (!o?.tributo_lancamento_id) return null
  const { data: g } = await admin
    .from("financeiro_tributos_lancamentos")
    .select(SELECT_GUIA)
    .eq("id", String(o.tributo_lancamento_id))
    .maybeSingle()
  if (!g) return null
  const guia = paraGuia(g as Record<string, unknown>)
  const { data: t } = await admin.from("financeiro_tributos").select(SELECT_TRIBUTO).eq("id", guia.tributoId).maybeSingle()
  return t ? { guia, tributo: paraTributo(t as Record<string, unknown>) } : null
}

// ── Cadastro ────────────────────────────────────────────────────────────────

export type DadosTributo = {
  nome: string
  abreviacao: string | null
  esfera: EsferaTributo
  beneficiarioId: string | null
  centroCustoId: string | null
  departamentoId: string | null
  periodicidade: PeriodicidadeTributo
  diaVencimento: number | null
  valorEsperado: number | null
  formaPagamento: string | null
  observacoes: string | null
}

function registroDoCadastro(d: DadosTributo) {
  return {
    nome: d.nome,
    abreviacao: d.abreviacao,
    esfera: d.esfera,
    beneficiario_empresa_id: d.beneficiarioId,
    centro_custo_despesa_id: d.centroCustoId,
    departamento_id: d.departamentoId,
    periodicidade: d.periodicidade,
    dia_vencimento: d.periodicidade === "mensal" ? d.diaVencimento : null,
    valor_esperado: d.valorEsperado,
    forma_pagamento: d.formaPagamento,
    observacoes: d.observacoes,
  }
}

export async function criarTributo(d: DadosTributo, usuarioId: string): Promise<{ erro?: string; id?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_tributos")
    .insert({ ...registroDoCadastro(d), emp_proprietaria_id: await tenantAtual(), criado_por_usuario_id: usuarioId })
    .select("id")
    .single()
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_TRIBUTOS : `Não foi possível cadastrar: ${error.message}` }
  await garantirGuiasPrevistas(String(data.id))
  return { id: String(data.id) }
}

export async function atualizarTributo(id: string, d: DadosTributo & { ativo: boolean }): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("financeiro_tributos")
    .update({ ...registroDoCadastro(d), ativo: d.ativo, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  await garantirGuiasPrevistas(id)
  return {}
}

// ── Guias previstas (decisão D2) ───────────────────────────────────────────

function somarMeses(ano: number, mes: number, delta: number): [number, number] {
  const t = ano * 12 + (mes - 1) + delta
  return [Math.floor(t / 12), (t % 12) + 1]
}
function dataDoDia(ano: number, mes: number, dia: number): string {
  const ultimo = new Date(Date.UTC(ano, mes, 0)).getUTCDate()
  return `${ano}-${String(mes).padStart(2, "0")}-${String(Math.min(dia, ultimo)).padStart(2, "0")}`
}
function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Cria as guias PREVISTAS dos tributos mensais ativos: um vencimento por mês,
 * no dia habitual, a partir do mês seguinte ao último vencimento registrado,
 * até {DIAS_PREVISAO} dias à frente (e nunca mais que {DIAS_RETROATIVOS} dias
 * para trás). A competência é o mês anterior ao do vencimento. Idempotente:
 * roda ao abrir a área e ao salvar o tributo.
 */
export async function garantirGuiasPrevistas(tributoId?: string): Promise<number> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("financeiro_tributos")
    .select("id, dia_vencimento, valor_esperado")
    .eq("emp_proprietaria_id", emp)
    .eq("ativo", true)
    .eq("periodicidade", "mensal")
    .not("dia_vencimento", "is", null)
  if (tributoId) q = q.eq("id", tributoId)
  const { data: tributos, error } = await q
  if (error || !tributos?.length) return 0
  const hoje = hojeSP()
  const limite = somarDias(hoje, DIAS_PREVISAO)
  const piso = somarDias(hoje, -DIAS_RETROATIVOS)
  let criadas = 0
  for (const t of tributos) {
    const { data: ultima } = await admin
      .from("financeiro_tributos_lancamentos")
      .select("vencimento, competencia_inicio")
      .eq("tributo_id", String(t.id))
      .order("vencimento", { ascending: false, nullsFirst: false })
      .limit(1)
    const base = texto(ultima?.[0]?.vencimento) ?? texto(ultima?.[0]?.competencia_inicio) ?? somarDias(hoje, -31)
    let [ano, mes] = somarMeses(Number(base.slice(0, 4)), Number(base.slice(5, 7)), 1)
    const novas: Record<string, unknown>[] = []
    for (let i = 0; i < 24; i++) {
      const venc = dataDoDia(ano, mes, Number(t.dia_vencimento))
      if (venc > limite) break
      if (venc >= piso) {
        const [ac, mc] = somarMeses(ano, mes, -1)
        novas.push({
          emp_proprietaria_id: emp,
          tributo_id: t.id,
          competencia_inicio: `${ac}-${String(mc).padStart(2, "0")}-01`,
          competencia_fim: dataDoDia(ac, mc, 31),
          vencimento: venc,
          valor: t.valor_esperado ?? null,
          situacao: "aguardando_guia",
        })
      }
      ;[ano, mes] = somarMeses(ano, mes, 1)
    }
    if (novas.length) {
      const { error: e } = await admin.from("financeiro_tributos_lancamentos").insert(novas)
      if (e) console.error("garantirGuiasPrevistas:", e.message)
      else criadas += novas.length
    }
  }
  return criadas
}

export async function cancelarGuiaPrevista(guiaId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_tributos_lancamentos")
    .update({ situacao: "cancelado", updated_at: new Date().toISOString() })
    .eq("id", guiaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("situacao", "aguardando_guia")
    .select("id")
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if (!(data ?? []).length) return { erro: "Só uma guia prevista (aguardando) pode ser cancelada." }
  return {}
}

// ── Lançar a guia → ordem de pagamento ────────────────────────────────────

export type DadosGuia = {
  tributoId: string
  /** Guia prevista que recebe o documento; sem ela, cria uma guia avulsa. */
  guiaId: string | null
  /** "AAAA-MM" — mês de referência. */
  competencia: string
  valor: number
  vencimento: string
  arquivo: File
  linhaDigitavel: string | null
}

/**
 * Lança a guia: sobe o arquivo e gera a ordem "Tributo" (favorecido = órgão,
 * centro e departamento do tributo, boleto = a própria guia). Recorrente com
 * guia no valor esperado nasce "A pagar" (dispensa registrada); senão, alçada.
 */
export async function lancarGuia(d: DadosGuia, usuarioId: string): Promise<{ erro?: string; ordemId?: string; dispensada?: boolean }> {
  const det = await obterTributo(d.tributoId)
  if (!det) return { erro: "Tributo não encontrado." }
  const t = det.tributo
  if (!(d.valor > 0)) return { erro: "Informe o valor da guia." }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.vencimento)) return { erro: "Informe o vencimento da guia." }
  const m = d.competencia.match(/^(\d{4})-(\d{2})$/)
  if (!m) return { erro: "Informe a competência (mês de referência)." }
  if (!t.beneficiarioId) return { erro: "O tributo não tem órgão beneficiário — informe no cadastro antes de lançar a guia." }
  const prevista = d.guiaId ? det.guias.find((g) => g.id === d.guiaId) : null
  if (d.guiaId && !prevista) return { erro: "Guia não encontrada." }
  if (prevista && prevista.situacao !== "aguardando_guia") return { erro: "Esta guia já foi lançada ou cancelada." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [ano, mes] = [Number(m[1]), Number(m[2])]
  const competencia = { competencia_inicio: `${m[1]}-${m[2]}-01`, competencia_fim: dataDoDia(ano, mes, 31) }

  const up = await subirComprovanteCompras(`guias-tributos/${t.id}`, d.arquivo)
  if (up.erro || !up.caminho) return { erro: up.erro ?? "Falha ao subir a guia." }
  const descartar = () => admin.storage.from("compras").remove([up.caminho!])

  const recorrente = t.periodicidade !== "eventual"
  const noValor = t.valorEsperado !== null && Math.abs(d.valor - t.valorEsperado) < 0.005
  const nome = t.abreviacao ?? t.nome
  const rotulo = rotuloCompetencia(competencia.competencia_inicio, competencia.competencia_fim)
  const motivo = recorrente && noValor
    ? `Autorização dispensada: guia do tributo recorrente ${nome} no valor esperado (${formatarMoeda(t.valorEsperado!)}).`
    : null

  const { data: ordem, error: erroOrdem } = await inserirOrdemVerificada({
    codigo: gerarCodigoProcesso(),
    tipo: TIPO_ORDEM_TRIBUTO,
    descricao: `Tributo ${nome} — competência ${rotulo}${t.abreviacao && t.abreviacao !== t.nome ? ` (${t.nome})` : ""}.`,
    ...camposAutorizacaoInicial(motivo),
    valor_inicial_cobranca: d.valor,
    vencimento: d.vencimento,
    forma_pagamento: t.formaPagamento ?? "Boleto",
    arquivo_boleto: up.caminho,
    arquivo_nota_fiscal: up.caminho,
    boleto_linha_digitavel: d.linhaDigitavel,
    beneficiario_fornecedor_id: t.beneficiarioId,
    centro_custo_despesa_id: t.centroCustoId,
    departamento_id: t.departamentoId,
    excluido: false,
    emp_proprietaria_id: emp,
  })
  if (erroOrdem || !ordem) {
    await descartar()
    return { erro: `Não foi possível gerar a ordem de pagamento: ${erroOrdem?.message}` }
  }

  const campos = {
    ...competencia,
    valor: d.valor,
    vencimento: d.vencimento,
    arquivo_guia: up.caminho,
    linha_digitavel: d.linhaDigitavel,
    situacao: "lancado",
    ordem_pagamento_id: ordem.id,
    updated_at: new Date().toISOString(),
  }
  let guiaId = prevista?.id ?? null
  if (prevista) {
    const { data: ok, error } = await admin
      .from("financeiro_tributos_lancamentos")
      .update(campos)
      .eq("id", prevista.id)
      .eq("situacao", "aguardando_guia")
      .select("id")
    if (error || !(ok ?? []).length) {
      await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
      await descartar()
      return { erro: error ? `Não foi possível registrar a guia: ${error.message}` : "A guia mudou enquanto você lançava — recarregue a página." }
    }
  } else {
    const { data: nova, error } = await admin
      .from("financeiro_tributos_lancamentos")
      .insert({ ...campos, tributo_id: t.id, emp_proprietaria_id: emp, criado_por_usuario_id: usuarioId })
      .select("id")
      .single()
    if (error || !nova) {
      await admin.from("ordens_pagamento").delete().eq("id", ordem.id)
      await descartar()
      return { erro: `Não foi possível registrar a guia: ${error?.message}` }
    }
    guiaId = String(nova.id)
  }
  await admin.from("ordens_pagamento").update({ tributo_lancamento_id: guiaId }).eq("id", ordem.id)

  await registrarEvento(
    ordem.id,
    "criada",
    usuarioId,
    `Guia do tributo ${nome}, competência ${rotulo}, lançada em Financeiro › Tributos${motivo ? " — autorização dispensada (valor esperado)." : " — segue para a autorização por alçada."}`,
    { tributo_id: t.id, tributo_lancamento_id: guiaId }
  )
  if (motivo) await registrarEvento(ordem.id, "autorizacao_dispensada", usuarioId, motivo)
  return { ordemId: ordem.id, dispensada: Boolean(motivo) }
}
