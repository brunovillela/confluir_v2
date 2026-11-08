import "server-only"

import { FORMAS_COM_COMPROVANTE } from "@/lib/compras-constantes"
import { hojeSP } from "@/lib/db/comum"
import { ordensParecidas } from "@/lib/db/ordens-duplicidade"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * O QUE FAZER HOJE (07/11/2026): as filas de trabalho do Financeiro, para o
 * topo do painel — cada uma com a quantidade e o atalho para resolvê-la. Só
 * as que têm algo aparecem na tela.
 */

export type FilaFinanceiro = {
  codigo: string
  rotulo: string
  quantidade: number
  href: string
  /** Pede ação já (vencido, parado, possível erro). */
  urgente: boolean
}

const ABERTAS_PAGAVEIS = ["A pagar", "Processando"]

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function filasDoFinanceiro({ veAvaliacoes }: { veAvaliacoes: boolean }): Promise<FilaFinanceiro[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const ordens = () => admin.from("ordens_pagamento").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).not("excluido", "is", true)
  const n = (r: { count: number | null }) => r.count ?? 0

  const [venceHoje, vencidas, aguardandoInfo, emAutorizacao, semComprovante, extrato, estornos, processando, abertas] = await Promise.all([
    ordens().in("situacao", ABERTAS_PAGAVEIS).eq("vencimento", hoje),
    ordens().in("situacao", ABERTAS_PAGAVEIS).lt("vencimento", hoje),
    ordens().eq("situacao", "Aguardando informações"),
    veAvaliacoes ? ordens().eq("situacao", "Em autorização") : Promise.resolve({ count: 0 }),
    ordens()
      .eq("situacao", "Paga")
      .gte("data_pagamento", somarDias(hoje, -30))
      .is("arquivo_pagamento", null)
      .in("forma_pagamento", FORMAS_COM_COMPROVANTE),
    admin.from("banco_lancamentos").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "pendente"),
    admin.from("ordens_pagamento_estornos").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).is("resolvido_em", null),
    admin.from("ordens_pagamento").select("id").eq("emp_proprietaria_id", emp).not("excluido", "is", true).eq("situacao", "Processando").limit(1000),
    admin
      .from("ordens_pagamento")
      .select("id, valor_inicial_cobranca, vencimento, beneficiario_fornecedor_id, fornecedor_id, beneficiario_usuario_id")
      .eq("emp_proprietaria_id", emp)
      .not("excluido", "is", true)
      .in("situacao", ABERTAS_PAGAVEIS)
      .limit(1000),
  ])

  // Processando há 5 dias ou mais: a última troca para "Processando" na trilha.
  let processandoParado = 0
  const idsProc = (processando.data ?? []).map((o) => String(o.id))
  const limite = somarDias(hoje, -5)
  for (let i = 0; i < idsProc.length; i += 200) {
    const { data: evs } = await admin
      .from("ordens_pagamento_eventos")
      .select("ordem_id, created_at")
      .in("ordem_id", idsProc.slice(i, i + 200))
      .eq("tipo", "situacao_alterada")
      .eq("dados->>para", "Processando")
      .order("created_at", { ascending: false })
    const ultima = new Map<string, string>()
    for (const e of evs ?? []) if (!ultima.has(String(e.ordem_id))) ultima.set(String(e.ordem_id), String(e.created_at).slice(0, 10))
    for (const d of ultima.values()) if (d <= limite) processandoParado += 1
  }

  const parecidas = await ordensParecidas(
    (abertas.data ?? []).map((o) => ({
      id: String(o.id),
      valor_inicial_cobranca: o.valor_inicial_cobranca as number | null,
      vencimento: o.vencimento as string | null,
      beneficiario_fornecedor_id: o.beneficiario_fornecedor_id as string | null,
      fornecedor_id: o.fornecedor_id as string | null,
      beneficiario_usuario_id: o.beneficiario_usuario_id as string | null,
    }))
  ).catch(() => new Map())

  const filas: FilaFinanceiro[] = [
    { codigo: "vencidas", rotulo: "a pagar vencidas", quantidade: n(vencidas), href: "/painel/financeiro/ordens#vencidas", urgente: true },
    { codigo: "hoje", rotulo: "vencem hoje", quantidade: n(venceHoje), href: "/painel/financeiro/ordens#hoje", urgente: true },
    { codigo: "duplicadas", rotulo: "possíveis duplicadas a pagar", quantidade: parecidas.size, href: "/painel/financeiro/ordens#futuros", urgente: true },
    { codigo: "estornos", rotulo: "estornos para corrigir", quantidade: n(estornos), href: "/painel/financeiro/estornos", urgente: true },
    { codigo: "processando", rotulo: "Processando há 5 dias ou mais", quantidade: processandoParado, href: "/painel/financeiro/ordens?situacao=Processando", urgente: true },
    { codigo: "autorizacao", rotulo: "em autorização", quantidade: n(emAutorizacao), href: "/painel/compras/avaliacoes", urgente: false },
    { codigo: "informacoes", rotulo: "aguardando informações", quantidade: n(aguardandoInfo), href: "/painel/financeiro/ordens?situacao=Aguardando+informa%C3%A7%C3%B5es", urgente: false },
    { codigo: "comprovante", rotulo: "pagas sem comprovante (30 dias)", quantidade: n(semComprovante), href: "/painel/financeiro/ordens/comprovantes", urgente: false },
    { codigo: "extrato", rotulo: "lançamentos do extrato a conciliar", quantidade: n(extrato), href: "/painel/financeiro/conciliacao", urgente: false },
  ]
  return filas.filter((f) => f.quantidade > 0)
}

/** Módulos que a entidade nunca usou: vão para "Mais ferramentas" no painel. */
export async function modulosSemUso(): Promise<{ remessas: boolean; cartoes: boolean }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [remessas, cartaoOrdens, faturas] = await Promise.all([
    admin.from("financeiro_remessas").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp),
    admin.from("ordens_pagamento").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).not("cartao_id", "is", null),
    admin.from("financeiro_cartao_faturas").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp),
  ])
  return {
    remessas: !remessas.error && (remessas.count ?? 0) === 0,
    cartoes: !cartaoOrdens.error && !faturas.error && (cartaoOrdens.count ?? 0) + (faturas.count ?? 0) === 0,
  }
}
