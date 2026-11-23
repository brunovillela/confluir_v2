import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Monitor, Vote } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { requirePermissao } from "@/lib/auth"
import { listarPrograma, obterCongresso } from "@/lib/db/congressos"
import { regrasAoVivo } from "@/lib/db/congressos-ao-vivo"
import { dadosDaPlenaria } from "@/lib/db/congressos-relatoria"

import { MesaAoVivo, type ItemPauta } from "../../../ao-vivo-componentes"

export const metadata: Metadata = { title: "Mesa ao vivo — Confluir" }

/** Mesa ao vivo: fila de fala com cronômetro e votação eletrônica (quando a configuração prevê). */
export default async function MesaAoVivoPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const [d, programa] = await Promise.all([dadosDaPlenaria(c), listarPrograma(id)])
  const regras = regrasAoVivo(c)
  const base = `/painel/representacao/congressos/${id}`
  const pauta: ItemPauta[] = [
    ...d.propostas
      .filter((p) => p.situacao === "plenaria")
      .map((p) => ({ id: p.id, tipo: "proposta" as const, rotulo: `Proposta ${p.numero}: ${p.texto.slice(0, 120)}${p.texto.length > 120 ? "…" : ""}` })),
    ...d.mocoes.filter((m) => m.situacao === "habilitada").map((m) => ({ id: m.id, tipo: "mocao" as const, rotulo: `Moção ${m.numero}: ${m.titulo}` })),
  ]
  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, plenaria: "Plenária", "ao-vivo": "Ao vivo" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Mesa ao vivo</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl text-xs">
            Fala de {regras.tempoFala} min, questões de {regras.tempoQuestao} min; inscrições encerram após {regras.oradores} orador(es).
            {regras.votoEletronico === "nao" ? "" : " A votação eletrônica vale pelo link pessoal e pela estação da mesa; uma pessoa, um voto."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/telao`} target="_blank">
              <Monitor />
              Telão
            </Link>
          </Button>
          {regras.votoEletronico !== "nao" && (
            <Button asChild variant="outline" size="sm">
              <Link href={`${base}/plenaria/estacao`} target="_blank">
                <Vote />
                Estação de voto
              </Link>
            </Button>
          )}
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}/plenaria`}>Pauta e crachá</Link>
          </Button>
        </div>
      </div>
      <MesaAoVivo congressoId={id} sessoes={programa.sessoes.map((s) => ({ id: s.id, titulo: s.titulo }))} pauta={pauta} votoEletronico={regras.votoEletronico} />
    </>
  )
}
