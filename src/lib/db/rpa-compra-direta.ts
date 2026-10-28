import "server-only"

import { revalidatePath } from "next/cache"

import { avisarOrdensEmAutorizacao, depoisDaResposta } from "@/lib/db/avisos"
import { texto } from "@/lib/db/comum"
import { obterConfigRpa, proximoNumeroRpa } from "@/lib/db/compras-rpa"
import { registrarEvento, SITUACAO_AGUARDANDO_DOCUMENTO } from "@/lib/db/ordens-ciclo"
import { calcularRpaPadrao, opcoesPadraoRpa, TIPO_ORDEM_RPA } from "@/lib/rpa-calculo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * RPA na AQUISIÇÃO DIRETA (28/10/2026). Com "Prestador autônomo — pagar por
 * RPA", a própria compra resolve o documento fiscal de dois jeitos:
 *
 * 1. cria o RPA com as alíquotas padrão (INSS, IRRF e ISS retidos, sem
 *    dependentes), a partir do valor bruto ou do líquido informado;
 * 2. usa um RPA AVULSO já emitido para o fornecedor — emitido na área de RPA
 *    sem compra nem contrato, e ainda sem ordem de pagamento.
 *
 * Nos dois, a ordem da compra (criada "Aguardando documento fiscal", já no
 * valor líquido) passa a ser a ordem do RPA. RPA avulso que já tem o recibo
 * assinado leva a ordem direto para autorização.
 */

export type RpaAvulso = {
  id: string
  numero: number | null
  fornecedorId: string
  descricao: string | null
  valorBruto: number
  valorLiquido: number
  assinado: boolean
  emitidoEm: string
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v) || 0)

/** RPAs avulsos (sem contrato, sem compra e sem ordem) — os disponíveis para uma compra. */
export async function listarRpasAvulsos(fornecedorId?: string): Promise<RpaAvulso[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("compras_rpa")
    .select("id, numero, fornecedor_id, descricao_servico, valor_bruto, valor_liquido, arquivo_assinado, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .is("ordem_pagamento_id", null)
    .is("contrato_id", null)
    .is("fornecimento_id", null)
    .not("fornecedor_id", "is", null)
  if (fornecedorId) q = q.eq("fornecedor_id", fornecedorId)
  const { data, error } = await q.order("numero", { ascending: false }).limit(500)
  if (error) {
    console.error("RPAs avulsos:", error.message)
    return []
  }
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    numero: r.numero == null ? null : Number(r.numero),
    fornecedorId: String(r.fornecedor_id),
    descricao: texto(r.descricao_servico),
    valorBruto: num(r.valor_bruto),
    valorLiquido: num(r.valor_liquido),
    assinado: Boolean(texto(r.arquivo_assinado)),
    emitidoEm: String(r.created_at),
  }))
}

type Vinculo = { processoId: string; fornecimentoId: string; ordemId: string; usuarioId: string }

/** A ordem da compra vira a ordem do RPA (continua aguardando o recibo assinado). */
async function ligarOrdem(ordemId: string, numero: number | null, descricao: string | null) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .update({ tipo: TIPO_ORDEM_RPA, descricao: `RPA nº ${numero ?? "—"} — ${descricao ?? "serviço de autônomo"}` })
    .eq("id", ordemId)
    .eq("situacao", SITUACAO_AGUARDANDO_DOCUMENTO)
    .select("id")
  return Boolean(data?.length)
}

/** Opção 1: emite o RPA com as alíquotas padrão e o liga à ordem da compra. */
export async function emitirRpaPadraoNaCompra(
  p: Vinculo & {
    fornecedorId: string
    descricao: string
    dataServico: string | null
    base: "bruto" | "liquido"
    valor: number
  }
): Promise<{ rpaId?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const cfg = await obterConfigRpa()
  const op = opcoesPadraoRpa(cfg)
  const r = calcularRpaPadrao(p.valor, p.base, cfg)
  if (!(r.valorLiquido > 0)) return { erro: "O valor líquido do RPA ficou zerado." }

  let rpaId: string | null = null
  let numero: number | null = null
  let ultimoErro = ""
  for (let i = 0; i < 3 && !rpaId; i++) {
    const n = await proximoNumeroRpa()
    const { data, error } = await admin
      .from("compras_rpa")
      .insert({
        emp_proprietaria_id: emp,
        numero: n,
        contrato_id: null,
        fornecedor_id: p.fornecedorId,
        descricao_servico: p.descricao,
        data_servico: p.dataServico,
        base: p.base,
        valor_informado: p.valor,
        valor_bruto: r.valorBruto,
        inss: r.inss,
        irrf: r.irrf,
        iss: r.iss,
        iss_aliquota: op.issAliquota,
        dependentes: op.dependentes,
        valor_liquido: r.valorLiquido,
        criado_por: p.usuarioId,
        processo_compra_id: p.processoId,
        fornecimento_id: p.fornecimentoId,
        ordem_pagamento_id: p.ordemId,
      })
      .select("id")
      .single()
    if (data) {
      rpaId = String(data.id)
      numero = n
    } else {
      ultimoErro = error?.message ?? ""
    }
  }
  if (!rpaId) return { erro: `o RPA não foi emitido (${ultimoErro})` }
  if (!(await ligarOrdem(p.ordemId, numero, p.descricao))) {
    await admin.from("compras_rpa").delete().eq("id", rpaId)
    return { erro: "a ordem da compra mudou de situação antes de receber o RPA" }
  }
  await registrarEvento(
    p.ordemId,
    "corrigida",
    p.usuarioId,
    `RPA nº ${numero} emitido na compra com as alíquotas padrão (${p.base === "bruto" ? "a partir do bruto" : "a partir do líquido"}) — é o documento fiscal; a ordem aguarda o recibo assinado pelo prestador.`,
    { rpa_id: rpaId }
  )
  revalidatePath("/painel/compras/rpa")
  return { rpaId }
}

