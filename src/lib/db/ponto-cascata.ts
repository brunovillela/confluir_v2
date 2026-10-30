import "server-only"

import { lerEmLotesPorIds, texto } from "@/lib/db/comum"
import { competenciaDaRemessa } from "@/lib/db/ponto-analise"
import { duasCasas } from "@/lib/horas"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * SALDOS EM CADEIA ENTRE REMESSAS DE PONTO (30/10/2026).
 *
 * O "saldo da remessa anterior" de um registro é o saldo remanescente do mesmo
 * funcionário na remessa ANTERIOR em que ele aparece (pela competência — ver
 * saldosAnterioresPonto). Mudar um registro antigo deixa as remessas
 * seguintes com o saldo velho; aqui elas são refeitas, uma a uma, em ordem:
 * anterior = remanescente da anterior; remanescente = anterior + realizadas −
 * pagas. Só quando o gestor pede (o formulário pergunta).
 *
 * Remessa FINALIZADA está travada: a cadeia para nela, e as seguintes também
 * ficam como estão (dependem do saldo dela, que não muda).
 */

type RemessaCadeia = { id: string; competencia: string; nome: string; finalizada: boolean }

async function remessasDoTenant(): Promise<RemessaCadeia[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("pessoal_registro_ponto_remessas")
    .select("id, nome_remessa, mes_referencia_os, ano_referencia_os, finalizada")
    .eq("emp_proprietaria_id", await tenantAtual())
  return ((data ?? []) as Record<string, unknown>[])
    .map((r) => ({
      id: String(r.id),
      competencia: competenciaDaRemessa(r) ?? "",
      nome: texto(r.nome_remessa) ?? "(sem nome)",
      finalizada: r.finalizada === true,
    }))
    .filter((r) => r.competencia)
    .sort((a, b) => a.competencia.localeCompare(b.competencia))
}

export type RemessaPosterior = { remessa: string; finalizada: boolean }

/**
 * Por funcionário: as remessas POSTERIORES a esta em que ele tem registro (em
 * ordem). O formulário usa para perguntar se recalcula.
 */
export async function posterioresPorFuncionario(remessaId: string): Promise<Record<string, RemessaPosterior[]>> {
  const remessas = await remessasDoTenant()
  const atual = remessas.find((r) => r.id === remessaId)
  if (!atual) return {}
  const depois = remessas.filter((r) => r.competencia > atual.competencia)
  if (!depois.length) return {}
  const admin = await createAdminClient()
  const regs = await lerEmLotesPorIds<{ remessa_id: string; funcionario_id: string | null }>(
    depois.map((r) => r.id),
    (fatia, de, ate) =>
      admin.from("pessoal_registro_ponto").select("id, remessa_id, funcionario_id").in("remessa_id", fatia).order("id").range(de, ate)
  )
  const porId = new Map(depois.map((r, i) => [r.id, { ...r, i }]))
  const saida: Record<string, (RemessaPosterior & { i: number })[]> = {}
  for (const r of regs) {
    const rem = porId.get(String(r.remessa_id))
    if (!r.funcionario_id || !rem) continue
    ;(saida[r.funcionario_id] ??= []).push({ remessa: rem.nome, finalizada: rem.finalizada, i: rem.i })
  }
  return Object.fromEntries(
    Object.entries(saida).map(([f, l]) => [f, l.sort((a, b) => a.i - b.i).map(({ remessa, finalizada }) => ({ remessa, finalizada }))])
  )
}

export type ResultadoCascata = { recalculadas: string[]; paradaEm: string | null }

/**
 * Refaz o saldo anterior e o remanescente do funcionário nas remessas depois
 * desta, em ordem, até a primeira finalizada. Serve à edição, à inclusão e à
 * exclusão do registro desta remessa.
 */
export async function recalcularPosteriores(remessaId: string, funcionarioId: string): Promise<ResultadoCascata> {
  const remessas = await remessasDoTenant()
  const atual = remessas.find((r) => r.id === remessaId)
  if (!atual) return { recalculadas: [], paradaEm: null }
  const depois = remessas.filter((r) => r.competencia > atual.competencia)
  if (!depois.length) return { recalculadas: [], paradaEm: null }

  const admin = await createAdminClient()
  const { data: regs } = await admin
    .from("pessoal_registro_ponto")
    .select("id, remessa_id, horas_realizadas_70, horas_pagas_70, saldo_remanescente_70, horas_realizadas_100, horas_pagas_100, saldo_remanescente_100")
    .eq("funcionario_id", funcionarioId)
    .in("remessa_id", remessas.map((r) => r.id))
  const porRemessa = new Map(((regs ?? []) as Record<string, unknown>[]).map((r) => [String(r.remessa_id), r]))
  const num = (v: unknown) => (v === null || v === undefined ? null : Number(v))

  // O ponto de partida é o registro desta remessa; se ele foi EXCLUÍDO, o da
  // última remessa antes dela em que o funcionário aparece (sem nenhuma, nulo).
  const base =
    porRemessa.get(atual.id) ??
    [...remessas]
      .filter((r) => r.competencia < atual.competencia)
      .reverse()
      .map((r) => porRemessa.get(r.id))
      .find(Boolean)
  let saldo70 = base ? num(base.saldo_remanescente_70) : null
  let saldo100 = base ? num(base.saldo_remanescente_100) : null
  const recalculadas: string[] = []
  for (const rem of depois) {
    const reg = porRemessa.get(rem.id)
    if (!reg) continue
    if (rem.finalizada) return { recalculadas, paradaEm: rem.nome }
    const conta = (ant: number | null, real: unknown, pag: unknown) => {
      const partes = [ant, num(real), num(pag)]
      return partes.every((v) => v === null) ? null : duasCasas((partes[0] ?? 0) + (partes[1] ?? 0) - (partes[2] ?? 0))
    }
    const rem70 = conta(saldo70, reg.horas_realizadas_70, reg.horas_pagas_70)
    const rem100 = conta(saldo100, reg.horas_realizadas_100, reg.horas_pagas_100)
    const { error } = await admin
      .from("pessoal_registro_ponto")
      .update({
        saldo_remessa_anterior_70: saldo70,
        saldo_remessa_anterior_100: saldo100,
        saldo_remanescente_70: rem70,
        saldo_remanescente_100: rem100,
      })
      .eq("id", String(reg.id))
    if (error) throw new Error(`Falha ao recalcular ${rem.nome}: ${error.message}`)
    recalculadas.push(rem.nome)
    saldo70 = rem70
    saldo100 = rem100
  }
  return { recalculadas, paradaEm: null }
}
