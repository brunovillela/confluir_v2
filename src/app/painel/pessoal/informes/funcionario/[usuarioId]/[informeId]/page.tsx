import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { NavegacaoRegistro } from "@/components/pessoal/navegacao-registro"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { carregarBaseInformes, type InformeArea } from "@/lib/db/informes-area"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { funcionarioDaArea, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { formatarData } from "@/lib/formato"

import { AlternarLiberadoBotao } from "../../../[id]/informe-itens"

export const metadata: Metadata = { title: "Informe de rendimentos — Confluir" }

/** Nível 3 dos Informes: o informe do funcionário naquele ano-base. */
export default async function InformePage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string; informeId: string }>
  searchParams: Promise<{ de?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_informes_rendimentos"])
  const { usuarioId, informeId } = await params
  const deRemessa = (await searchParams).de === "remessa"
  const [funcionario, { informes }, todos] = await Promise.all([
    funcionarioDaArea(usuarioId),
    carregarBaseInformes(),
    funcionariosDaArea(),
  ])
  const inf = informes.find((i) => i.id === informeId && i.funcionarioId === usuarioId)
  if (!funcionario || !inf) notFound()
  const url = await urlArquivoPessoal(inf.arquivo)

  const nomeDe = new Map(todos.map((f) => [f.usuarioId, f.nome]))
  const sufixo = deRemessa ? "?de=remessa" : ""
  const naRemessa = informes
    .filter((i) => i.remessaId === inf.remessaId)
    .sort((a, b) => (nomeDe.get(a.funcionarioId) ?? "").localeCompare(nomeDe.get(b.funcionarioId) ?? "", "pt-BR"))
  const iR = naRemessa.findIndex((i) => i.id === inf.id)
  const daPessoa = informes.filter((i) => i.funcionarioId === usuarioId).reverse()
  const iP = daPessoa.findIndex((i) => i.id === inf.id)
  const destino = (i: InformeArea | undefined, rotulo: string) =>
    i ? { href: `/painel/pessoal/informes/funcionario/${i.funcionarioId}/${i.id}${sufixo}`, rotulo } : null
  const voltar = deRemessa
    ? { href: `/painel/pessoal/informes/${inf.remessaId}`, rotulo: `Ano-base ${inf.ano}` }
    : { href: `/painel/pessoal/informes/funcionario/${usuarioId}`, rotulo: funcionario.nome }

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome, [informeId]: `Ano-base ${inf.ano}` }} />
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 self-start">
        <Link href={voltar.href}>
          <ArrowLeft />
          {voltar.rotulo}
        </Link>
      </Button>
      <CabecalhoFuncionario
        funcionario={funcionario}
        area="informes"
        permissoes={sessao.permissoes}
        titulo={`${funcionario.nome} — informe ${inf.ano}`}
      />
      <NavegacaoRegistro
        eixos={[
          {
            titulo: `No ano-base (${iR + 1} de ${naRemessa.length})`,
            anterior: destino(naRemessa[iR - 1], nomeDe.get(naRemessa[iR - 1]?.funcionarioId ?? "") ?? ""),
            proximo: destino(naRemessa[iR + 1], nomeDe.get(naRemessa[iR + 1]?.funcionarioId ?? "") ?? ""),
          },
          {
            titulo: "Anos-base do funcionário",
            anterior: destino(daPessoa[iP - 1], daPessoa[iP - 1]?.ano ?? ""),
            proximo: destino(daPessoa[iP + 1], daPessoa[iP + 1]?.ano ?? ""),
          },
        ]}
      />
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                Ano-base {inf.ano}
                {inf.liberado ? <Badge variant="success">Liberado</Badge> : <Badge variant="warning">Bloqueado</Badge>}
              </CardTitle>
              <CardDescription className="mt-1">
                <Link href={`/painel/pessoal/informes/${inf.remessaId}`} className="hover:underline">
                  Remessa do ano-base
                </Link>
                {inf.remessaFechada ? " (fechada)" : " (aberta)"} · lançado em {formatarData(inf.criadoEm)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Abrir PDF
                  </a>
                </Button>
              )}
              {!inf.remessaFechada && <AlternarLiberadoBotao id={inf.id} remessaId={inf.remessaId} liberado={inf.liberado} />}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {url ? (
            <iframe src={url} title={`Informe ${inf.ano}`} className="h-[75vh] w-full rounded-md border" />
          ) : (
            <p className="text-muted-foreground text-sm">Sem arquivo anexado.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
