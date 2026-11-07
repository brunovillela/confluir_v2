import "server-only"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * POSSÍVEL DUPLICIDADE NA HORA DE PAGAR (07/11/2026). A regra "duplicidade"
 * da auditoria só confere na criação e o alerta fica guardado na ordem; aqui a
 * mesma conferência é feita ao vivo para quem vai pagar: outra ordem não
 * cancelada do mesmo favorecido (empresa ou pessoa do quadro), mesmo valor
 * cobrado e vencimento a até JANELA_DIAS dias.
 */
export const JANELA_DIAS = 7

export type OrdemParaComparar = {
  id: string
  valor_inicial_cobranca: number | null
  vencimento: string | null
  beneficiario_fornecedor_id: string | null
  fornecedor_id: string | null
  beneficiario_usuario_id: string | null
}

export type OrdemParecida = {
  id: string
  codigo: string | null
  situacao: string | null
  vencimento: string | null
}

const FORA = ["Cancelada", "Estornado"]

function chave(o: Pick<OrdemParaComparar, "beneficiario_fornecedor_id" | "fornecedor_id" | "beneficiario_usuario_id">): string | null {
  const empresa = o.beneficiario_fornecedor_id ?? o.fornecedor_id
  if (empresa) return `e:${empresa}`
  if (o.beneficiario_usuario_id) return `u:${o.beneficiario_usuario_id}`
  return null
}

const centavos = (v: unknown) => Math.round(Number(v) * 100)

function diasEntre(a: string, b: string): number {
  return Math.abs(Date.parse(`${a.slice(0, 10)}T12:00:00Z`) - Date.parse(`${b.slice(0, 10)}T12:00:00Z`)) / 86_400_000
}

function somarDias(data: string, dias: number): string {
  const d = new Date(`${data.slice(0, 10)}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

/** Para cada ordem, as outras que parecem a mesma cobrança. */
export async function ordensParecidas(ordens: OrdemParaComparar[]): Promise<Map<string, OrdemParecida[]>> {
  const resultado = new Map<string, OrdemParecida[]>()
  const alvo = ordens.filter((o) => chave(o) && o.vencimento && Number(o.valor_inicial_cobranca) > 0)
  if (alvo.length === 0) return resultado

  const empresas = [...new Set(alvo.map((o) => o.beneficiario_fornecedor_id ?? o.fornecedor_id).filter((v): v is string => !!v))]
  const usuarios = [...new Set(alvo.filter((o) => !(o.beneficiario_fornecedor_id ?? o.fornecedor_id)).map((o) => o.beneficiario_usuario_id!))]
  const datas = alvo.map((o) => o.vencimento!.slice(0, 10)).sort()
  const de = somarDias(datas[0], -JANELA_DIAS)
  const ate = somarDias(datas[datas.length - 1], JANELA_DIAS)
  const valores = [...new Set(alvo.map((o) => Number(o.valor_inicial_cobranca)))]

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  type Candidata = OrdemParecida & OrdemParaComparar
  const candidatas: Candidata[] = []
  // Fatias pequenas: a lista de ids vai na URL do PostgREST.
  const filtros: string[] = []
  for (let i = 0; i < empresas.length; i += 60) {
    const f = empresas.slice(i, i + 60).join(",")
    filtros.push(`beneficiario_fornecedor_id.in.(${f}),fornecedor_id.in.(${f})`)
  }
  for (let i = 0; i < usuarios.length; i += 60) filtros.push(`beneficiario_usuario_id.in.(${usuarios.slice(i, i + 60).join(",")})`)
  for (let i = 0; i < valores.length; i += 150) {
    const fatiaValores = valores.slice(i, i + 150)
    for (const f of filtros) {
      const { data, error } = await admin
        .from("ordens_pagamento")
        .select("id, codigo, situacao, vencimento, valor_inicial_cobranca, beneficiario_fornecedor_id, fornecedor_id, beneficiario_usuario_id")
        .eq("emp_proprietaria_id", emp)
        .not("excluido", "is", true)
        .not("situacao", "in", `(${FORA.map((s) => `"${s}"`).join(",")})`)
        .in("valor_inicial_cobranca", fatiaValores)
        .gte("vencimento", de)
        .lte("vencimento", ate)
        .or(f)
        .limit(1000)
      if (error) throw new Error(`Não foi possível conferir duplicidades: ${error.message}`)
      candidatas.push(...((data ?? []) as Candidata[]))
    }
  }

  const porChave = new Map<string, Candidata[]>()
  const vistos = new Set<string>()
  for (const c of candidatas) {
    if (vistos.has(c.id)) continue
    vistos.add(c.id)
    const k = chave(c)
    if (!k) continue
    porChave.set(k, [...(porChave.get(k) ?? []), c])
  }
  for (const o of alvo) {
    const parecidas = (porChave.get(chave(o)!) ?? []).filter(
      (c) =>
        c.id !== o.id &&
        centavos(c.valor_inicial_cobranca) === centavos(o.valor_inicial_cobranca) &&
        c.vencimento &&
        diasEntre(c.vencimento, o.vencimento!) <= JANELA_DIAS
    )
    if (parecidas.length) {
      resultado.set(
        o.id,
        parecidas.map((c) => ({ id: c.id, codigo: c.codigo, situacao: c.situacao, vencimento: c.vencimento }))
      )
    }
  }
  return resultado
}

/** "2026.1020.1552.2301 (Paga), 2026.… (A pagar)". */
export function descreverParecidas(lista: OrdemParecida[]): string {
  return lista.map((p) => `${p.codigo ?? "ordem"} (${p.situacao ?? "—"})`).join(", ")
}
