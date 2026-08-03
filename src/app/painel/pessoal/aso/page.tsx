import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, HeartPulse } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import { funcionariosParaSelecao, urlArquivoPessoal } from "@/lib/db/pessoal"
import { listarAsos, TIPOS_ASO } from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import { AsoForm, ExcluirAsoBotao } from "./aso-form"

export const metadata: Metadata = { title: "ASOs — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

type ParamsLista = {
  salvo?: string
  editar?: string
  busca?: string
  tipo?: string
  situacao?: string
  pagina?: string
  porPagina?: string
}

export default async function AsoPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_aso"])

  const brutos = await searchParams
  const { salvo, editar } = brutos
  const [asos, funcionarios] = await Promise.all([
    listarAsos(),
    funcionariosParaSelecao(),
  ])

  const hoje = hojeSP()
  const vencido = (v: string | null) => Boolean(v && v < hoje)

  const params = {
    busca: (brutos.busca ?? "").trim(),
    tipo: (TIPOS_ASO as readonly string[]).includes(brutos.tipo ?? "")
      ? brutos.tipo!
      : "todos",
    situacao: ["realizados", "pendentes", "vencidos"].includes(
      brutos.situacao ?? ""
    )
      ? brutos.situacao!
      : "todas",
  }

  const filtrados = asos.filter((a) => {
    if (
      params.busca &&
      !(a.funcionarioNome ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(params.busca.toLocaleLowerCase("pt-BR"))
    ) {
      return false
    }
    if (params.tipo !== "todos" && a.tipo !== params.tipo) return false
    if (params.situacao === "realizados" && a.realizado !== true) return false
    if (params.situacao === "pendentes" && a.realizado === true) return false
    // Vencidos: só faz sentido para o ASO vigente (último) do funcionário.
    if (params.situacao === "vencidos" && !(a.ultimo === true && vencido(a.vencimento)))
      return false
    return true
  })

  const vencidosVigentes = asos.filter(
    (a) => a.ultimo === true && vencido(a.vencimento)
  ).length

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtrados, paginacao)

  const urls = new Map<string, string | null>()
  for (const a of paginaAtual.linhas) {
    urls.set(a.id, await urlArquivoPessoal(a.arquivo))
  }

  const emEdicao = editar ? (asos.find((a) => a.id === editar) ?? null) : null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          ASOs — Atestados de Saúde Ocupacional
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {asos.length} ASO{asos.length === 1 ? "" : "s"} registrado
          {asos.length === 1 ? "" : "s"}
          {vencidosVigentes > 0 && (
            <> · {vencidosVigentes} vigente{vencidosVigentes === 1 ? "" : "s"} vencido{vencidosVigentes === 1 ? "" : "s"}</>
          )}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>ASO salvo.</AlertDescription>
        </Alert>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <Input
          name="busca"
          defaultValue={params.busca}
          placeholder="Nome do funcionário"
          className="h-9 w-full sm:max-w-56"
          aria-label="Buscar por funcionário"
        />
        <select
          name="tipo"
          defaultValue={params.tipo}
          aria-label="Filtrar por tipo"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todos os tipos</option>
          {TIPOS_ASO.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="situacao"
          defaultValue={params.situacao}
          aria-label="Filtrar por situação"
          className={SELECT_FILTRO}
        >
          <option value="todas">Todas as situações</option>
          <option value="realizados">Realizados</option>
          <option value="pendentes">Não realizados</option>
          <option value="vencidos">Vigentes vencidos</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Funcionário</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead>Data</TableHead>
                <TableHead>Vencimento</TableHead>
                <TableHead>Realizado</TableHead>
                <TableHead className="hidden lg:table-cell">Vigente</TableHead>
                <TableHead>Arquivo</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <HeartPulse className="size-6" />
                      <p className="text-sm">
                        Nenhum ASO encontrado
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="max-w-56 font-medium">
                    {a.funcionario_id ? (
                      <Link
                        href={`/painel/pessoal/${a.funcionario_id}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">
                          {a.funcionarioNome ?? "(sem nome)"}
                        </span>
                      </Link>
                    ) : (
                      "(sem funcionário)"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-40 truncate">
                    {a.tipo ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatarData(a.data)}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {a.vencimento ? (
                      vencido(a.vencimento) && a.ultimo === true ? (
                        <Badge
                          variant="outline"
                          className="border-warning/40 text-warning-fg"
                        >
                          Venceu {formatarData(a.vencimento)}
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">
                          {formatarData(a.vencimento)}
                        </span>
                      )
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell>
                    {a.realizado === true ? (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success-fg"
                      >
                        Sim
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Não
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell className="hidden lg:table-cell">
                    {a.ultimo === true ? (
                      <Badge
                        variant="outline"
                        className="border-info/40 text-info-fg"
                      >
                        Vigente
                      </Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {urls.get(a.id) ? (
                      <a
                        href={urls.get(a.id)!}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
                      >
                        Abrir <ExternalLink className="size-3" />
                      </a>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center justify-end gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-7 px-2"
                      >
                        <Link href={`/painel/pessoal/aso?editar=${a.id}`}>
                          Editar
                        </Link>
                      </Button>
                      <ExcluirAsoBotao id={a.id} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />

      {/* key força remontagem ao alternar criar/editar (defaultValue). */}
      <AsoForm
        key={emEdicao?.id ?? "novo"}
        funcionarios={funcionarios}
        tipos={TIPOS_ASO}
        aso={
          emEdicao
            ? {
                id: emEdicao.id,
                funcionario_id: emEdicao.funcionario_id,
                data: emEdicao.data,
                tipo: emEdicao.tipo,
                vencimento: emEdicao.vencimento,
                realizado: emEdicao.realizado,
                enviado: emEdicao.enviado,
                temArquivo: Boolean(emEdicao.arquivo),
              }
            : undefined
        }
      />
    </>
  )
}
