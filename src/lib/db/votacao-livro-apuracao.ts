import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import {
  hashResultado,
  lerConferencia,
  textoCanonicoResultado,
  type Conferencia,
  type LinhaResultado,
} from "@/lib/votacao-integridade"

/**
 * Livro da apuração e hash do resultado (dossiê de auditoria C-2, C-3, C-5;
 * migração 20261019083424_votacao_integridade). O banco escreve tudo nos
 * triggers de voto_assembleias; aqui só se lê e se recalcula o hash para
 * mostrar que o publicado confere com o resultado congelado.
 */

export type EventoApuracao = {
  id: string
  tipo: "encerramento" | "reabertura"
  quando: string
  motivo: string | null
  usuario: string | null
  resultadoHash: string
  conferencia: Conferencia | null
}

export type IntegridadeApuracao = {
  /** SHA-256 publicado no encerramento (nulo com a apuração aberta). */
  resultadoHash: string | null
  /** Texto canônico do resultado congelado atual (o que o hash cobre). */
  textoCanonico: string
  /** Hash recalculado agora sobre voto_resultado_final. */
  hashRecalculado: string
  /** O publicado bate com o recalculado (nulo sem hash publicado). */
  confere: boolean | null
  /** Do mais recente para o mais antigo. */
  eventos: EventoApuracao[]
}

export async function integridadeDaApuracao(
  assembleiaId: string
): Promise<IntegridadeApuracao | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [ass, linhas, eventos] = await Promise.all([
    admin
      .from("voto_assembleias")
      .select("resultado_hash")
      .eq("id", assembleiaId)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle(),
    admin
      .from("voto_resultado_final")
      .select("pergunta_id, opcao_id, tipo, quantidade")
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId),
    admin
      .from("voto_apuracao_eventos")
      .select("id, tipo, created_at, motivo, usuario_id, resultado_hash, conferencia")
      .eq("emp_proprietaria_id", emp)
      .eq("assembleia_id", assembleiaId)
      .order("created_at", { ascending: false }),
  ])
  // Antes da migração: sem livro nem hash, a tela segue como era.
  if (ass.error && esquemaAusente(ass.error)) return null
  if (eventos.error && esquemaAusente(eventos.error)) return null

  const texto = textoCanonicoResultado(
    assembleiaId,
    (linhas.data ?? []).map((l) => ({
      pergunta_id: String(l.pergunta_id),
      opcao_id: l.opcao_id ? String(l.opcao_id) : null,
      tipo: String(l.tipo),
      quantidade: typeof l.quantidade === "number" ? l.quantidade : 0,
    })) satisfies LinhaResultado[]
  )
  const recalculado = hashResultado(texto)
  const publicado = (ass.data?.resultado_hash as string | null | undefined) ?? null

  const ids = [
    ...new Set(
      (eventos.data ?? []).map((e) => e.usuario_id as string | null).filter((x): x is string => Boolean(x))
    ),
  ]
  const nomes = new Map<string, string | null>()
  if (ids.length) {
    const { data: us } = await admin
      .from("usuarios")
      .select("id, nome_completo, nome_guerra")
      .in("id", ids)
    for (const u of us ?? []) {
      nomes.set(String(u.id), (u.nome_completo as string | null) ?? (u.nome_guerra as string | null) ?? null)
    }
  }

  return {
    resultadoHash: publicado,
    textoCanonico: texto,
    hashRecalculado: recalculado,
    confere: publicado ? publicado === recalculado : null,
    eventos: (eventos.data ?? []).map((e) => ({
      id: String(e.id),
      tipo: e.tipo === "reabertura" ? "reabertura" : "encerramento",
      quando: String(e.created_at),
      motivo: (e.motivo as string | null) ?? null,
      usuario: e.usuario_id ? (nomes.get(String(e.usuario_id)) ?? null) : null,
      resultadoHash: String(e.resultado_hash),
      conferencia: lerConferencia(e.conferencia),
    })),
  }
}

/** Hash publicado de várias assembleias (portal, relatório). */
export async function hashesDosResultados(assembleiaIds: string[]): Promise<Map<string, string>> {
  const mapa = new Map<string, string>()
  if (assembleiaIds.length === 0) return mapa
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("voto_assembleias")
    .select("id, resultado_hash")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("id", assembleiaIds)
  if (error) return mapa
  for (const a of data ?? []) {
    if (a.resultado_hash) mapa.set(String(a.id), String(a.resultado_hash))
  }
  return mapa
}
