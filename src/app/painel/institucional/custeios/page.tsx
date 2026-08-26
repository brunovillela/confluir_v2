import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Download, HandCoins, Plus, Tags, Users } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
  ROTULOS_SITUACAO_CUSTEIO,
  ROTULO_TIPO_BENEFICIARIO,
  SITUACOES_CUSTEIO,
} from "@/lib/custeio-constantes"
import { listarCusteios, listarFinalidades, resumoCusteios } from "@/lib/db/custeio"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoCusteioBadge } from "./custeio-badges"

export const metadata: Metadata = { title: "Custeio institucional — Confluir" }

const FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  situacao?: string
  finalidade?: string
  salvo?: string
}

export default async function CusteiosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("custeio_institucional", [
    "custeio_institucional_edicao",
    "custeio_institucional_autorizacao",
  ])
  const podeEditar = podeAcessar(
    sessao.permissoes,
    "custeio_institucional_edicao"
  )

  const brutos = await searchParams
  const situacao = (SITUACOES_CUSTEIO as readonly string[]).includes(
    brutos.situacao ?? ""
  )
    ? brutos.situacao!
    : "todas"
  const busca = (brutos.busca ?? "").trim()
  const finalidadeId = (brutos.finalidade ?? "").trim()

  const [resumo, finalidades, custeios] = await Promise.all([
    resumoCusteios(),
    listarFinalidades(true),
    listarCusteios({ busca, situacao, finalidadeId: finalidadeId || undefined }),
  ])

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional">
            <ArrowLeft />
            Institucional
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Custeio institucional
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Custeios da entidade a diretores, demitidos políticos e convidados
              — autorizados aqui e pagos pelo Financeiro
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/painel/institucional/custeios/finalidades">
                <Tags />
                Finalidades
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/painel/institucional/custeios/convidados">
                <Users />
                Convidados
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <a
                href={`/painel/institucional/custeios/exportar?${new URLSearchParams(
                  { busca, situacao, finalidade: finalidadeId }
                ).toString()}`}
              >
                <Download />
                CSV
              </a>
            </Button>
            {podeEditar && (
              <Button asChild>
                <Link href="/painel/institucional/custeios/novo">
                  <Plus />
                  Novo custeio
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Custeio salvo.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-3">
        <CardResumo rotulo="Aguardando autorização" valor={resumo.aguardando} />
        <CardResumo rotulo="Autorizados" valor={resumo.autorizados} />
        <CardResumo rotulo="Total" valor={resumo.total} />
      </div>

      <form
        action="/painel/institucional/custeios"
        className="flex flex-wrap gap-2"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Código, beneficiário ou descrição"
          className={`${FILTRO} w-64 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} className={FILTRO}>
          <option value="todas">Todas as situações</option>
          {SITUACOES_CUSTEIO.map((s) => (
            <option key={s} value={s}>
              {ROTULOS_SITUACAO_CUSTEIO[s]}
            </option>
          ))}
        </select>
        <select name="finalidade" defaultValue={finalidadeId} className={FILTRO}>
          <option value="">Todas as finalidades</option>
          {finalidades.map((f) => (
            <option key={f.id} value={f.id}>
              {f.nome}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {custeios.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <HandCoins className="mx-auto mb-2 size-5" />
              Nenhum custeio encontrado com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Beneficiário</TableHead>
                  <TableHead>Finalidade</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Cadência</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {custeios.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell>
                      <Link
                        href={`/painel/institucional/custeios/${c.id}`}
                        className="text-primary font-medium whitespace-nowrap tabular-nums hover:underline"
                      >
                        {c.codigo ?? "(sem código)"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-56">
                      <span className="line-clamp-2">
                        {c.beneficiario_nome ?? "—"}
                      </span>
                      <span className="text-muted-foreground block text-xs">
                        {ROTULO_TIPO_BENEFICIARIO[c.tipo_beneficiario] ??
                          c.tipo_beneficiario}
                      </span>
                    </TableCell>
                    <TableCell className="max-w-48">
                      <span className="line-clamp-2 text-sm">
                        {c.finalidade_nome ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(c.valor_parcela)}
                      {c.cadencia === "recorrente" && c.num_parcelas > 1 && (
                        <span className="text-muted-foreground block text-xs">
                          × {c.num_parcelas}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {c.cadencia === "recorrente" ? "Recorrente" : "Pontual"}
                      {c.primeiro_vencimento && (
                        <span className="text-muted-foreground block">
                          {formatarData(c.primeiro_vencimento)}
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <SituacaoCusteioBadge situacao={c.situacao} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function CardResumo({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {valor.toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  )
}
