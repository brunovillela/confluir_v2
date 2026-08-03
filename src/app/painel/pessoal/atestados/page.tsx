import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ExternalLink, Stethoscope } from "lucide-react"

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
import {
  listarAtestados,
  listarAusencias,
} from "@/lib/db/pessoal-saude"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

import {
  AtestadoForm,
  AusenciaForm,
  ExcluirAtestadoBotao,
  ExcluirAusenciaBotao,
} from "./forms"

export const metadata: Metadata = {
  title: "Atestados e ausências — Confluir",
}

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-40 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function LinkArquivo({ url }: { url: string | null }) {
  if (!url) return <span className="text-muted-foreground text-xs">—</span>
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground inline-flex items-center gap-1 text-xs underline-offset-4 hover:underline"
    >
      Abrir <ExternalLink className="size-3" />
    </a>
  )
}

type ParamsLista = {
  aba?: string
  salvo?: string
  editar?: string
  busca?: string
  ano?: string
  pagina?: string
  porPagina?: string
}

export default async function AtestadosPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao")

  const brutos = await searchParams
  const aba = brutos.aba === "ausencias" ? "ausencias" : "atestados"
  const { salvo, editar } = brutos
  const busca = (brutos.busca ?? "").trim()

  const [atestados, ausencias, funcionarios] = await Promise.all([
    listarAtestados(),
    listarAusencias(),
    funcionariosParaSelecao(),
  ])

  const anos = [
    ...new Set(
      atestados.map((a) => a.ano).filter((v): v is string => Boolean(v))
    ),
  ].sort((a, b) => b.localeCompare(a))
  const ano = anos.includes(brutos.ano ?? "") ? brutos.ano! : "todos"

  const filtrar = <T extends { funcionarioNome: string | null }>(itens: T[]) =>
    busca
      ? itens.filter((i) =>
          (i.funcionarioNome ?? "")
            .toLocaleLowerCase("pt-BR")
            .includes(busca.toLocaleLowerCase("pt-BR"))
        )
      : itens

  const atestadosFiltrados = filtrar(atestados).filter(
    (a) => ano === "todos" || a.ano === ano
  )
  const ausenciasFiltradas = filtrar(ausencias)

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtestados = paginar(atestadosFiltrados, paginacao)
  const paginaAusencias = paginar(ausenciasFiltradas, paginacao)

  // Signed URLs só para a página visível de atestados.
  const urls = new Map<string, string | null>()
  if (aba === "atestados") {
    for (const a of paginaAtestados.linhas) {
      urls.set(a.id, await urlArquivoPessoal(a.atestado))
    }
  }

  const atestadoEmEdicao =
    aba === "atestados" && editar
      ? (atestados.find((a) => a.id === editar) ?? null)
      : null
  const ausenciaEmEdicao =
    aba === "ausencias" && editar
      ? (ausencias.find((a) => a.id === editar) ?? null)
      : null

  const urlAba = (a: string) =>
    `/painel/pessoal/atestados${a === "ausencias" ? "?aba=ausencias" : ""}`

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
          Atestados e ausências
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          {atestados.length} atestado{atestados.length === 1 ? "" : "s"} ·{" "}
          {ausencias.length} ausência{ausencias.length === 1 ? "" : "s"} —
          registros de saúde e afastamentos dos funcionários
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Registro salvo.</AlertDescription>
        </Alert>
      )}

      <div
        className="flex items-center gap-1.5"
        role="group"
        aria-label="Escolher entre atestados e ausências"
      >
        <Button
          variant={aba === "atestados" ? "default" : "outline"}
          size="sm"
          asChild
        >
          <Link href={urlAba("atestados")}>Atestados médicos</Link>
        </Button>
        <Button
          variant={aba === "ausencias" ? "default" : "outline"}
          size="sm"
          asChild
        >
          <Link href={urlAba("ausencias")}>Ausências</Link>
        </Button>
      </div>

      <form method="GET" className="flex flex-wrap items-center gap-2">
        {aba === "ausencias" && (
          <input type="hidden" name="aba" value="ausencias" />
        )}
        <Input
          name="busca"
          defaultValue={busca}
          placeholder="Nome do funcionário"
          className="h-9 w-full sm:max-w-56"
          aria-label="Buscar por funcionário"
        />
        {aba === "atestados" && (
          <select
            name="ano"
            defaultValue={ano}
            aria-label="Filtrar por ano"
            className={SELECT_FILTRO}
          >
            <option value="todos">Todos os anos</option>
            {anos.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        )}
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      {aba === "atestados" ? (
        <>
          <div className="overflow-hidden rounded-xl border">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50">
                    <TableHead>Funcionário</TableHead>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Dias</TableHead>
                    <TableHead className="hidden sm:table-cell">
                      CID-10
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      Acompanhamento
                    </TableHead>
                    <TableHead>Arquivo</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginaAtestados.total === 0 && (
                    <TableRow>
                      <TableCell colSpan={7} className="h-40">
                        <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                          <Stethoscope className="size-6" />
                          <p className="text-sm">
                            Nenhum atestado registrado
                            {busca && <> para “{busca}”</>}.
                          </p>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {paginaAtestados.linhas.map((a) => (
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
                      <TableCell className="whitespace-nowrap">
                        {formatarData(a.inicio)}
                        {a.termino && a.termino !== a.inicio && (
                          <> – {formatarData(a.termino)}</>
                        )}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {a.quantidade_dias ?? "—"}
                      </TableCell>
                      <TableCell className="text-muted-foreground hidden sm:table-cell">
                        {a.cid10 ?? "—"}
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {a.atestado_acompanhamento === true ? (
                          <Badge
                            variant="outline"
                            className="border-info/40 text-info-fg"
                          >
                            {a.nome_acompanhado
                              ? `Acomp. ${a.nome_acompanhado}`
                              : "Acompanhamento"}
                          </Badge>
                        ) : (
                          <span className="text-muted-foreground text-xs">
                            —
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <LinkArquivo url={urls.get(a.id) ?? null} />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            asChild
                            className="h-7 px-2"
                          >
                            <Link
                              href={`/painel/pessoal/atestados?editar=${a.id}`}
                            >
                              Editar
                            </Link>
                          </Button>
                          <ExcluirAtestadoBotao id={a.id} />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>

          <Paginacao
            total={paginaAtestados.total}
            pagina={paginaAtestados.pagina}
            totalPaginas={paginaAtestados.totalPaginas}
            porPagina={paginacao.porPagina}
            padrao={30}
          />

          {/* key força remontagem ao alternar criar/editar (defaultValue). */}
          <AtestadoForm
            key={atestadoEmEdicao?.id ?? "novo"}
            funcionarios={funcionarios}
            atestado={
              atestadoEmEdicao
                ? {
                    id: atestadoEmEdicao.id,
                    funcionario_id: atestadoEmEdicao.funcionario_id,
                    inicio: atestadoEmEdicao.inicio,
                    termino: atestadoEmEdicao.termino,
                    quantidade_dias: atestadoEmEdicao.quantidade_dias,
                    cid10: atestadoEmEdicao.cid10,
                    consideracao: atestadoEmEdicao.consideracao,
                    atestado_acompanhamento:
                      atestadoEmEdicao.atestado_acompanhamento,
                    nome_acompanhado: atestadoEmEdicao.nome_acompanhado,
                    filho_menor_6_anos: atestadoEmEdicao.filho_menor_6_anos,
                    temArquivo: Boolean(atestadoEmEdicao.atestado),
                  }
                : undefined
            }
          />
        </>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead>Funcionário</TableHead>
                  <TableHead>Período</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead className="text-right">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginaAusencias.total === 0 && (
                  <TableRow>
                    <TableCell colSpan={4} className="h-40">
                      <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                        <Stethoscope className="size-6" />
                        <p className="text-sm">
                          Nenhuma ausência registrada
                          {busca && <> para “{busca}”</>}.
                        </p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {paginaAusencias.linhas.map((a) => (
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
                    <TableCell className="whitespace-nowrap">
                      {formatarData(a.inicio)}
                      {a.termino && a.termino !== a.inicio && (
                        <> – {formatarData(a.termino)}</>
                      )}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-64 truncate">
                      {a.motivo ?? "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          asChild
                          className="h-7 px-2"
                        >
                          <Link
                            href={`/painel/pessoal/atestados?aba=ausencias&editar=${a.id}`}
                          >
                            Editar
                          </Link>
                        </Button>
                        <ExcluirAusenciaBotao id={a.id} />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <Paginacao
            total={paginaAusencias.total}
            pagina={paginaAusencias.pagina}
            totalPaginas={paginaAusencias.totalPaginas}
            porPagina={paginacao.porPagina}
            padrao={30}
          />

          <AusenciaForm
            key={ausenciaEmEdicao?.id ?? "nova"}
            funcionarios={funcionarios}
            ausencia={
              ausenciaEmEdicao
                ? {
                    id: ausenciaEmEdicao.id,
                    funcionario_id: ausenciaEmEdicao.funcionario_id,
                    inicio: ausenciaEmEdicao.inicio,
                    termino: ausenciaEmEdicao.termino,
                    motivo: ausenciaEmEdicao.motivo,
                  }
                : undefined
            }
          />
        </>
      )}
    </>
  )
}
