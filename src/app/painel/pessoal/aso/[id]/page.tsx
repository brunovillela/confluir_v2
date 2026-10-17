import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { NavegacaoRegistro } from "@/components/pessoal/navegacao-registro"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { listarAsos } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "ASO — Confluir" }

/** Nível 3 dos ASOs: o exame — dados, o arquivo e anterior/próximo na pessoa. */
export default async function AsoDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** de: "registros" (aba Registros); sem ele, volta ao funcionário. */
  searchParams: Promise<{ de?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao", ["pessoal_aso"])
  const { id } = await params
  const { de } = await searchParams
  const asos = await listarAsos()
  const a = asos.find((x) => x.id === id)
  if (!a) notFound()
  const fid = a.funcionario_id
  const [funcionario, url] = await Promise.all([fid ? funcionarioDaArea(fid) : null, urlArquivoPessoal(a.arquivo)])

  const daPessoa = asos.filter((x) => fid && x.funcionario_id === fid).sort((x, y) => (x.data ?? "").localeCompare(y.data ?? ""))
  const iP = daPessoa.findIndex((x) => x.id === id)
  const destino = (x: (typeof daPessoa)[number] | undefined) =>
    x ? { href: `/painel/pessoal/aso/${x.id}${de ? `?de=${de}` : ""}`, rotulo: `${formatarData(x.data)} · ${x.tipo ?? "ASO"}` } : null
  const voltar =
    de === "registros" || !fid
      ? { href: "/painel/pessoal/aso?aba=registros", rotulo: "Registros de ASO" }
      : { href: `/painel/pessoal/aso/funcionario/${fid}`, rotulo: a.funcionarioNome ?? "Funcionário" }

  return (
    <>
      <RotuloTrilha valores={{ [id]: `ASO de ${formatarData(a.data)}` }} />
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 justify-self-start">
        <Link href={voltar.href}>
          <ArrowLeft />
          {voltar.rotulo}
        </Link>
      </Button>
      {funcionario ? (
        <CabecalhoFuncionario
          funcionario={funcionario}
          area="aso"
          permissoes={sessao.permissoes}
          titulo={`${funcionario.nome} — ASO de ${formatarData(a.data)}`}
        />
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">ASO de {formatarData(a.data)}</h1>
      )}
      {daPessoa.length > 1 && (
        <NavegacaoRegistro
          eixos={[
            {
              titulo: `ASOs do funcionário (${iP + 1} de ${daPessoa.length})`,
              anterior: destino(daPessoa[iP - 1]),
              proximo: destino(daPessoa[iP + 1]),
            },
          ]}
        />
      )}
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex flex-wrap items-center gap-2 text-base">
                {a.tipo ?? "ASO"}
                {a.realizado === false ? <Badge variant="warning">Pendente</Badge> : <Badge variant="success">Realizado</Badge>}
                {a.ultimo === true && <Badge variant="info">Vigente</Badge>}
              </CardTitle>
              <CardDescription className="mt-1">
                Exame em {formatarData(a.data)} · vence em {formatarData(a.vencimento)}
              </CardDescription>
            </div>
            <div className="flex flex-wrap gap-2">
              {url && (
                <Button variant="outline" size="sm" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink />
                    Abrir arquivo
                  </a>
                </Button>
              )}
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/pessoal/aso?aba=registros&editar=${a.id}`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {url ? (
            <iframe src={url} title="ASO" className="h-[70vh] w-full rounded-md border" />
          ) : (
            <p className="text-muted-foreground text-sm">Sem arquivo anexado.</p>
          )}
        </CardContent>
      </Card>
    </>
  )
}
