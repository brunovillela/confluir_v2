"use client"

import { TrilhaPropria } from "@/components/layout/trilha-rotulos"

const RAIZ = "/painel/representacao/votacoes"

/**
 * A trilha padrão das Votações:
 *
 *   Painel › Representação Sindical › Votações › Campanhas › Rodadas de
 *   assembleias › Assembleia
 *
 * As rotas são irmãs (`/campanhas/<id>`, `/rodadas/<id>`, `/urnas/<id>`), então
 * a trilha derivada da URL levava a `/campanhas` e `/rodadas`, que não existem
 * — dava "em desenvolvimento". Aqui cada degrau aponta para o registro PAI de
 * verdade: "Campanhas" volta para a campanha daquela rodada, e "Rodadas de
 * assembleias" para a rodada daquela assembleia.
 */
export function TrilhaVotacoes({
  campanhaId,
  rodadaId,
  assembleia,
  folha,
}: {
  campanhaId?: string | null
  rodadaId?: string | null
  /** Endereço da página da assembleia (urnas, acompanhamento, apuração). */
  assembleia?: string | null
  /** Último degrau avulso, para telas fora da hierarquia (ex.: "Nova campanha"). */
  folha?: { titulo: string; href: string } | null
}) {
  const degraus = [
    { titulo: "Painel", href: "/painel" },
    { titulo: "Representação Sindical", href: "/painel/representacao" },
    { titulo: "Votações", href: RAIZ },
  ]
  if (campanhaId) {
    degraus.push({ titulo: "Campanhas", href: `${RAIZ}/campanhas/${campanhaId}` })
  }
  if (rodadaId) {
    degraus.push({
      titulo: "Rodadas de assembleias",
      href: `${RAIZ}/rodadas/${rodadaId}`,
    })
  }
  if (assembleia) degraus.push({ titulo: "Assembleia", href: assembleia })
  if (folha) degraus.push(folha)
  return <TrilhaPropria degraus={degraus} />
}
