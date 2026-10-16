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
import { carregarBaseContracheques, type ContrachequeArea } from "@/lib/db/contracheques-area"
import { obterConfigContracheques, ordensDosContracheques } from "@/lib/db/contracheques-ordens"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { funcionarioDaArea, funcionariosDaArea } from "@/lib/db/pessoal-area"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { AcoesContracheque } from "../../../[id]/contracheque-itens"

export const metadata: Metadata = { title: "Contracheque — Confluir" }

/**
 * Nível 3 dos Contracheques: o contracheque do funcionário naquela remessa —
 * o PDF, a situação e as ações; anterior/próximo na remessa e na pessoa.
 */
export default async function ContrachequePage({
  params,
  searchParams,
}: {
  params: Promise<{ usuarioId: string; contrachequeId: string }>
  searchParams: Promise<{ de?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])
  const veOrdens = podeAcessar(sessao.permissoes, "financeiro_pagamento", ["financeiro_leitura"])
  const { usuarioId, contrachequeId } = await params
  const deRemessa = (await searchParams).de === "remessa"
  const [funcionario, { contracheques }, config] = await Promise.all([
    funcionarioDaArea(usuarioId),
    carregarBaseContracheques(),
    obterConfigContracheques(),
  ])
  const cc = contracheques.find((c) => c.id === contrachequeId && c.funcionarioId === usuarioId)
  if (!funcionario || !cc) notFound()

  const [url, ordens] = await Promise.all([
    urlArquivoPessoal(cc.arquivo),
    ordensDosContracheques(cc.ordemPagamentoId ? [cc.ordemPagamentoId] : []),
  ])
  const ordem = cc.ordemPagamentoId ? ordens.get(cc.ordemPagamentoId) : undefined

  // Navegação: na remessa (por nome) e na pessoa (mais antigo ← → mais recente).
  const sufixo = deRemessa ? "?de=remessa" : ""
  const nomeDe = new Map((await funcionariosDaArea()).map((f) => [f.usuarioId, f.nome]))
  const naRemessa = contracheques
    .filter((c) => c.remessaId === cc.remessaId)
    .sort((a, b) => (nomeDe.get(a.funcionarioId) ?? "").localeCompare(nomeDe.get(b.funcionarioId) ?? "", "pt-BR"))
  const iR = naRemessa.findIndex((c) => c.id === cc.id)
  const daPessoa = contracheques.filter((c) => c.funcionarioId === usuarioId).reverse()
  const iP = daPessoa.findIndex((c) => c.id === cc.id)
  const destino = (c: ContrachequeArea | undefined, rotulo: string) =>
    c ? { href: `/painel/pessoal/contracheques/funcionario/${c.funcionarioId}/${c.id}${sufixo}`, rotulo } : null

  const voltar = deRemessa
    ? { href: `/painel/pessoal/contracheques/${cc.remessaId}`, rotulo: cc.remessaNome }
    : { href: `/painel/pessoal/contracheques/funcionario/${usuarioId}?ano=${cc.ano}`, rotulo: funcionario.nome }
  const podeGerarOrdem = config.disponivel && !cc.ordemPagamentoId && Boolean(cc.arquivo) && !/^(https?:)?\/\//.test(cc.arquivo ?? "")

  return (
    <>
      <RotuloTrilha valores={{ funcionario: "Funcionários", [usuarioId]: funcionario.nome, [contrachequeId]: cc.remessaNome }} />
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 justify-self-start">
        <Link href={voltar.href}>
          <ArrowLeft />
          {voltar.rotulo}
        </Link>
      </Button>
      <CabecalhoFuncionario
        funcionario={funcionario}
        area="contracheques"
        permissoes={sessao.permissoes}
        titulo={`${funcionario.nome} — ${cc.remessaNome}`}
      />

      <NavegacaoRegistro
        eixos={[
          {
            titulo: `Na remessa (${iR + 1} de ${naRemessa.length})`,
            anterior: destino(naRemessa[iR - 1], nomeDe.get(naRemessa[iR - 1]?.funcionarioId ?? "") ?? ""),
            proximo: destino(naRemessa[iR + 1], nomeDe.get(naRemessa[iR + 1]?.funcionarioId ?? "") ?? ""),
          },
          {
            titulo: "Contracheques do funcionário",
            anterior: destino(daPessoa[iP - 1], daPessoa[iP - 1]?.remessaNome ?? ""),
            proximo: destino(daPessoa[iP + 1], daPessoa[iP + 1]?.remessaNome ?? ""),
          },
        ]}
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {cc.natureza}
                {cc.liberado ? <Badge variant="success">Liberado</Badge> : <Badge variant="warning">Bloqueado</Badge>}
              </CardTitle>
              <CardDescription className="mt-1">
                Remessa{" "}
                <Link href={`/painel/pessoal/contracheques/${cc.remessaId}`} className="hover:underline">
                  {cc.remessaNome}
                </Link>
                {cc.remessaFinalizada ? " (finalizada)" : " (aberta)"} · lançado em {formatarData(cc.criadoEm)}
                {cc.valor !== null && <> · líquido {formatarMoeda(cc.valor)}</>}
                {ordem && (
                  <>
                    {" · ordem "}
                    {veOrdens ? (
                      <Link href={`/painel/financeiro/ordens/${cc.ordemPagamentoId}`} className="hover:underline">
                        {ordem.codigo ?? "de pagamento"}
                      </Link>
                    ) : (
                      (ordem.codigo ?? "de pagamento")
                    )}
                    {ordem.situacao ? ` (${ordem.situacao})` : ""}
                  </>
                )}
              </CardDescription>
            </div>
            <div className="flex flex-wrap items-start gap-2">
              {url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Abrir PDF
                  </a>
                </Button>
              )}
              <AcoesContracheque
                id={cc.id}
                remessaId={cc.remessaId}
                liberado={cc.liberado}
                podeGerarOrdem={podeGerarOrdem}
                valorLiquido={cc.valor}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {url ? (
            <iframe src={url} title={`Contracheque — ${cc.remessaNome}`} className="h-[75vh] w-full rounded-md border" />
          ) : (
            <p className="text-muted-foreground text-sm">Sem arquivo anexado.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
