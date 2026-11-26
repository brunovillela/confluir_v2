import "server-only"

import { hojeSP, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * DEVOLVIDAS PARADAS (26/11/2026). Ordem devolvida ("Aguardando informações")
 * fica esperando quem lançou corrigir — o aviso e o lembrete semanal existem,
 * mas havia 15 paradas há mais de 7 dias, algumas desde 2025 (reembolso de
 * R$ 90, diária de R$ 0). A triagem do Financeiro mostra todas, de qualquer
 * origem, com há quantos dias, o motivo e quem lançou; a parada há muito
 * tempo se corrige (abrir) ou se cancela com motivo.
 */

/** A partir daqui a devolvida é "parada há muito tempo": corrigir ou cancelar. */
export const DIAS_DEVOLVIDA_ESQUECIDA = 30

export type DevolvidaParada = {
  id: string
  codigo: string | null
  tipo: string | null
  descricao: string | null
  valor: number | null
  processoId: string | null
  motivo: string | null
  devolvidaEm: string | null
  dias: number
  devolvidaPorNome: string | null
  lancadaPorNome: string | null
}

const dias = (de: string, ate: string) => Math.max(0, Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000))

export async function listarDevolvidasParadas(): Promise<DevolvidaParada[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const hoje = hojeSP()
  const { data, error } = await admin
    .from("ordens_pagamento")
    .select("id, codigo, tipo, descricao, valor_inicial_cobranca, processo_compra_id, autorizacao_observacao, autorizacao_data, autorizacao_autorizador_id, created_at")
    .eq("emp_proprietaria_id", emp)
    .eq("situacao", "Aguardando informações")
    .not("excluido", "is", true)
    .limit(1000)
  if (error) throw new Error(`Falha ao ler as ordens devolvidas: ${error.message}`)
  const ordens = data ?? []
  if (!ordens.length) return []
  const ids = ordens.map((o) => String(o.id))

  // Quando foi devolvida (o último evento "devolvida") e quem lançou (o
  // primeiro evento com usuário — a criação).
  const devolvidaEm = new Map<string, string>()
  const lancadaPor = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 200) {
    const { data: evs } = await admin
      .from("ordens_pagamento_eventos")
      .select("ordem_id, tipo, usuario_id, created_at")
      .in("ordem_id", ids.slice(i, i + 200))
      .order("created_at", { ascending: true })
    for (const e of evs ?? []) {
      const o = String(e.ordem_id)
      if (e.tipo === "devolvida") devolvidaEm.set(o, String(e.created_at).slice(0, 10))
      if (!lancadaPor.has(o) && texto(e.usuario_id)) lancadaPor.set(o, String(e.usuario_id))
    }
  }
  const pessoas = [
    ...new Set([...lancadaPor.values(), ...ordens.map((o) => texto(o.autorizacao_autorizador_id))].filter((v): v is string => !!v)),
  ]
  const { data: us } = pessoas.length
    ? await admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", pessoas)
    : { data: [] as Record<string, unknown>[] }
  const nome = new Map((us ?? []).map((u) => [String(u.id), texto(u.nome_guerra) ?? texto(u.nome_completo)]))

  return ordens
    .map((o) => {
      const id = String(o.id)
      const desde =
        devolvidaEm.get(id) ??
        (texto(o.autorizacao_data)?.slice(0, 10) || String(o.created_at).slice(0, 10))
      return {
        id,
        codigo: texto(o.codigo),
        tipo: texto(o.tipo),
        descricao: texto(o.descricao),
        valor: o.valor_inicial_cobranca == null ? null : Number(o.valor_inicial_cobranca),
        processoId: texto(o.processo_compra_id),
        motivo: texto(o.autorizacao_observacao),
        devolvidaEm: desde,
        dias: dias(desde, hoje),
        devolvidaPorNome: texto(o.autorizacao_autorizador_id) ? (nome.get(String(o.autorizacao_autorizador_id)) ?? null) : null,
        lancadaPorNome: lancadaPor.has(id) ? (nome.get(lancadaPor.get(id)!) ?? null) : null,
      }
    })
    .sort((a, b) => b.dias - a.dias)
}
