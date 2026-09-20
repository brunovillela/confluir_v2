import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { DetalheDiaria } from "@/components/diaria-detalhe"
import { requirePermissao } from "@/lib/auth"
import { buscarSolicitacaoDiaria, descontosDaDiaria } from "@/lib/db/diarias"
import { urlComprovanteDespesa } from "@/lib/db/diarias-despesas"
import { cobrancasDiariaPendentes } from "@/lib/db/veiculos"

export const metadata: Metadata = {
  title: "Solicitação de diária — Confluir",
}

export default async function SolicitacaoDiariaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])

  const { id } = await params
  const { salvo } = await searchParams
  const solicitacao = await buscarSolicitacaoDiaria(id)
  if (!solicitacao) notFound()
  // Diária de diretor mora na porta da Diretoria, com permissão própria.
  if (solicitacao.beneficiarioTipo === "diretor") {
    redirect(`/painel/institucional/diretoria/diarias/${id}`)
  }

  const aguardando = solicitacao.situacao === "aguardando"
  // Aguardando: infrações do infrator para descontar. Avaliada: o que já foi
  // descontado (trilha).
  const [infracoesPendentes, descontos, urls] = await Promise.all([
    aguardando && solicitacao.funcionario_id
      ? cobrancasDiariaPendentes(solicitacao.funcionario_id)
      : Promise.resolve([]),
    aguardando ? Promise.resolve([]) : descontosDaDiaria(id),
    Promise.all(
      solicitacao.despesas.map(
        async (d) => [d.id, await urlComprovanteDespesa(d.comprovante)] as const
      )
    ),
  ])

  return (
    <>
      <RotuloTrilha valores={{ [id]: "Solicitação de diária" }} />
      <DetalheDiaria
        solicitacao={solicitacao}
        voltar={{ href: "/painel/pessoal/diarias", rotulo: "Diárias" }}
        pessoaHref={
          solicitacao.funcionario_id ? `/painel/pessoal/${solicitacao.funcionario_id}` : null
        }
        despesasUrls={new Map(urls)}
        infracoesPendentes={infracoesPendentes}
        descontos={descontos}
        salvo={salvo === "1"}
      />
    </>
  )
}
