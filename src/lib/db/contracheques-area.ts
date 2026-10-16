import "server-only"

import { cache } from "react"

import { lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { listarRemessasContracheques, naturezaRemessaContracheques, type RemessaContracheques } from "@/lib/db/pessoal"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Base da área Contracheques no padrão de 3 níveis (lib/pessoal-area.ts):
 * todos os contracheques da entidade (≈3 mil) com a remessa, a natureza e a
 * competência lida do nome da remessa ("Outubro/2026 - Adiantamento").
 */

const MESES = [
  "janeiro", "fevereiro", "março", "abril", "maio", "junho",
  "julho", "agosto", "setembro", "outubro", "novembro", "dezembro",
]

export type ContrachequeArea = {
  id: string
  remessaId: string
  remessaNome: string
  remessaOrdem: number
  remessaFinalizada: boolean
  natureza: string
  /** AAAA-MM quando o nome da remessa traz o mês; senão AAAA. */
  competencia: string
  ano: string
  funcionarioId: string
  liberado: boolean
  arquivo: string | null
  valor: number | null
  ordemPagamentoId: string | null
  criadoEm: string | null
}

export function competenciaDaRemessaCc(r: Pick<RemessaContracheques, "nome_remessa" | "created_at">): string {
  const nome = (r.nome_remessa ?? "").toLowerCase()
  const ano = /(20\d{2}|19\d{2})/.exec(nome)?.[1] ?? (r.created_at ?? "").slice(0, 4)
  const mes = MESES.findIndex((m) => nome.includes(m))
  return mes >= 0 && ano ? `${ano}-${String(mes + 1).padStart(2, "0")}` : ano
}

export function rotuloCompetenciaCc(c: string): string {
  if (c.length === 4) return c
  const [a, m] = c.split("-")
  const nome = MESES[Number(m) - 1]
  return `${nome[0].toUpperCase()}${nome.slice(1)}/${a}`
}

export const carregarBaseContracheques = cache(async () => {
  const remessas = await listarRemessasContracheques()
  const porId = new Map(remessas.map((r) => [r.id, r]))
  const admin = await createAdminClient()
  const brutos = await lerEmLotesPorIds(
    remessas.map((r) => r.id),
    (fatia, de, ate) =>
      admin
        .from("pessoal_contracheques")
        // "*": valor e ordem só existem depois do SQL da folha.
        .select("*")
        .in("remessa_id", fatia)
        .order("id")
        .range(de, ate)
  )
  const contracheques: ContrachequeArea[] = []
  for (const b of brutos) {
    const r = porId.get(String(b.remessa_id))
    const f = texto(b.funcionario_id)
    if (!r || !f) continue
    const competencia = competenciaDaRemessaCc(r)
    contracheques.push({
      id: String(b.id),
      remessaId: r.id,
      remessaNome: r.nome_remessa ?? "(sem nome)",
      remessaOrdem: r.ordem ?? 0,
      remessaFinalizada: r.finalizada === true,
      natureza: naturezaRemessaContracheques(r),
      competencia,
      ano: competencia.slice(0, 4),
      funcionarioId: f,
      liberado: b.liberado === true,
      arquivo: texto(b.arquivo),
      valor: b.valor_liquido === null || b.valor_liquido === undefined ? null : Number(b.valor_liquido),
      ordemPagamentoId: texto(b.ordem_pagamento_id),
      criadoEm: texto(b.created_at),
    })
  }
  // Mais recente primeiro (a ordem da remessa é a sequência de lançamento).
  contracheques.sort((a, b) => b.remessaOrdem - a.remessaOrdem || (b.criadoEm ?? "").localeCompare(a.criadoEm ?? ""))
  return { remessas, contracheques }
})

export type ResumoContracheques = {
  quantidade: number
  liberados: number
  bloqueados: number
  valor: number
  comValor: number
  ultimo: ContrachequeArea | null
}

export function resumirContracheques(lista: ContrachequeArea[]): ResumoContracheques {
  return {
    quantidade: lista.length,
    liberados: lista.filter((c) => c.liberado).length,
    bloqueados: lista.filter((c) => !c.liberado).length,
    valor: lista.reduce((s, c) => s + (c.valor ?? 0), 0),
    comValor: lista.filter((c) => c.valor !== null).length,
    ultimo: lista[0] ?? null,
  }
}
