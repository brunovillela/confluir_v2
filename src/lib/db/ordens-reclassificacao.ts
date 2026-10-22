import "server-only"

import { rotuloCentroCusto } from "@/lib/centros-custo-rotulo"
import { texto } from "@/lib/db/comum"
import { mesEstaFechado } from "@/lib/db/meses-fechados"
import { bloqueioDaFatura, registrarEvento } from "@/lib/db/ordens-ciclo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * RECLASSIFICAÇÃO da ordem pelo Financeiro (22/10/2026): centro de custo da
 * despesa, departamento e rateio são decisão técnica — mudam sem passar pela
 * autorização (o valor e o favorecido não mudam) e valem também para a ordem
 * já paga, até o mês do pagamento ser fechado para a contabilidade
 * (lib/db/meses-fechados.ts). Fica na trilha com o antes e o depois.
 *
 * Convenção do rateio (a mesma da diária e da fatura de cartão): com duas ou
 * mais linhas, a primeira é a da ordem e a soma fecha o valor da cobrança;
 * com uma linha só, não há rateio — a ordem toda é do centro dela.
 */

export type LinhaReclassificacao = {
  centroId: string | null
  departamentoId: string | null
  descricao: string | null
  valor: number
}

export type Reclassificacao = {
  centroId: string | null
  departamentoId: string | null
  /** Vazio (ou uma linha) = sem rateio. */
  rateio: LinhaReclassificacao[]
}

const SEM_RECLASSIFICACAO = ["Cancelada", "Estornado"]

function centavos(v: number): number {
  return Math.round(v * 100)
}

function rotuloMes(data: string): string {
  return `${data.slice(5, 7)}/${data.slice(0, 4)}`
}

export async function nomeDoDepartamento(id: string | null): Promise<string | null> {
  if (!id) return null
  const admin = await createAdminClient()
  const { data } = await admin.from("empresa_departamentos").select("departamento").eq("id", id).maybeSingle()
  return texto(data?.departamento)
}

/** Por que a ordem não pode ser reclassificada agora (null = pode). */
export async function travaDaReclassificacao(ordem: {
  id: string
  situacao: string | null
  data_pagamento: string | null
}): Promise<string | null> {
  const situacao = String(ordem.situacao ?? "")
  if (SEM_RECLASSIFICACAO.includes(situacao)) return `Ordem ${situacao.toLowerCase()} não se reclassifica.`
  if (situacao === "Paga" && (await mesEstaFechado(ordem.data_pagamento))) {
    return `O mês ${rotuloMes(String(ordem.data_pagamento))} já foi fechado para a contabilidade — reabra-o na Exportação contábil para reclassificar.`
  }
  const fatura = await bloqueioDaFatura(ordem.id)
  if (fatura) return `${fatura} Reclassifique pelo rateio da ordem da fatura.`
  return null
}

