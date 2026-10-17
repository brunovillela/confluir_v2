import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Pencil } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { CabecalhoFuncionario } from "@/components/pessoal/cabecalho-funcionario"
import { NavegacaoRegistro } from "@/components/pessoal/navegacao-registro"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { urlArquivoPessoal } from "@/lib/db/pessoal"
import { funcionarioDaArea } from "@/lib/db/pessoal-area"
import { listarAtestados } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Atestado médico — Confluir" }

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  )
}

/** Nível 3 de Atestados: o atestado — dados, o arquivo e anterior/próximo na pessoa. */
export default async function AtestadoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  /** de: "atestados" (aba Atestados médicos); sem ele, volta ao funcionário. */
  searchParams: Promise<{ de?: string }>
}) {
  const sessao = await requirePermissao("pessoal_gestao")
  const { id } = await params
  const { de } = await searchParams
  const atestados = await listarAtestados()
  const a = atestados.find((x) => x.id === id)
  if (!a) notFound()
  const fid = a.funcionario_id
  const [funcionario, url] = await Promise.all([fid ? funcionarioDaArea(fid) : null, urlArquivoPessoal(a.atestado)])

  const daPessoa = atestados.filter((x) => fid && x.funcionario_id === fid).sort((x, y) => (x.inicio ?? "").localeCompare(y.inicio ?? ""))
  const iP = daPessoa.findIndex((x) => x.id === id)
  const destino = (x: (typeof daPessoa)[number] | undefined) =>
    x ? { href: `/painel/pessoal/atestados/${x.id}${de ? `?de=${de}` : ""}`, rotulo: formatarData(x.inicio) } : null
  const voltar =
    de === "atestados" || !fid
      ? { href: "/painel/pessoal/atestados?aba=atestados", rotulo: "Atestados médicos" }
      : { href: `/painel/pessoal/atestados/funcionario/${fid}?ano=${(a.inicio ?? "").slice(0, 4)}`, rotulo: a.funcionarioNome ?? "Funcionário" }

  return (
    <>
      <RotuloTrilha valores={{ [id]: `Atestado de ${formatarData(a.inicio)}` }} />
      <Button variant="ghost" size="sm" asChild className="-ml-2 mb-1 self-start">
        <Link href={voltar.href}>
          <ArrowLeft />
          {voltar.rotulo}
        </Link>
      </Button>
      {funcionario ? (
        <CabecalhoFuncionario
          funcionario={funcionario}
          area="atestados"
          permissoes={sessao.permissoes}
          titulo={`${funcionario.nome} — atestado de ${formatarData(a.inicio)}`}
        />
      ) : (
        <h1 className="text-2xl font-semibold tracking-tight">Atestado de {formatarData(a.inicio)}</h1>
      )}
      {daPessoa.length > 1 && (
        <NavegacaoRegistro
          eixos={[
            {
              titulo: `Atestados do funcionário (${iP + 1} de ${daPessoa.length})`,
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
              <CardTitle className="text-base">Atestado médico</CardTitle>
              <CardDescription className="mt-1">
                {a.quantidade_dias ?? "?"} dia(s)
                {(a.quantidade_dias ?? 0) > 15 && " · passou de 15 dias: a partir do 16º o afastamento vai ao INSS"}
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
                <Link href={`/painel/pessoal/atestados?aba=atestados&editar=${a.id}`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Campo rotulo="Período">
              {formatarData(a.inicio)}
              {a.termino && a.termino !== a.inicio && <> – {formatarData(a.termino)}</>}
            </Campo>
            <Campo rotulo="CID-10">{a.cid10 ?? "—"}</Campo>
            <Campo rotulo="Acompanhamento">
              {a.atestado_acompanhamento === true
                ? `Sim${a.nome_acompanhado ? ` — ${a.nome_acompanhado}` : ""}${a.filho_menor_6_anos ? " (filho menor de 6 anos)" : ""}`
                : "Não"}
            </Campo>
            {a.consideracao && <Campo rotulo="Considerações">{a.consideracao}</Campo>}
            <Campo rotulo="Lançado em">{formatarData(a.created_at)}</Campo>
          </dl>
          {url && <iframe src={url} title="Atestado" className="h-[70vh] w-full rounded-md border" />}
        </CardContent>
      </Card>
    </>
  )
}
