import type { Metadata } from "next"
import Link from "next/link"
import { ArrowDown, ArrowLeft, ArrowUp, Plus, ReceiptText } from "lucide-react"

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
import { requirePermissao } from "@/lib/auth"
import {
  listarRemessasContracheques,
  naturezaRemessaContracheques,
} from "@/lib/db/pessoal"
import { Paginacao } from "@/components/paginacao"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { cn } from "@/lib/utils"

export const metadata: Metadata = {
  title: "Remessas de contracheques — Confluir",
}

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const NATUREZAS_FILTRO = [
  { valor: "mensal", rotulo: "Mensal" },
  { valor: "adiantamento", rotulo: "Adiantamento" },
  { valor: "decimo_terceiro", rotulo: "13º salário" },
  { valor: "ferias", rotulo: "Férias" },
  { valor: "complementar_mensal", rotulo: "Complementar (mensal)" },
]

type ParamsLista = {
  excluida?: string
  busca?: string
  natureza?: string
  situacao?: string
  ordem?: string
  dir?: string
  pagina?: string
  porPagina?: string
}

function CabecalhoOrdenavel({
  params,
  campo,
  children,
  className,
}: {
  params: Required<Pick<ParamsLista, "busca" | "natureza" | "situacao" | "ordem" | "dir">>
  campo: string
  children: React.ReactNode
  className?: string
}) {
  const ativo = params.ordem === campo
  const dir = ativo && params.dir === "asc" ? "desc" : "asc"
  const q = new URLSearchParams()
  if (params.busca) q.set("busca", params.busca)
  if (params.natureza !== "todas") q.set("natureza", params.natureza)
  if (params.situacao !== "todas") q.set("situacao", params.situacao)
  q.set("ordem", campo)
  q.set("dir", dir)
  return (
    <Link
      href={`/painel/pessoal/contracheques?${q.toString()}`}
      className={cn("inline-flex items-center gap-1 hover:underline", className)}
    >
      {children}
      {ativo &&
        (params.dir === "asc" ? (
          <ArrowUp className="size-3.5" />
        ) : (
          <ArrowDown className="size-3.5" />
        ))}
    </Link>
  )
}

export default async function RemessasContrachequesPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_contracheque"])
  const brutos = await searchParams
  const { excluida } = brutos

  const params = {
    busca: (brutos.busca ?? "").trim(),
    natureza: NATUREZAS_FILTRO.some((n) => n.valor === brutos.natureza)
      ? brutos.natureza!
      : "todas",
    situacao: ["abertas", "finalizadas"].includes(brutos.situacao ?? "")
      ? brutos.situacao!
      : "todas",
    ordem: ["nome", "criada", "itens", "recentes"].includes(brutos.ordem ?? "")
      ? brutos.ordem!
      : "recentes",
    dir: brutos.dir === "asc" ? "asc" : "desc",
  }

  const todas = await listarRemessasContracheques()
  const filtradas = todas.filter((r) => {
    if (
      params.busca &&
      !(r.nome_remessa ?? "").toLowerCase().includes(params.busca.toLowerCase())
    ) {
      return false
    }
    if (params.natureza !== "todas") {
      const rotulo = NATUREZAS_FILTRO.find((n) => n.valor === params.natureza)!.rotulo
      if (naturezaRemessaContracheques(r) !== rotulo) return false
    }
    if (params.situacao === "abertas" && r.finalizada === true) return false
    if (params.situacao === "finalizadas" && r.finalizada !== true) return false
    return true
  })

  const fator = params.dir === "asc" ? 1 : -1
  const remessas = [...filtradas].sort((a, b) => {
    if (params.ordem === "nome") {
      return (
        fator *
        (a.nome_remessa ?? "￿").localeCompare(b.nome_remessa ?? "￿", "pt-BR")
      )
    }
    if (params.ordem === "criada") {
      return fator * (a.created_at ?? "").localeCompare(b.created_at ?? "")
    }
    if (params.ordem === "itens") return fator * (a.itens - b.itens)
    return fator * ((a.ordem ?? 0) - (b.ordem ?? 0))
  })

  // Página dedicada à lista: 30 por página.
  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(remessas, paginacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal">
            <ArrowLeft />
            Pessoal
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Remessas de contracheques
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {remessas.length} remessa{remessas.length === 1 ? "" : "s"} — cada
              remessa agrupa os contracheques de um período/natureza
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/pessoal/contracheques/nova">
              <Plus />
              Nova remessa
            </Link>
          </Button>
        </div>
      </div>

      {excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Remessa excluída.</AlertDescription>
        </Alert>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <Input
          name="busca"
          defaultValue={params.busca}
          placeholder="Nome da remessa"
          className="h-9 w-full sm:max-w-56"
          aria-label="Buscar remessa"
        />
        <select
          name="natureza"
          defaultValue={params.natureza}
          aria-label="Filtrar por natureza"
          className={SELECT_FILTRO}
        >
          <option value="todas">Todas as naturezas</option>
          {NATUREZAS_FILTRO.map((n) => (
            <option key={n.valor} value={n.valor}>
              {n.rotulo}
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
          <option value="abertas">Abertas</option>
          <option value="finalizadas">Finalizadas</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>
                <CabecalhoOrdenavel params={params} campo="nome">
                  Remessa
                </CabecalhoOrdenavel>
              </TableHead>
              <TableHead className="hidden sm:table-cell">Natureza</TableHead>
              <TableHead className="hidden md:table-cell">
                <CabecalhoOrdenavel params={params} campo="criada">
                  Criada em
                </CabecalhoOrdenavel>
              </TableHead>
              <TableHead className="text-right">
                <CabecalhoOrdenavel params={params} campo="itens">
                  Contracheques
                </CabecalhoOrdenavel>
              </TableHead>
              <TableHead>Situação</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginaAtual.total === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <ReceiptText className="size-6" />
                    <p className="text-sm">Nenhuma remessa de contracheques.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {paginaAtual.linhas.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="max-w-64 font-medium">
                  <Link
                    href={`/painel/pessoal/contracheques/${r.id}`}
                    className="hover:underline"
                  >
                    <span className="block truncate">
                      {r.nome_remessa ?? "(sem nome)"}
                    </span>
                  </Link>
                </TableCell>
                <TableCell className="text-muted-foreground hidden sm:table-cell">
                  {naturezaRemessaContracheques(r)}
                </TableCell>
                <TableCell className="text-muted-foreground hidden md:table-cell">
                  {formatarData(r.created_at)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {r.itens.toLocaleString("pt-BR")}
                </TableCell>
                <TableCell>
                  {r.finalizada === true ? (
                    <Badge variant="outline" className="text-muted-foreground">
                      Finalizada
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="border-success/40 text-success-fg"
                    >
                      Aberta
                    </Badge>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Paginacao
        total={paginaAtual.total}
        pagina={paginaAtual.pagina}
        totalPaginas={paginaAtual.totalPaginas}
        porPagina={paginacao.porPagina}
        padrao={30}
      />
    </>
  )
}