export async function reclassificarOrdem(
  ordemId: string,
  usuarioId: string,
  nova: Reclassificacao,
  motivo: string
): Promise<{ erro?: string }> {
  if (!motivo.trim()) return { erro: "Informe o motivo da reclassificação." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: o } = await admin
    .from("ordens_pagamento")
    .select("id, situacao, data_pagamento, valor_inicial_cobranca, valor_pago, centro_custo_despesa_id, departamento_id")
    .eq("id", ordemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!o) return { erro: "Ordem não encontrada." }
  const trava = await travaDaReclassificacao({
    id: ordemId,
    situacao: texto(o.situacao),
    data_pagamento: texto(o.data_pagamento),
  })
  if (trava) return { erro: trava }

  // Com rateio, o cabeçalho é a primeira linha; uma linha só não é rateio.
  const rateio = nova.rateio.length >= 2 ? nova.rateio : []
  const cabecalho =
    rateio.length > 0
      ? { centroId: rateio[0].centroId, departamentoId: rateio[0].departamentoId }
      : nova.rateio.length === 1
        ? { centroId: nova.rateio[0].centroId, departamentoId: nova.rateio[0].departamentoId }
        : { centroId: nova.centroId, departamentoId: nova.departamentoId }
  if (!cabecalho.centroId) return { erro: "Informe o centro de custo da despesa." }

  if (rateio.length > 0) {
    const base = Number(o.valor_inicial_cobranca ?? o.valor_pago ?? 0)
    if (rateio.some((l) => !l.centroId)) return { erro: "Cada linha do rateio precisa de um centro de custo." }
    if (rateio.some((l) => !(l.valor > 0))) return { erro: "Cada linha do rateio precisa de um valor maior que zero." }
    const soma = rateio.reduce((s, l) => s + centavos(l.valor), 0)
    if (soma !== centavos(base)) {
      const fmt = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
      return { erro: `O rateio soma ${fmt(soma)}, mas a ordem é de ${fmt(centavos(base))}.` }
    }
  }

  // Centros e departamentos escolhidos existem (e o centro aceita lançamento).
  const centroIds = [...new Set([cabecalho.centroId, ...rateio.map((l) => l.centroId)].filter((v): v is string => Boolean(v)))]
  const deptoIds = [
    ...new Set([cabecalho.departamentoId, ...rateio.map((l) => l.departamentoId)].filter((v): v is string => Boolean(v))),
  ]
  const [{ data: centros }, { data: deptos }] = await Promise.all([
    admin.from("centros_de_custo").select("id, usavel").in("id", centroIds),
    deptoIds.length
      ? admin.from("empresa_departamentos").select("id").eq("emp_proprietaria_id", emp).in("id", deptoIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const centrosOk = new Map(((centros ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c.usavel !== false]))
  const atualCentro = texto(o.centro_custo_despesa_id)
  for (const id of centroIds) {
    if (!centrosOk.has(id)) return { erro: "Centro de custo não encontrado." }
    if (!centrosOk.get(id) && id !== atualCentro) return { erro: "Um dos centros escolhidos não aceita lançamentos." }
  }
  if ((deptos ?? []).length !== deptoIds.length) return { erro: "Departamento não encontrado." }

  const { data: rateioAtual } = await admin
    .from("ordens_pagamento_rateio")
    .select("centro_custo_despesa_id, departamento_id, descricao, valor")
    .eq("ordem_id", ordemId)
    .order("ordem", { ascending: true })
  const antes = {
    centro_custo_despesa_id: atualCentro,
    departamento_id: texto(o.departamento_id),
    rateio: ((rateioAtual ?? []) as Record<string, unknown>[]).map((l) => ({
      centro_custo_despesa_id: texto(l.centro_custo_despesa_id),
      departamento_id: texto(l.departamento_id),
      descricao: texto(l.descricao),
      valor: Number(l.valor ?? 0),
    })),
  }
  const depois = {
    centro_custo_despesa_id: cabecalho.centroId,
    departamento_id: cabecalho.departamentoId,
    rateio: rateio.map((l) => ({
      centro_custo_despesa_id: l.centroId,
      departamento_id: l.departamentoId,
      descricao: l.descricao?.trim() || null,
      valor: centavos(l.valor) / 100,
    })),
  }
  if (JSON.stringify(antes) === JSON.stringify(depois)) return { erro: "Nada foi alterado." }

  const { error } = await admin
    .from("ordens_pagamento")
    .update({ centro_custo_despesa_id: depois.centro_custo_despesa_id, departamento_id: depois.departamento_id })
    .eq("id", ordemId)
  if (error) return { erro: `Não foi possível reclassificar: ${error.message}` }
  const mudouRateio = JSON.stringify(antes.rateio) !== JSON.stringify(depois.rateio)
  if (mudouRateio) {
    const { error: erroApaga } = await admin.from("ordens_pagamento_rateio").delete().eq("ordem_id", ordemId)
    if (erroApaga) return { erro: `Não foi possível trocar o rateio: ${erroApaga.message}` }
    if (depois.rateio.length > 0) {
      const { error: erroRateio } = await admin.from("ordens_pagamento_rateio").insert(
        depois.rateio.map((l, i) => ({ ...l, ordem_id: ordemId, ordem: i, emp_proprietaria_id: emp }))
      )
      if (erroRateio) {
        // Sem rateio, a ordem toda fica no centro do cabeçalho — avisa.
        await registrarEvento(ordemId, "reclassificada", usuarioId, await resumoDaMudanca(motivo, antes, { ...depois, rateio: [] }), {
          motivo,
          antes,
          depois: { ...depois, rateio: [] },
        })
        return { erro: `A classificação mudou, mas o rateio não foi gravado: ${erroRateio.message}` }
      }
    }
  }
  await registrarEvento(ordemId, "reclassificada", usuarioId, await resumoDaMudanca(motivo, antes, depois), {
    motivo,
    antes,
    depois,
  })
  return {}
}

type Classificacao = {
  centro_custo_despesa_id: string | null
  departamento_id: string | null
  rateio: { centro_custo_despesa_id: string | null; valor: number }[]
}

/** "Motivo (centro: A → B; rateio: sem rateio → A + B)" para a trilha da ordem. */
async function resumoDaMudanca(motivo: string, antes: Classificacao, depois: Classificacao): Promise<string> {
  const admin = await createAdminClient()
  const ids = [antes, depois].flatMap((c) => [c.centro_custo_despesa_id, ...c.rateio.map((l) => l.centro_custo_despesa_id)])
  const deptos = [antes.departamento_id, depois.departamento_id]
  const unicos = (l: (string | null)[]) => [...new Set(l.filter((v): v is string => Boolean(v)))]
  const [{ data: centros }, { data: departamentos }] = await Promise.all([
    admin.from("centros_de_custo").select("id, acesso, nome_da_conta").in("id", unicos(ids)),
    unicos(deptos).length
      ? admin.from("empresa_departamentos").select("id, departamento").in("id", unicos(deptos))
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ])
  const nomeCentro = new Map(((centros ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), rotuloCentroCusto(c)]))
  const nomeDepto = new Map(
    ((departamentos ?? []) as Record<string, unknown>[]).map((d) => [String(d.id), String(d.departamento ?? "(sem nome)")])
  )
  const centro = (id: string | null) => (id ? (nomeCentro.get(id) ?? "?") : "sem centro")
  const rateio = (c: Classificacao) =>
    c.rateio.length ? c.rateio.map((l) => centro(l.centro_custo_despesa_id)).join(" + ") : "sem rateio"
  const partes: string[] = []
  if (antes.centro_custo_despesa_id !== depois.centro_custo_despesa_id) {
    partes.push(`centro: ${centro(antes.centro_custo_despesa_id)} → ${centro(depois.centro_custo_despesa_id)}`)
  }
  if (antes.departamento_id !== depois.departamento_id) {
    const d = (id: string | null) => (id ? (nomeDepto.get(id) ?? "?") : "sem departamento")
    partes.push(`departamento: ${d(antes.departamento_id)} → ${d(depois.departamento_id)}`)
  }
  if (JSON.stringify(antes.rateio) !== JSON.stringify(depois.rateio)) {
    partes.push(`rateio: ${rateio(antes)} → ${rateio(depois)}`)
  }
  return partes.length ? `${motivo.trim()} (${partes.join("; ")})` : motivo.trim()
}
