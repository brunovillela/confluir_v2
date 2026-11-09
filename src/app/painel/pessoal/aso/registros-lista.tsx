import Link from "next/link"
import { ExternalLink, HeartPulse } from "lucide-react"

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
import { funcionariosParaSelecao, urlArquivoPessoal } from "@/lib/db/pessoal"
import { listarAsos, TIPOS_ASO } from "@/lib/db/pessoal-saude"
import { comFuncionariosAtuais } from "@/lib/db/opcoes-pessoas"
import { formatarData } from "@/lib/formato"
import { paginaDoIndice, recorteDaLista, urlNaLista } from "@/lib/lista-estado"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { LembrarLista } from "@/components/voltar-lista"

import { AsoForm, ExcluirAsoBotao } from "./aso-form"

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-56 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
  }).format(new Date())
}

export type ParamsLista = {
  aba?: string
  salvo?: string
  editar?: string
  busca?: string
  tipo?: string
  situacao?: string
  pagina?: string
  porPagina?: string
}

/** Aba "Registros" (a lista de antes do padrão de 3 níveis). */
export async function ListaRegistrosAso({ brutos }: { brutos: ParamsLista & Record<string, string | undefined> }) {
  const { editar } = brutos
  const [asos, ativos] = await Promise.all([
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

  // Editando ou recém-salvo, abre na página em que a linha está.
  const paginacao = lerPaginacao(brutos, 30)
  const emFoco = editar ?? brutos.linha
  const indiceEmFoco = emFoco ? filtrados.findIndex((a) => a.id === emFoco) : -1
  if (indiceEmFoco >= 0) paginacao.pagina = paginaDoIndice(indiceEmFoco, paginacao.porPagina)
  const paginaAtual = paginar(filtrados, paginacao)
  // Editar, Cancelar e o voltar do registro mantêm página, filtros e aba.
  const base = "/painel/pessoal/aso"
  const recorte = recorteDaLista(brutos)
  recorte.set("aba", "registros")
  if (paginaAtual.pagina > 1) recorte.set("pagina", String(paginaAtual.pagina))
  else recorte.delete("pagina")
  const naLista = (extras: Record<string, string> = {}, ancora?: string) => urlNaLista(base, recorte, extras, ancora)

  const urls = new Map<string, string | null>()
  for (const a of paginaAtual.linhas) {
    urls.set(a.id, await urlArquivoPessoal(a.arquivo))
  }

  const emEdicao = editar ? (asos.find((a) => a.id === editar) ?? null) : null
  // Funcionário do ASO em edição continua selecionado mesmo desligado
  // (sem isso o seletor caía no primeiro ativo e o ASO trocava de pessoa).
  const funcionarios = await comFuncionariosAtuais(ativos, [emEdicao?.funcionario_id])

  return (
    <>
      <LembrarLista chave="aso-registros" url={naLista()} />
      <form method="GET" className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="aba" value="registros" />
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

      {brutos.salvo === "1" && brutos.linha && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>ASO salvo.</AlertDescription>
        </Alert>
      )}

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
                <TableRow
                  key={a.id}
                  id={`registro-${a.id}`}
                  className={`scroll-mt-20 ${brutos.linha === a.id ? "bg-success/10" : editar === a.id ? "bg-muted/50" : ""}`}
                >
                  <TableCell className="max-w-56 font-medium">
                    {a.funcionario_id ? (
                      <Link
                        href={`/painel/pessoal/aso/funcionario/${a.funcionario_id}`}
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
                    <Link href={`/painel/pessoal/aso/${a.id}?de=registros`} className="text-foreground hover:underline">
                      {formatarData(a.data)}
                    </Link>
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
                        <Link href={naLista({ editar: a.id }, "formulario-aso")}>
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
        voltarHref={emEdicao ? naLista({}, `registro-${emEdicao.id}`) : undefined}
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
