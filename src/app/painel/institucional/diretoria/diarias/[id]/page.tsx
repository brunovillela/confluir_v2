import type { Metadata } from "next"
import { notFound, redirect } from "next/navigation"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { DetalheDiaria } from "@/components/diaria-detalhe"
import { DespesasDaDiaria } from "@/components/diaria-despesas-form"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import { buscarSolicitacaoDiaria, descontosDaDiaria } from "@/lib/db/diarias"
import { listarTiposDespesaDiaria } from "@/lib/db/diarias-config"
import { urlComprovanteDespesa } from "@/lib/db/diarias-despesas"
import { cobrancasDiariaPendentes } from "@/lib/db/veiculos"

import { adicionarDespesaDiretoria, removerDespesaDiretoria } from "../actions"

export const metadata: Metadata = { title: "Diária da diretoria — Confluir" }

export default async function DiariaDiretoriaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string; nova?: string }>
}) {
  await requirePermissao("diretoria_diarias", ["configuracoes"])

  const { id } = await params
  const { salvo, nova } = await searchParams
  const solicitacao = await buscarSolicitacaoDiaria(id)
  if (!solicitacao) notFound()
  // Diária de funcionário é do RH — a porta dela é Pessoal.
  if (solicitacao.beneficiarioTipo !== "diretor") {
    redirect(`/painel/pessoal/diarias/${id}`)
  }

  const aguardando = solicitacao.situacao === "aguardando"
  const [infracoesPendentes, descontos, urls, { tipos }] = await Promise.all([
    aguardando && solicitacao.funcionario_id
      ? cobrancasDiariaPendentes(solicitacao.funcionario_id)
      : Promise.resolve([]),
    aguardando ? Promise.resolve([]) : descontosDaDiaria(id),
    Promise.all(
      solicitacao.despesas.map(
        async (d) => [d.id, await urlComprovanteDespesa(d.comprovante)] as const
      )
    ),
    listarTiposDespesaDiaria(),
  ])
  const urlPorDespesa = new Map(urls)

  return (
    <>
      <RotuloTrilha valores={{ diarias: "Diárias", [id]: "Diária" }} />

      {nova === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Diária lançada. Acrescente as despesas extras, se houver, e avalie em seguida.
          </AlertDescription>
        </Alert>
      )}

      <DetalheDiaria
        solicitacao={solicitacao}
        voltar={{ href: "/painel/institucional/diretoria/diarias", rotulo: "Diárias da diretoria" }}
        pessoaHref={null}
        despesasUrls={urlPorDespesa}
        infracoesPendentes={infracoesPendentes}
        descontos={descontos}
        salvo={salvo === "1"}
      />

      {aguardando && (
        <DespesasDaDiaria
          solicitacaoId={solicitacao.id}
          despesas={solicitacao.despesas.map((d) => ({
            id: d.id,
            tipoNome: d.tipoNome,
            descricao: d.descricao,
            valor: d.valor,
            comprovanteUrl: urlPorDespesa.get(d.id) ?? null,
          }))}
          tipos={tipos
            .filter((t) => t.ativa)
            .map((t) => ({ id: t.id, nome: t.nome, exigeComprovante: t.exigeComprovante }))}
          acaoAdicionar={adicionarDespesaDiretoria}
          acaoRemover={removerDespesaDiretoria}
        />
      )}
    </>
  )
}
