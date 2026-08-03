import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, HandCoins, Table2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
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
import { SituacaoDiariaBadge } from "@/components/diarias"
import { requirePermissao } from "@/lib/auth"
import {
  listarSolicitacoesDiaria,
  SITUACOES_DIARIA,
} from "@/lib/db/diarias"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Diárias — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const ROTULOS_SITUACAO: Record<string, string> = {
  aguardando: "Aguardando avaliação",
  aprovada: "Aprovadas",
  reprovada: "Reprovadas",
  cancelada: "Canceladas",
}

type ParamsLista = {
  busca?: string
  situacao?: string
  pagina?: string
  porPagina?: string
}

export default async function DiariasPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])

  const brutos = await searchParams
  const { disponivel, solicitacoes } = await listarSolicitacoesDiaria()

  const params = {
    busca: (brutos.busca ?? "").trim(),
    situacao: (SITUACOES_DIARIA as readonly string[]).includes(
      brutos.situacao ?? ""
    )
      ? brutos.situacao!
      : "todas",
  }

  const filtradas = solicitacoes.filter((s) => {
    if (
      params.busca &&
      !(s.funcionarioNome ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(params.busca.toLocaleLowerCase("pt-BR"))
    ) {
      return false
    }
    if (params.situacao !== "todas" && s.situacao !== params.situacao) {
      return false
    }
    return true
  })

  const aguardando = solicitacoes.filter(
    (s) => s.situacao === "aguardando"
  ).length

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtradas, paginacao)

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
            <h1 className="text-2xl font-semibold tracking-tight">Diárias</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {aguardando} aguardando avaliação ·{" "}
              {solicitacoes.length.toLocaleString("pt-BR")} solicitaç
              {solicitacoes.length === 1 ? "ão" : "ões"} no total — aprovação
              gera ordem de pagamento direta ao funcionário
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/painel/pessoal/diarias/tipos">
              <Table2 />
              Tipos de diária
            </Link>
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            As solicitações de diária ainda não estão configuradas no banco —
            rode <code>supabase/diarias.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
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
          name="situacao"
          defaultValue={params.situacao}
          aria-label="Filtrar por situação"
          className={SELECT_FILTRO}
        >
          <option value="todas">Todas as situações</option>
          {SITUACOES_DIARIA.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_SITUACAO[s]}
            </option>
          ))}
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
                <TableHead className="text-right">Qtd.</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead className="hidden md:table-cell">Período</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Solicitada em
                </TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <HandCoins className="size-6" />
                      <p className="text-sm">
                        Nenhuma solicitação de diária
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="max-w-56 font-medium">
                    {s.funcionario_id ? (
                      <Link
                        href={`/painel/pessoal/${s.funcionario_id}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">
                          {s.funcionarioNome ?? "(sem nome)"}
                        </span>
                      </Link>
                    ) : (
                      "(sem funcionário)"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-40 truncate">
                    {s.tipoNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {s.quantidade ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(s.valor_total)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                    {s.data_inicio ? (
                      <>
                        {formatarData(s.data_inicio)}
                        {s.data_termino && s.data_termino !== s.data_inicio && (
                          <> – {formatarData(s.data_termino)}</>
                        )}
                      </>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                    {formatarData(s.created_at)}
                  </TableCell>
                  <TableCell>
                    <SituacaoDiariaBadge situacao={s.situacao} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                      <Link href={`/painel/pessoal/diarias/${s.id}`}>
                        {s.situacao === "aguardando" ? "Avaliar" : "Ver"}
                      </Link>
                    </Button>
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
    </>
  )
}
