import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { NavegacaoRegistro } from "@/components/pessoal/navegacao-registro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { lerConfigFaltas, listarFaltas } from "@/lib/db/faltas"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { formatarData } from "@/lib/formato"

import { DecisaoFalta } from "../faltas-forms"
import { BadgeFalta, LinkComprovacao } from "../faltas-ui"

export const metadata: Metadata = { title: "Falta justificada — Confluir" }

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

/**
 * Nível 3 das Faltas justificadas: a falta — dados, comprovação, a decisão
 * (se aguarda) com o uso do limite à vista, e anterior/próximo na pessoa.
 */
export default async function FaltaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** de: "area" (fila) ou "faltas" (aba Faltas do ano); sem ele, volta ao funcionário. */
  searchParams: Promise<{ de?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_faltas_justificadas"])
  const { id } = await params
  const { de } = await searchParams
  const [{ faltas }, { config }] = await Promise.all([listarFaltas(), lerConfigFaltas()])
  const falta = faltas.find((f) => f.id === id)
  if (!falta) notFound()
  const fid = falta.funcionarioId
  const funcionario = fid ? await funcionarioDaArea(fid) : null

  const ano = (falta.data ?? "").slice(0, 4)
  const daPessoa = faltas.filter((f) => fid && f.funcionarioId === fid).sort((a, b) => (a.data ?? "").localeCompare(b.data ?? ""))
  const usoAno = daPessoa.filter((f) => f.situacao !== "recusada" && (f.data ?? "").startsWith(ano)).length
  const iP = daPessoa.findIndex((f) => f.id === id)
  const destino = (f: (typeof daPessoa)[number] | undefined) =>
    f ? { href: `/painel/pessoal/faltas/${f.id}${de ? `?de=${de}` : ""}`, rotulo: formatarData(f.data) } : null
  const voltar =
    de === "area" || !fid
      ? { href: "/painel/pessoal/faltas", rotulo: "Faltas justificadas" }
      : de === "faltas"
        ? { href: `/painel/pessoal/faltas?aba=faltas&ano=${ano}`, rotulo: `Faltas de ${ano}` }
        : { href: `/painel/pessoal/faltas/funcionario/${fid}?ano=${ano}`, rotulo: falta.funcionarioNome ?? "Funcionário" }

  return (
    <>
      <RotuloTrilha valores={{ [id]: `Falta de ${formatarData(falta.data)}` }} />
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 justify-self-start">
        <Link href={voltar.href}>
          <ArrowLeft />
          {voltar.rotulo}
        </Link>
      </Button>
      {funcionario ? (
        <CabecalhoFuncionario
          funcionario={funcionario}
          area="faltas"
          permissoes={sessao.permissoes}
          titulo={`${funcionario.nome} — falta de ${formatarData(falta.data)}`}
        />
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">Falta de {formatarData(falta.data)}</h1>
      )}

      {daPessoa.length > 1 && (
        <NavegacaoRegistro
          eixos={[
            {
              titulo: `Faltas do funcionário (${iP + 1} de ${daPessoa.length})`,
              anterior: destino(daPessoa[iP - 1]),
              proximo: destino(daPessoa[iP + 1]),
            },
          ]}
        />
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center gap-2 text-base">
            Falta justificada <BadgeFalta situacao={falta.situacao} />
          </CardTitle>
          <CardDescription>
            {usoAno} falta(s) em {ano}
            {config.limiteAno !== null && ` de ${config.limiteAno} permitidas`}
            {falta.doSistemaAnterior && " · lançada no sistema anterior"}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Data">{formatarData(falta.data)}</Campo>
            <Campo rotulo="Justificativa">{falta.tipo ?? "—"}</Campo>
            {falta.observacao && <Campo rotulo="Observação">{falta.observacao}</Campo>}
            <Campo rotulo="Comprovação">
              <LinkComprovacao caminho={falta.comprovacao} />
            </Campo>
            {falta.periodo && <Campo rotulo="Período do ACT">{falta.periodo}</Campo>}
            <Campo rotulo="Pedido em">{formatarData(falta.createdAt)}</Campo>
            {falta.situacao !== "aguardando" && (
              <Campo rotulo={falta.situacao === "autorizada" ? "Autorizada por" : "Recusada por"}>
                {falta.autorizadorNome ?? "—"}
                {falta.dataAutorizacao ? `, ${formatarData(falta.dataAutorizacao)}` : ""}
              </Campo>
            )}
            {falta.situacao === "recusada" && falta.motivoRecusa && (
              <Campo rotulo="Motivo da recusa">
                <span className="text-destructive">{falta.motivoRecusa}</span>
              </Campo>
            )}
          </dl>
          {falta.situacao === "aguardando" && (
            <div className="border-t pt-4">
              <p className="mb-2 text-sm font-medium">Decisão</p>
              <DecisaoFalta id={falta.id} />
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
