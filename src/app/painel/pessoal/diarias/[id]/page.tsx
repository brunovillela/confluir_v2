import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { NavegacaoRegistro } from "@/components/pessoal/navegacao-registro"
import { DetalheDiaria } from "@/components/diaria-detalhe"
import { DespesasDepoisDaViagem } from "@/components/diarias-despesa-posterior"
import { requirePermissao } from "@/lib/auth"
import { buscarSolicitacaoDiaria, descontosDaDiaria, listarSolicitacoesDiaria } from "@/lib/db/diarias"
import { formatarData } from "@/lib/formato"
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
  /** de: "solicitacoes" (aba Solicitações); sem ele, volta ao funcionário. */
  searchParams: Promise<{ salvo?: string; de?: string }>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])

  const { id } = await params
  const { salvo, de } = await searchParams
  const solicitacao = await buscarSolicitacaoDiaria(id)
  if (!solicitacao) notFound()
  // Diária de diretor mora na porta da Diretoria, com permissão própria.
  if (solicitacao.beneficiarioTipo === "diretor") {
    redirect(`/painel/institucional/diretoria/diarias/${id}`)
  }

  const fid = solicitacao.funcionario_id
  const voltar =
    de === "solicitacoes" || !fid
      ? { href: "/painel/pessoal/diarias?aba=solicitacoes", rotulo: "Solicitações de diária" }
      : { href: `/painel/pessoal/diarias/funcionario/${fid}`, rotulo: solicitacao.funcionarioNome ?? "Funcionário" }
  // Anterior/próximo: as diárias do mesmo funcionário, pela data da atividade.
  const daPessoa = fid
    ? (await listarSolicitacoesDiaria({ quadro: "funcionario", beneficiarioId: fid })).solicitacoes.sort((a, b) =>
        (a.data_inicio ?? a.created_at ?? "").localeCompare(b.data_inicio ?? b.created_at ?? "")
      )
    : []
  const iP = daPessoa.findIndex((d) => d.id === id)
  const destino = (d: (typeof daPessoa)[number] | undefined) =>
    d
      ? {
          href: `/painel/pessoal/diarias/${d.id}${de ? `?de=${de}` : ""}`,
          rotulo: `${formatarData(d.data_inicio ?? d.created_at)} · ${d.complementoDe ? "despesas" : (d.tipoNome ?? "diária")}`,
        }
      : null

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
      {daPessoa.length > 1 && (
        <NavegacaoRegistro
          eixos={[
            {
              titulo: `Diárias do funcionário (${iP + 1} de ${daPessoa.length})`,
              anterior: destino(daPessoa[iP - 1]),
              proximo: destino(daPessoa[iP + 1]),
            },
          ]}
        />
      )}
      <DetalheDiaria
        solicitacao={solicitacao}
        voltar={voltar}
        pessoaHref={fid ? `/painel/pessoal/diarias/funcionario/${fid}` : null}
        despesasUrls={new Map(urls)}
        infracoesPendentes={infracoesPendentes}
        descontos={descontos}
        salvo={salvo === "1"}
        remessaHref={solicitacao.remessaId ? `/painel/pessoal/diarias/remessas/${solicitacao.remessaId}` : null}
      />
      <DespesasDepoisDaViagem
        diaria={solicitacao}
        diariaBase="/painel/pessoal/diarias"
        remessaBase="/painel/pessoal/diarias/remessas"
      />
    </>
  )
}