/** Opção 2: liga um RPA avulso do fornecedor à ordem da compra. */
export async function usarRpaAvulsoNaCompra(
  p: Vinculo & { rpaId: string; fornecedorId: string }
): Promise<{ rpaId?: string; erro?: string; seguiu?: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: rpa } = await admin
    .from("compras_rpa")
    .select("id, numero, fornecedor_id, descricao_servico, arquivo_assinado, ordem_pagamento_id, contrato_id, fornecimento_id")
    .eq("id", p.rpaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!rpa) return { erro: "o RPA escolhido não foi encontrado" }
  if (String(rpa.fornecedor_id) !== p.fornecedorId) return { erro: "o RPA escolhido é de outro fornecedor" }
  if (rpa.ordem_pagamento_id || rpa.contrato_id || rpa.fornecimento_id) {
    return { erro: "o RPA escolhido já foi usado em outra ordem" }
  }
  // Trava contra uso simultâneo: só liga se continuar sem ordem.
  const { data: ligado } = await admin
    .from("compras_rpa")
    .update({
      processo_compra_id: p.processoId,
      fornecimento_id: p.fornecimentoId,
      ordem_pagamento_id: p.ordemId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", p.rpaId)
    .is("ordem_pagamento_id", null)
    .select("id")
  if (!ligado?.length) return { erro: "o RPA escolhido acabou de ser usado em outra ordem" }
  const numero = rpa.numero == null ? null : Number(rpa.numero)
  const descricao = texto(rpa.descricao_servico)
  if (!(await ligarOrdem(p.ordemId, numero, descricao))) {
    await admin
      .from("compras_rpa")
      .update({ processo_compra_id: null, fornecimento_id: null, ordem_pagamento_id: null })
      .eq("id", p.rpaId)
    return { erro: "a ordem da compra mudou de situação antes de receber o RPA" }
  }

  // Recibo já assinado: é o documento fiscal que a ordem espera.
  const assinado = texto(rpa.arquivo_assinado)
  let seguiu = false
  if (assinado) {
    await admin.from("compras_fornecimentos").update({ nota_fiscal_url: assinado }).eq("id", p.fornecimentoId)
    const { data: movida } = await admin
      .from("ordens_pagamento")
      .update({ situacao: "Em autorização", arquivo_nota_fiscal: assinado })
      .eq("id", p.ordemId)
      .eq("situacao", SITUACAO_AGUARDANDO_DOCUMENTO)
      .select("id")
    seguiu = Boolean(movida?.length)
  }
  await registrarEvento(
    p.ordemId,
    seguiu ? "documento_fiscal" : "corrigida",
    p.usuarioId,
    seguiu
      ? `RPA avulso nº ${numero ?? "—"}, já assinado pelo prestador, ligado à compra — é o documento fiscal; a ordem seguiu para autorização.`
      : `RPA avulso nº ${numero ?? "—"} ligado à compra — é o documento fiscal; a ordem aguarda o recibo assinado pelo prestador.`,
    seguiu ? { arquivo_nota_fiscal: assinado, rpa_id: p.rpaId } : { rpa_id: p.rpaId }
  )
  if (seguiu) {
    depoisDaResposta(() => avisarOrdensEmAutorizacao([p.ordemId]))
    revalidatePath("/painel/compras/avaliacoes")
  }
  revalidatePath("/painel/compras/rpa")
  revalidatePath(`/painel/compras/rpa/${p.rpaId}`)
  return { rpaId: p.rpaId, seguiu }
}
