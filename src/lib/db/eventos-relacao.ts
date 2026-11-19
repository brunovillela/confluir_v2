import "server-only"

import { lerEmLotesPorIds } from "@/lib/db/comum"
import { listarCampos } from "@/lib/db/eventos-config"
import { listarInscricoes, type Inscricao } from "@/lib/db/eventos"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * RELAÇÃO DE CONFIRMADOS (19/11/2026): a lista que sai do Confluir em Excel
 * ou PDF para sistemas que não conversam com ele (catraca, hotel, buffet,
 * credenciamento de terceiros). Só inscrições CONFIRMADAS e não anonimizadas,
 * em ordem alfabética, com as respostas dos campos extras do evento.
 */

export type LinhaConfirmado = Inscricao & {
  /** Respostas dos campos extras, pelo id do campo. */
  respostas: Map<string, string>
}

export type RelacaoConfirmados = {
  /** Campos extras do evento, na ordem da ficha (inativos com resposta inclusos). */
  campos: { id: string; rotulo: string }[]
  linhas: LinhaConfirmado[]
}

export async function relacaoDeConfirmados(eventoId: string): Promise<RelacaoConfirmados> {
  const [inscricoes, todosCampos] = await Promise.all([
    listarInscricoes({ eventoId, situacao: "confirmada" }),
    listarCampos(eventoId),
  ])
  const confirmadas = inscricoes
    .filter((i) => !i.anonimizada_em)
    .sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR", { sensitivity: "base" }))

  const respostas = new Map<string, Map<string, string>>()
  if (confirmadas.length > 0 && todosCampos.length > 0) {
    const admin = await createAdminClient()
    const linhas = await lerEmLotesPorIds<{ inscricao_id: string; campo_id: string | null; valor: string | null }>(
      confirmadas.map((i) => i.id),
      (fatia, de, ate) =>
        admin
          .from("eventos_inscricao_respostas")
          .select("inscricao_id, campo_id, valor")
          .in("inscricao_id", fatia)
          .order("id")
          .range(de, ate)
    )
    for (const r of linhas) {
      if (!r.campo_id || !r.valor) continue
      const mapa = respostas.get(r.inscricao_id) ?? new Map<string, string>()
      mapa.set(r.campo_id, r.valor)
      respostas.set(r.inscricao_id, mapa)
    }
  }

  // Campo desativado depois de respondido continua na relação: a resposta existe.
  const comResposta = new Set([...respostas.values()].flatMap((m) => [...m.keys()]))
  const campos = todosCampos
    .filter((c) => c.ativo || comResposta.has(c.id))
    .map((c) => ({ id: c.id, rotulo: c.rotulo }))

  return {
    campos,
    linhas: confirmadas.map((i) => ({ ...i, respostas: respostas.get(i.id) ?? new Map() })),
  }
}
