import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, ReceiptText, Table2 } from "lucide-react"

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
import { SituacaoReembolsoBadge } from "@/components/reembolsos"
import { requirePermissao } from "@/lib/auth"
import {
  listarReembolsos,
  SITUACOES_REEMBOLSO,
} from "@/lib/db/reembolsos"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Reembolsos do ACT — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const ROTULOS: Record<string, string> = {
  aguardando: "Aguardando avaliação",
  aprovado: "Aprovados (a pagar)",
  reprovado: "Reprovados",
  cancelado: "Cancelados",
  pago: "Pagos",
}

type ParamsLista = {
  busca?: string
  situacao?: string
  pagina?: string
  porPagina?: string
}

export default async function ReembolsosPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao")

  const brutos = await searchParams
  const { disponivel, reembolsos } = await listarReembolsos()

  const params = {
    busca: (brutos.busca ?? "").trim(),
    situacao: (SITUACOES_REEMBOLSO as readonly string[]).includes(
      brutos.situacao ?? ""
    )
      ? brutos.situacao!
      : "todas",
  }

  const filtrados = reembolsos.filter((r) => {
    if (
      params.busca &&
      !(r.funcionarioNome ?? "")
        .toLocaleLowerCase("pt-BR")
        .includes(params.busca.toLocaleLowerCase("pt-BR"))
    ) {
      return false
    }
    if (params.situacao !== "todas" && r.situacao !== params.situacao) {
      return false
    }
    return true
  })

  const aguardando = reembolsos.filter(
    (r) => r.situacao === "aguardando"
  ).length
  const aPagar = reembolsos.filter((r) => r.situacao === "aprovado").length

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtrados, paginacao)

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
              Reembolsos do ACT
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {aguardando} aguardando avaliação · {aPagar} aprovado
              {aPagar === 1 ? "" : "s"} a pagar — o pagamento acontece no
              contracheque
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href="/painel/pessoal/reembolsos/tipos">
              <Table2 />
              Tipos do ACT
            </Link>
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            Os reembolsos ainda não estão configurados no banco — rode{" "}
            <code>supabase/reembolsos-act.sql</code> no SQL Editor do Supabase.
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
          {SITUACOES_REEMBOLSO.map((s) => (
            <option key={s} value={s}>
              {ROTULOS[s]}
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
                <TableHead className="text-right">Solicitado</TableHead>
                <TableHead className="text-right">Aprovado</TableHead>
                <TableHead className="hidden lg:table-cell">
                  Contracheque
                </TableHead>
                <TableHead className="hidden md:table-cell">
                  Solicitado em
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
                      <ReceiptText className="size-6" />
                      <p className="text-sm">
                        Nenhuma solicitação de reembolso
                        {params.busca && <> para “{params.busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-56 font-medium">
                    {r.funcionario_id ? (
                      <Link
                        href={`/painel/pessoal/${r.funcionario_id}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">
                          {r.funcionarioNome ?? "(sem nome)"}
                        </span>
                      </Link>
                    ) : (
                      "(sem funcionário)"
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-40 truncate">
                    {r.tipoNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(r.valor_solicitado)}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {formatarMoeda(r.valor_aprovado)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                    {[r.pagamento_mes, r.pagamento_ano]
                      .filter(Boolean)
                      .join("/") || "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                    {formatarData(r.created_at)}
                  </TableCell>
                  <TableCell>
                    <SituacaoReembolsoBadge situacao={r.situacao} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                      <Link href={`/painel/pessoal/reembolsos/${r.id}`}>
                        {r.situacao === "aguardando" ? "Avaliar" : "Ver"}
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
