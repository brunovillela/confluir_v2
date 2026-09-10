import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { Pencil, Search, X } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
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
import { buscarVeiculo, listarMovimentacoes } from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

import { CabecalhoVeiculo } from "../cabecalho-veiculo"

export const metadata: Metadata = { title: "Histórico de uso do veículo — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 w-full rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"
const POR_PAGINA = 30

type Params = {
  de?: string
  ate?: string
  condutor?: string
  situacao?: string
  pagina?: string
  porPagina?: string
  salvo?: string
}

const dataISO = (v?: string) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : "")

/** Histórico completo de retiradas e devoluções, com filtros e paginação. */
export default async function HistoricoVeiculoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("veiculos", [
    "veiculos_gestao",
    "veiculos_recepcao",
  ])
  const gestor = podeAcessar(sessao.permissoes, "veiculos_gestao")
  const { id } = await params
  const brutos = await searchParams
  const veiculo = await buscarVeiculo(id)
  if (!veiculo) notFound()

  const de = dataISO(brutos.de)
  const ate = dataISO(brutos.ate)
  const condutor = brutos.condutor ?? ""
  const situacao =
    brutos.situacao === "abertas" || brutos.situacao === "encerradas"
      ? brutos.situacao
      : "todas"

  const todas = await listarMovimentacoes({ veiculoId: id, limite: 5000 })

  // Condutores para o filtro: quem já saiu com este veículo.
  const condutores = [
    ...new Map(
      todas
        .filter((m) => m.condutor_id)
        .map((m) => [m.condutor_id as string, m.condutorNome ?? "(sem nome)"])
    ),
  ].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"))

  const filtradas = todas.filter((m) => {
    if (de && (!m.data_retirada || m.data_retirada < de)) return false
    if (ate && (!m.data_retirada || m.data_retirada > ate)) return false
    if (condutor && m.condutor_id !== condutor) return false
    if (situacao === "abertas" && !m.aberta) return false
    if (situacao === "encerradas" && m.aberta) return false
    return true
  })
  const kmTotal = filtradas.reduce((s, m) => s + (m.km_rodado ?? 0), 0)
  const filtroAtivo = Boolean(de || ate || condutor || situacao !== "todas")

  const pag = lerPaginacao(brutos, POR_PAGINA)
  const pagina = paginar(filtradas, pag)

  return (
    <>
      <CabecalhoVeiculo
        veiculo={veiculo}
        titulo="Histórico de uso"
        descricao="Todas as saídas e entradas registradas, do fluxo novo e do legado"
      />

      {brutos.salvo && (
        <Alert variant="success">
          <AlertDescription>Movimentação corrigida.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <form
            method="get"
            className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end"
          >
            <div className="grid gap-1.5">
              <Label htmlFor="de">Saída de</Label>
              <Input
                id="de"
                name="de"
                type="date"
                defaultValue={de}
                className="[color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="ate">Saída até</Label>
              <Input
                id="ate"
                name="ate"
                type="date"
                defaultValue={ate}
                className="[color-scheme:light] dark:[color-scheme:dark]"
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="condutor">Condutor</Label>
              <select
                id="condutor"
                name="condutor"
                defaultValue={condutor}
                className={SELECT}
              >
                <option value="">Todos</option>
                {condutores.map(([cid, nome]) => (
                  <option key={cid} value={cid}>
                    {nome}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="situacao">Situação</Label>
              <select
                id="situacao"
                name="situacao"
                defaultValue={situacao}
                className={SELECT}
              >
                <option value="todas">Todas</option>
                <option value="abertas">Em aberto (fora)</option>
                <option value="encerradas">Encerradas</option>
              </select>
            </div>
            <div className="flex gap-2">
              <Button type="submit" variant="outline">
                <Search />
                Filtrar
              </Button>
              {filtroAtivo && (
                <Button type="button" variant="ghost" asChild>
                  <Link href={`/painel/veiculos/${veiculo.id}/historico`}>
                    <X />
                    Limpar
                  </Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <p className="text-muted-foreground text-sm tabular-nums">
        {pagina.total.toLocaleString("pt-BR")}{" "}
        {pagina.total === 1 ? "movimentação" : "movimentações"}
        {filtroAtivo ? " no filtro" : ""} · {kmTotal.toLocaleString("pt-BR")} km
        rodados
      </p>

      {pagina.linhas.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nenhuma movimentação.</p>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saída</TableHead>
                <TableHead>Entrada</TableHead>
                <TableHead>Condutor</TableHead>
                <TableHead>Destino</TableHead>
                <TableHead>Previsão</TableHead>
                <TableHead className="text-right">Hodômetro</TableHead>
                <TableHead className="text-right">Km</TableHead>
                <TableHead>Observação</TableHead>
                {gestor && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {pagina.linhas.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="whitespace-nowrap">
                    {formatarData(m.data_retirada)}
                    {m.sede_retirada ? ` · ${m.sede_retirada}` : ""}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {m.aberta ? (
                      <Badge
                        variant="outline"
                        className="border-warning/40 text-warning-fg"
                      >
                        Fora
                      </Badge>
                    ) : (
                      `${formatarData(m.data_devolucao)}${m.sede_devolucao ? ` · ${m.sede_devolucao}` : ""}`
                    )}
                  </TableCell>
                  <TableCell>{m.condutorNome ?? "—"}</TableCell>
                  <TableCell className="max-w-52">
                    <span className="line-clamp-1">{m.destino ?? "—"}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    {m.previsao_retorno ? formatarData(m.previsao_retorno) : "—"}
                  </TableCell>
                  <TableCell className="text-right whitespace-nowrap tabular-nums">
                    {m.hodometro_retirada?.toLocaleString("pt-BR") ?? "—"}
                    {" → "}
                    {m.hodometro_devolucao?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {m.km_rodado?.toLocaleString("pt-BR") ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-56">
                    <span className="line-clamp-1">{m.observacao_retorno ?? "—"}</span>
                  </TableCell>
                  {gestor && (
                    <TableCell className="text-right">
                      <Button size="sm" variant="ghost" asChild title="Corrigir lançamento">
                        <Link href={`/painel/veiculos/${veiculo.id}/historico/${m.id}`}>
                          <Pencil />
                          <span className="sr-only">Corrigir</span>
                        </Link>
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Paginacao
            total={pagina.total}
            pagina={pagina.pagina}
            totalPaginas={pagina.totalPaginas}
            porPagina={pag.porPagina}
            padrao={POR_PAGINA}
          />
        </>
      )}
    </>
  )
}
