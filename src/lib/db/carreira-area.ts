import "server-only"

import { cache } from "react"

import {
  formatarAliquota,
  listarAnuenios,
  listarNiveisSalariais,
  rotuloNivelSalarial,
  type AnuenioLancamento,
  type NivelLancamento,
} from "@/lib/db/carreira"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * CARREIRA no padrão de 3 níveis (lib/pessoal-area.ts). Anuênios e Níveis
 * salariais seguem como áreas próprias (nível 1, cada uma com Funcionários e
 * Lançamentos); o nível 2 é a Carreira da pessoa, com as duas partes; o nível
 * 3 é o lançamento (/anuenios/[id], /niveis/[id]).
 *
 * MULTITENANT: nem toda entidade usa anuênio ou tabela de níveis — a parte só
 * aparece quando a entidade tem lançamentos dela (`usoCarreira`).
 */

export type SituacaoAnuenio = {
  atual: AnuenioLancamento
  rotulo: string
  aliquota: string
  desde: string | null
  proximo: { data: string | null; rotulo: string } | null
  informado: boolean
}

export type SituacaoNivel = {
  atual: NivelLancamento
  rotulo: string
  salario: number | null
  desde: string | null
  proximo: { data: string | null; rotulo: string } | null
}

export const carregarCarreira = cache(async () => {
  const [anuenios, niveis] = await Promise.all([
    listarAnuenios().catch(() => [] as AnuenioLancamento[]),
    listarNiveisSalariais().catch(() => [] as NivelLancamento[]),
  ])
  // Listas já vêm da data mais recente para a mais antiga: o primeiro é o atual.
  const anuenioDe = new Map<string, SituacaoAnuenio>()
  for (const a of anuenios) {
    if (!a.funcionario_id || anuenioDe.has(a.funcionario_id)) continue
    anuenioDe.set(a.funcionario_id, {
      atual: a,
      rotulo: `Nível ${a.nivelAtual?.nivel ?? "?"}`,
      aliquota: formatarAliquota(a.nivelAtual?.aliquota),
      desde: a.nivel_atual_data,
      proximo: a.proximoNivel || a.proximo_nivel_data
        ? { data: a.proximo_nivel_data, rotulo: `Nível ${a.proximoNivel?.nivel ?? "?"} (${formatarAliquota(a.proximoNivel?.aliquota)})` }
        : null,
      informado: a.informado_contabilidade === true,
    })
  }
  const nivelDe = new Map<string, SituacaoNivel>()
  for (const n of niveis) {
    if (!n.funcionario_id || nivelDe.has(n.funcionario_id)) continue
    nivelDe.set(n.funcionario_id, {
      atual: n,
      rotulo: n.nivelAtual ? rotuloNivelSalarial(n.nivelAtual) : "—",
      salario: n.nivelAtual?.salario_base ?? null,
      desde: n.nivel_atual_data,
      proximo:
        n.proximoNivel || n.proximo_nivel_data || n.proximo_nivel_texto
          ? {
              data: n.proximo_nivel_data,
              rotulo: n.proximoNivel ? rotuloNivelSalarial(n.proximoNivel) : (n.proximo_nivel_texto ?? "—"),
            }
          : null,
    })
  }
  return { anuenios, niveis, anuenioDe, nivelDe }
})

/** A entidade usa anuênio? E níveis salariais? (Tem algum lançamento — só contagem.) */
export const usoCarreira = cache(async (): Promise<{ anuenios: boolean; niveis: boolean }> => {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const contar = async (tabela: string) => {
    const { count, error } = await admin.from(tabela).select("id", { count: "exact", head: true }).eq("emp_proprietaria_id", emp)
    return !error && (count ?? 0) > 0
  }
  const [anuenios, niveis] = await Promise.all([contar("pessoal_anuenio"), contar("pessoal_nivel_salarial")])
  return { anuenios, niveis }
})

/** Avanços previstos até `ate` (AAAA-MM-DD), a partir de hoje. */
export function avancaAte(data: string | null | undefined, hoje: string, ate: string): boolean {
  return Boolean(data && data >= hoje && data <= ate)
}
