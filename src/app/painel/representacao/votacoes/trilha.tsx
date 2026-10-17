"use client"

import { TrilhaPropria } from "@/components/layout/trilha-rotulos"
import type { CaminhoVotacao } from "@/lib/db/votacao-caminho"
import { hrefAssembleia, hrefCampanha, hrefFonte, hrefRodada, RAIZ_VOTACOES } from "@/lib/votacao-navegacao"

/** Nome no degrau: curto o bastante para a trilha caber; o completo fica na página. */
function curto(nome: string | null, reserva: string): string {
  const n = (nome ?? "").trim() || reserva
  return n.length > 34 ? `${n.slice(0, 32).trimEnd()}…` : n
}

/**
 * A trilha das Votações com os NOMES de cada nível (reorganização de
 * 17/10/2026):
 *
 *   Painel › Representação Sindical › Votações › <fonte> › <campanha> ›
 *   <rodada> › <assembleia>
 *
 * Cada degrau leva ao registro pai de verdade, com o contexto de fonte
 * (`?fonte=`) — uma campanha de várias fontes volta pela fonte de onde a
 * pessoa veio.
 */
export function TrilhaVotacoes({
  caminho,
  folha,
}: {
  caminho?: CaminhoVotacao | null
  /** Último degrau avulso, para telas fora da hierarquia (ex.: "Nova campanha"). */
  folha?: { titulo: string; href: string } | null
}) {
  const degraus = [
    { titulo: "Painel", href: "/painel" },
    { titulo: "Representação Sindical", href: "/painel/representacao" },
    { titulo: "Votações", href: RAIZ_VOTACOES },
  ]
  const fonte = caminho?.fonte?.id ?? null
  if (caminho?.fonte) degraus.push({ titulo: curto(caminho.fonte.nome, "Fonte pagadora"), href: hrefFonte(caminho.fonte.id) })
  if (caminho?.campanha) degraus.push({ titulo: curto(caminho.campanha.nome, "Campanha"), href: hrefCampanha(caminho.campanha.id, fonte) })
  if (caminho?.rodada) degraus.push({ titulo: curto(caminho.rodada.nome, "Rodada"), href: hrefRodada(caminho.rodada.id, fonte) })
  if (caminho?.assembleia) {
    degraus.push({ titulo: curto(caminho.assembleia.nome, "Assembleia"), href: hrefAssembleia(caminho.assembleia.id, fonte) })
  }
  if (folha) degraus.push(folha)
  return <TrilhaPropria degraus={degraus} />
}
