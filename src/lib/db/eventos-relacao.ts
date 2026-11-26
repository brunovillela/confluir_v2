import "server-only"

import { lerEmLotesPorIds } from "@/lib/db/comum"
import { listarCampos } from "@/lib/db/eventos-config"
import { listarDias, listarInscricoes, type DiaEvento, type Inscricao } from "@/lib/db/eventos"
import type { OpcoesRelacao } from "@/lib/eventos-relacao-opcoes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * RELAÇÃO DE CONFIRMADOS (19/11/2026): a lista que sai do Confluir em Excel
 * ou PDF para sistemas que não conversam com ele (catraca, hotel, buffet,
 * credenciamento de terceiros). Confirmadas (e, se pedido, a lista de espera),
 * nunca anonimizadas, em ordem alfabética, com as respostas dos campos extras.
 * O recorte (quem, espera, presença e dia) vem de `OpcoesRelacao`; CPF parcial
 * e contato são da apresentação, ficam nas rotas. Presença (26/11/2026): quem
 * veio entra em qualquer situação (a porta registrou); quem faltou é confirmado
 * sem presença — no dia escolhido ou em nenhum.
 */

type Recorte = Pick<OpcoesRelacao, "quem" | "espera" | "presenca" | "dia">

export type LinhaConfirmado = Inscricao & {
  /** Respostas dos campos extras, pelo id do campo. */
  respostas: Map<string, string>
  /** Dias (ids) em que a porta registrou a presença. */
  diasPresente: Set<string>
}

export type RelacaoConfirmados = {
  /** Campos extras do evento, na ordem da ficha (inativos com resposta inclusos). */
  campos: { id: string; rotulo: string }[]
  /** Dias do evento, na ordem; o dia escolhido no recorte, se houver. */
  dias: DiaEvento[]
  diaEscolhido: DiaEvento | null
  linhas: LinhaConfirmado[]
}

function entra(i: Inscricao, o: Recorte, veio: boolean): boolean {
  if (i.anonimizada_em) return false
  if (o.presenca === "presentes") {
    if (!veio) return false
  } else if (o.presenca === "ausentes") {
    if (veio || i.situacao !== "confirmada") return false
  } else if (i.situacao !== "confirmada" && !(o.espera && i.situacao === "lista_espera")) {
    return false
  }
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
  opcoes: Recorte = { quem: "todos", espera: false, presenca: "todos", dia: null }
): Promise<RelacaoConfirmados> {
  const precisaTodas = opcoes.espera || opcoes.presenca === "presentes"
  const [inscricoes, todosCampos, dias] = await Promise.all([
    listarInscricoes({ eventoId, situacao: precisaTodas ? "todas" : "confirmada" }),
    listarCampos(eventoId),
    listarDias(eventoId),
  ])
  const diaEscolhido = opcoes.dia ? (dias.find((d) => d.id === opcoes.dia) ?? null) : null

  // Presença por inscrição e dia: uma leitura em lotes, não uma por pessoa.
  const presencas = new Map<string, Set<string>>()
  const vivos = inscricoes.filter((i) => !i.anonimizada_em && i.presencas > 0)
  if (vivos.length > 0) {
    const admin = await createAdminClient()
    const linhasP = await lerEmLotesPorIds<{ inscricao_id: string; dia_id: string | null }>(
      vivos.map((i) => i.id),
      (fatia, de, ate) =>
        admin
          .from("eventos_presencas")
          .select("inscricao_id, dia_id")
          .in("inscricao_id", fatia)
          .order("id")
          .range(de, ate)
    )
    for (const p of linhasP) {
      const dias = presencas.get(p.inscricao_id) ?? new Set<string>()
      if (p.dia_id) dias.add(p.dia_id)
      presencas.set(p.inscricao_id, dias)
    }
  }
  const veio = (id: string) => {
    const d = presencas.get(id)
    if (!d) return false
    return diaEscolhido ? d.has(diaEscolhido.id) : true
  }

  const confirmadas = inscricoes
    .filter((i) => entra(i, opcoes, veio(i.id)))
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
    dias,
    diaEscolhido,
    linhas: confirmadas.map((i) => ({
      ...i,
      respostas: respostas.get(i.id) ?? new Map(),
      diasPresente: presencas.get(i.id) ?? new Set(),
    })),
  }
}
