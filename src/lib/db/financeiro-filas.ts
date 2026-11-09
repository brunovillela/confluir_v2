import "server-only"

import { FORMAS_COM_COMPROVANTE } from "@/lib/compras-constantes"
import { hojeSP } from "@/lib/db/comum"
import { ABERTAS_PAGAVEIS, DIAS_PROCESSANDO_PARADO, idsDuplicadasAPagar, idsProcessandoParado } from "@/lib/db/ordens-pendencias"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * O QUE FAZER HOJE (07/11/2026): as filas de trabalho do Financeiro, para o
 * topo do painel — cada uma com a quantidade e o atalho para resolvê-la. Só
 * as que têm algo aparecem na tela.
 */

/** Janela da fila "pagas sem comprovante" (hoje incluído). */
export const DIAS_COMPROVANTE = 30

export type FilaFinanceiro = {
  codigo: string
  rotulo: string
  quantidade: number
  href: string
  /** Pede ação já (vencido, parado, possível erro). */
  urgente: boolean
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

const ORDENS = "/painel/financeiro/ordens"
/** Cada indicador abre a lista filtrada pela mesma condição que ele conta. */
const lista = (params: Record<string, string>) => `${ORDENS}?${new URLSearchParams({ visao: "lista", ...params })}`

export async function filasDoFinanceiro({ veAvaliacoes }: { veAvaliacoes: boolean }): Promise<FilaFinanceiro[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const ordens = () => admin.from("ordens_pagamento").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).not("excluido", "is", true)
  const n = (r: { count: number | null }) => r.count ?? 0

  const [venceHoje, vencidas, aguardandoInfo, emAutorizacao, semComprovante, extrato, estornos, parados, duplicadas] = await Promise.all([
    ordens().in("situacao", ABERTAS_PAGAVEIS).eq("vencimento", hoje),
    ordens().in("situacao", ABERTAS_PAGAVEIS).lt("vencimento", hoje),
    ordens().eq("situacao", "Aguardando informações"),
    veAvaliacoes ? ordens().eq("situacao", "Em autorização") : Promise.resolve({ count: 0 }),
    ordens()
      .eq("situacao", "Paga")
      .gte("data_pagamento", somarDias(hoje, -(DIAS_COMPROVANTE - 1)))
      .is("arquivo_pagamento", null)
      .in("forma_pagamento", FORMAS_COM_COMPROVANTE),
    admin.from("banco_lancamentos").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "pendente"),
    admin.from("ordens_pagamento_estornos").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).is("resolvido_em", null),
    idsProcessandoParado().catch(() => []),
    idsDuplicadasAPagar().catch(() => []),
  ])

  const filas: FilaFinanceiro[] = [
    { codigo: "vencidas", rotulo: "a pagar vencidas", quantidade: n(vencidas), href: lista({ pendencia: "vencidas" }), urgente: true },
    { codigo: "hoje", rotulo: "vencem hoje", quantidade: n(venceHoje), href: lista({ pendencia: "vence_hoje" }), urgente: true },
    { codigo: "duplicadas", rotulo: "possíveis duplicadas a pagar", quantidade: duplicadas.length, href: lista({ pendencia: "duplicadas" }), urgente: true },
    { codigo: "estornos", rotulo: "estornos para corrigir", quantidade: n(estornos), href: "/painel/financeiro/estornos?situacao=pendentes", urgente: true },
    { codigo: "processando", rotulo: `Processando há ${DIAS_PROCESSANDO_PARADO} dias ou mais`, quantidade: parados.length, href: lista({ pendencia: "processando_parado" }), urgente: true },
    { codigo: "autorizacao", rotulo: "em autorização", quantidade: n(emAutorizacao), href: lista({ situacao: "Em autorização" }), urgente: false },
    { codigo: "informacoes", rotulo: "aguardando informações", quantidade: n(aguardandoInfo), href: lista({ situacao: "Aguardando informações" }), urgente: false },
    { codigo: "comprovante", rotulo: `pagas sem comprovante (${DIAS_COMPROVANTE} dias)`, quantidade: n(semComprovante), href: `${ORDENS}/comprovantes?dias=${DIAS_COMPROVANTE}`, urgente: false },
    { codigo: "extrato", rotulo: "lançamentos do extrato a conciliar", quantidade: n(extrato), href: "/painel/financeiro/conciliacao?situacao=pendente", urgente: false },
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
