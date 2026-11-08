import "server-only"

import { FORMAS_COM_COMPROVANTE } from "@/lib/compras-constantes"
import { hojeSP, lerEmLotes } from "@/lib/db/comum"
import { listarMesesFechados } from "@/lib/db/meses-fechados"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * PENDÊNCIAS DO FECHAMENTO (07/11/2026). A trava de mês fechado existia, mas
 * nenhum mês tinha sido fechado. Aqui, o que costuma ficar esquecido antes de
 * entregar o mês à contabilidade — para o lembrete no painel do Financeiro e a
 * lista ao lado do botão Fechar. A régua é a da exportação: data do pagamento.
 */

export type PendenciaFechamento = {
  codigo: string
  rotulo: string
  explicacao: string
  quantidade: number
  href: string
}

export type ResumoFechamento = {
  /** "AAAA-MM". */
  mes: string
  pendencias: PendenciaFechamento[]
  total: number
}

const NOME_MES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]

export function nomeDoMes(mes: string): string {
  return `${NOME_MES[Number(mes.slice(5, 7)) - 1]}/${mes.slice(0, 4)}`
}

function limitesDoMes(mes: string): { de: string; ate: string } {
  const [a, m] = mes.split("-").map(Number)
  const fim = new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10)
  return { de: `${mes}-01`, ate: fim }
}

/** As pendências de um mês (só as que têm algo). */
export async function pendenciasDoMes(mes: string): Promise<ResumoFechamento> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { de, ate } = limitesDoMes(mes)
  const ordens = () => admin.from("ordens_pagamento").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).not("excluido", "is", true)
  const pagasNoMes = () => ordens().eq("situacao", "Paga").gte("data_pagamento", de).lte("data_pagamento", ate)

  const [semComprovante, semDebito, processando, aPagarVencidas, semCentro, extrato] = await Promise.all([
    // Pagamento por banco sem o comprovante (Dinheiro é pago no caixa).
    pagasNoMes().is("arquivo_pagamento", null).in("forma_pagamento", FORMAS_COM_COMPROVANTE),
    pagasNoMes().is("centro_custo_receita_id", null),
    // Processando com vencimento no mês ou antes: o pagamento saiu e não foi registrado?
    ordens().eq("situacao", "Processando").lte("vencimento", ate),
    ordens().eq("situacao", "A pagar").gte("vencimento", de).lte("vencimento", ate),
    // Sem centro de custo e sem rateio: a contabilidade não sabe onde lançar.
    (async () => {
      const ids = await lerEmLotes<{ id: string }>((a, b) =>
        admin
          .from("ordens_pagamento")
          .select("id")
          .eq("emp_proprietaria_id", emp)
          .not("excluido", "is", true)
          .eq("situacao", "Paga")
          .gte("data_pagamento", de)
          .lte("data_pagamento", ate)
          .is("centro_custo_despesa_id", null)
          .order("id")
          .range(a, b)
      ).catch(() => [] as { id: string }[])
      if (ids.length === 0) return 0
      const comRateio = new Set<string>()
      for (let i = 0; i < ids.length; i += 200) {
        const { data } = await admin.from("ordens_pagamento_rateio").select("ordem_id").in("ordem_id", ids.slice(i, i + 200).map((o) => o.id))
        for (const r of data ?? []) comRateio.add(String(r.ordem_id))
      }
      return ids.filter((o) => !comRateio.has(o.id)).length
    })(),
    admin.from("banco_lancamentos").select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp).eq("situacao", "pendente").gte("data", de).lte("data", ate),
  ])

  const n = (r: { count: number | null } | number) => (typeof r === "number" ? r : (r.count ?? 0))
  const lista: PendenciaFechamento[] = [
    {
      codigo: "processando",
      rotulo: "Processando sem registro do pagamento",
      explicacao: "Vencem no mês ou antes e seguem Processando: registre o pagamento (ou pelo extrato do banco) ou volte para A pagar.",
      quantidade: n(processando),
      href: "/painel/financeiro/ordens?situacao=Processando",
    },
    {
      codigo: "a_pagar",
      rotulo: "A pagar que venciam no mês",
      explicacao: "Ficaram para trás: pague, mude o vencimento ou cancele.",
      quantidade: n(aPagarVencidas),
      href: "/painel/financeiro/ordens?situacao=A+pagar#vencidas",
    },
    {
      codigo: "sem_comprovante",
      rotulo: "Pagas por Pix ou TED sem comprovante",
      explicacao: "Anexe pela ordem ou de uma vez pela Distribuição de comprovantes.",
      quantidade: n(semComprovante),
      href: `/painel/financeiro/ordens/comprovantes?mes=${mes}`,
    },
    {
      codigo: "sem_centro",
      rotulo: "Pagas sem centro de custo",
      explicacao: "Sem centro e sem rateio, a contabilidade não sabe onde lançar. Reclassifique pela ordem.",
      quantidade: n(semCentro),
      href: `/painel/financeiro/ordens?visao=lista&pendencia=sem_centro&pagoNoMes=${mes}`,
    },
    {
      codigo: "sem_debito",
      rotulo: "Pagas sem a conta de débito",
      explicacao: "Falta a conta de onde o dinheiro saiu. Edite o pagamento na ordem.",
      quantidade: n(semDebito),
      href: `/painel/financeiro/ordens?visao=lista&pendencia=sem_debito&pagoNoMes=${mes}`,
    },
    {
      codigo: "extrato",
      rotulo: "Lançamentos do extrato sem conciliar",
      explicacao: "Saídas e entradas do banco no mês que ainda não casaram com nada.",
      quantidade: n(extrato),
      href: "/painel/financeiro/conciliacao",
    },
  ]
  const pendencias = lista.filter((p) => p.quantidade > 0)
  return { mes, pendencias, total: pendencias.reduce((s, p) => s + p.quantidade, 0) }
}

/**
 * Lembrete do painel: a partir do dia 5, o mês anterior ainda aberto. null
 * quando já foi fechado (ou antes do dia 5).
 */
export async function lembreteDeFechamento(): Promise<(ResumoFechamento & { abertosAntes: number }) | null> {
  const hoje = hojeSP()
  if (Number(hoje.slice(8, 10)) < 5) return null
  const [a, m] = hoje.split("-").map(Number)
  const anterior = new Date(Date.UTC(a, m - 2, 1)).toISOString().slice(0, 7)
  const fechados = new Set((await listarMesesFechados().catch(() => [])).map((f) => f.mes))
  if (fechados.has(anterior)) return null
  const resumo = await pendenciasDoMes(anterior)
  // Meses abertos antes do anterior, nos 12 meses: dá a medida do atraso.
  let abertosAntes = 0
  for (let i = 2; i <= 12; i++) {
    const mes = new Date(Date.UTC(a, m - 1 - i, 1)).toISOString().slice(0, 7)
    if (!fechados.has(mes)) abertosAntes += 1
  }
  return { ...resumo, abertosAntes }
}
