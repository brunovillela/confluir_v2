import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, History } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
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
import { periodoRemessa, SituacaoRemessaBadge } from "@/components/diarias-historico"
import { requirePermissao } from "@/lib/auth"
import { listarRemessasDiaria } from "@/lib/db/diarias-historico"
import { formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "Histórico de diárias — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type ParamsLista = { busca?: string; ano?: string; pagina?: string; porPagina?: string }

/** Remessas de diárias lançadas no sistema anterior (só leitura). */
export default async function HistoricoDiariasPage({
  searchParams,
}: {
  searchParams: Promise<ParamsLista>
}) {
  await requirePermissao("pessoal_gestao", ["pessoal_diarias"])

  const brutos = await searchParams
  const ano = Number(brutos.ano) || undefined
  const busca = (brutos.busca ?? "").trim()
  const { disponivel, remessas, anos } = await listarRemessasDiaria({ ano })

  const termo = busca.toLocaleLowerCase("pt-BR")
  const filtradas = termo
    ? remessas.filter((r) =>
        [r.beneficiarioNome, r.departamentoNome, r.codigo].some((v) =>
          (v ?? "").toLocaleLowerCase("pt-BR").includes(termo)
        )
      )
    : remessas
  const total = filtradas.reduce((s, r) => s + (r.valorTotal ?? 0), 0)

  const paginacao = lerPaginacao(brutos, 30)
  const paginaAtual = paginar(filtradas, paginacao)

  return (
    <>
      <RotuloTrilha valores={{ historico: "Histórico" }} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/pessoal/diarias">
            <ArrowLeft />
            Diárias
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Histórico de diárias</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Remessas lançadas no sistema anterior, dia a dia — {filtradas.length.toLocaleString("pt-BR")} remessa
          {filtradas.length === 1 ? "" : "s"} · {formatarMoeda(total)}
        </p>
      </div>

      {!disponivel && (
        <Alert>
          <AlertDescription>
            O histórico ainda não está no banco — rode <code>supabase/historicos-oficios-diarias.sql</code> e{" "}
            <code>scripts/migrar-historicos-bubble.mjs</code>.
          </AlertDescription>
        </Alert>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <Input
          name="busca"
          defaultValue={busca}
          placeholder="Beneficiário, departamento ou código"
          className="h-9 w-full sm:max-w-72"
          aria-label="Buscar remessa"
        />
        <select name="ano" defaultValue={ano ? String(ano) : ""} aria-label="Filtrar por ano" className={SELECT_FILTRO}>
          <option value="">Todos os anos</option>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
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
                <TableHead>Beneficiário</TableHead>
                <TableHead className="hidden md:table-cell">Período</TableHead>
                <TableHead className="hidden lg:table-cell">Departamento</TableHead>
                <TableHead className="text-right">Valor</TableHead>
                <TableHead>Situação</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginaAtual.total === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-40">
                    <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                      <History className="size-6" />
                      <p className="text-sm">
                        Nenhuma remessa{busca && <> para “{busca}”</>}.
                      </p>
                    </div>
                  </TableCell>
                </TableRow>
              )}
              {paginaAtual.linhas.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="max-w-56 font-medium">
                    <span className="block truncate">{r.beneficiarioNome ?? "(sem beneficiário)"}</span>
                    <span className="text-muted-foreground block text-xs font-normal md:hidden">{periodoRemessa(r)}</span>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden whitespace-nowrap md:table-cell">
                    {periodoRemessa(r)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-44 truncate lg:table-cell">
                    {r.departamentoNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">{formatarMoeda(r.valorTotal)}</TableCell>
                  <TableCell>
                    <SituacaoRemessaBadge remessa={r} />
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" asChild className="h-7 px-2">
                      <Link href={`/painel/pessoal/diarias/historico/${r.id}`}>Ver</Link>
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
