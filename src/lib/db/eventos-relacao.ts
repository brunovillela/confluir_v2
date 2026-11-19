import "server-only"

import { lerEmLotesPorIds } from "@/lib/db/comum"
import { listarCampos } from "@/lib/db/eventos-config"
import { listarInscricoes, type Inscricao } from "@/lib/db/eventos"
import type { OpcoesRelacao } from "@/lib/eventos-relacao-opcoes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * RELAÇÃO DE CONFIRMADOS (19/11/2026): a lista que sai do Confluir em Excel
 * ou PDF para sistemas que não conversam com ele (catraca, hotel, buffet,
 * credenciamento de terceiros). Confirmadas (e, se pedido, a lista de espera),
 * nunca anonimizadas, em ordem alfabética, com as respostas dos campos extras.
 * O recorte (quem, espera) vem de `OpcoesRelacao`; CPF parcial e contato são
 * da apresentação, ficam nas rotas.
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

function entra(i: Inscricao, o: Pick<OpcoesRelacao, "quem" | "espera">): boolean {
  if (i.anonimizada_em) return false
  if (i.situacao !== "confirmada" && !(o.espera && i.situacao === "lista_espera")) return false
  switch (o.quem) {
    case "filiados":
      return !!i.filiacao_id
    case "convidados":
      return !!i.reservada_por
    case "nao_filiados":
      return !i.filiacao_id
    default:
      return true
  }
}

export async function relacaoDeConfirmados(
  eventoId: string,
  opcoes: Pick<OpcoesRelacao, "quem" | "espera"> = { quem: "todos", espera: false }
): Promise<RelacaoConfirmados> {
  const [inscricoes, todosCampos] = await Promise.all([
    listarInscricoes({ eventoId, situacao: opcoes.espera ? "todas" : "confirmada" }),
    listarCampos(eventoId),
  ])
  const confirmadas = inscricoes
    .filter((i) => entra(i, opcoes))
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
