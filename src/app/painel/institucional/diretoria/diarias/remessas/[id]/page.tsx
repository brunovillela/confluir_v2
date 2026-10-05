import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { DetalheRemessaDiarias } from "@/components/diarias-remessas"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import { urlComprovanteDespesa } from "@/lib/db/diarias-despesas"
import { obterRemessaNova } from "@/lib/db/diarias-remessas"

import { enviarRemessaDiretoriaAction } from "../../actions"

export const metadata: Metadata = { title: "Remessa de diárias — Confluir" }

export default async function RemessaDiariasPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ enviada?: string }>
}) {
  await requirePermissao("diretoria_diarias", ["configuracoes"])
  const { id } = await params
  const { enviada } = await searchParams
  const dados = await obterRemessaNova(id)
  if (!dados) notFound()
  if (dados.remessa.quadro !== "diretor") redirect(`/painel/pessoal/diarias/remessas/${id}`)
  const urls = await Promise.all(
    dados.solicitacoes.flatMap((s) => s.despesas).map(async (d) => [d.id, await urlComprovanteDespesa(d.comprovante)] as const)
  )
  return (
    <>
      <RotuloTrilha valores={{ [id]: `Remessa ${dados.remessa.codigo ?? ""}` }} />
      <DetalheRemessaDiarias
        remessa={dados.remessa}
        solicitacoes={dados.solicitacoes}
        voltar={{ href: "/painel/institucional/diretoria/diarias/remessas", rotulo: "Remessas de diárias" }}
        diariaBase="/painel/institucional/diretoria/diarias"
        despesasUrls={new Map(urls)}
        acaoEnviar={enviarRemessaDiretoriaAction}
        enviada={enviada ?? null}
      />
    </>
  )
}
