import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Plus, Ticket } from "lucide-react"

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
import { requirePermissao } from "@/lib/auth"
import { listarCupons, listarHoteis, situacaoCupom } from "@/lib/db/hospedagem"
import { formatarCpf } from "@/lib/cpf"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoCupomBadge } from "../situacao-cupom-badge"
import {
  CHAVE_EMITIR_CUPOM,
  CHAVE_VER_CUPONS,
  CHAVES_EMITIR_CUPOM_ALT,
  CHAVES_VER_CUPONS_ALT,
} from "./chaves"
import { CancelarCupomBotao } from "./cupom-acoes"

export const metadata: Metadata = { title: "Cupons de hospedagem — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function CuponsPage({
  searchParams,
}: {
  searchParams: Promise<{
    salvo?: string
    hotel?: string
    situacao?: string
    busca?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  const sessao = await requirePermissao(CHAVE_VER_CUPONS, CHAVES_VER_CUPONS_ALT)
  const podeEmitir = podeAcessar(
    sessao.permissoes,
    CHAVE_EMITIR_CUPOM,
    CHAVES_EMITIR_CUPOM_ALT
  )
  // Quem chega pela filiação pode não ter acesso ao restante do módulo.
  const veModulo = podeAcessar(sessao.permissoes, "filiacao_hospedagens", [
    "filiacao_hospedagens_gestao",
    "filiacao_hospedagens_edicao",
  ])

  const params = await searchParams
  const { salvo } = params
  const situacao = ["aguardando", "reservado", "cancelado"].includes(
    params.situacao ?? ""
  )
    ? (params.situacao as string)
    : "todas"
  const busca = (params.busca ?? "").trim().toLowerCase()

  const [todosCupons, hoteis] = await Promise.all([listarCupons(), listarHoteis()])
  const hotel = hoteis.some((h) => h.id === params.hotel) ? params.hotel! : "todos"

  const cupons = todosCupons.filter((c) => {
    if (hotel !== "todos" && c.hotel_id !== hotel) return false
    if (situacao !== "todas" && situacaoCupom(c) !== situacao) return false
    if (busca) {
      const alvo = `${c.filiadoNome ?? ""} ${c.filiadoCpf ?? ""}`.toLowerCase()
      if (!alvo.includes(busca)) return false
    }
    return true
  })

  // Página dedicada à lista: 30 por página.
  const paginacao = lerPaginacao(params, 30)
  const paginaAtual = paginar(cupons, paginacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={veModulo ? "/painel/hospedagem" : "/painel/filiados"}>
            <ArrowLeft />
            {veModulo ? "Hospedagem" : "Filiados"}
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              Cupons de hospedagem
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {cupons.length} cup{cupons.length === 1 ? "om" : "ons"} — autorização
              de subsídio no hotel parceiro. A retirada do cupom não garante a
              reserva nem o serviço.
            </p>
          </div>
          {podeEmitir && (
            <Button asChild>
              <Link href="/painel/hospedagem/cupons/novo">
                <Plus />
                Novo cupom
              </Link>
            </Button>
          )}
        </div>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Cupom emitido com sucesso.</AlertDescription>
        </Alert>
      )}

      <form method="GET" className="flex flex-wrap items-center gap-2">
        <Input
          name="busca"
          defaultValue={params.busca ?? ""}
          placeholder="Nome ou CPF do filiado"
          className="h-9 w-full sm:max-w-64"
          aria-label="Buscar por filiado"
        />
        <select
          name="hotel"
          defaultValue={hotel}
          aria-label="Filtrar por hotel"
          className={SELECT_FILTRO}
        >
          <option value="todos">Todos os hotéis</option>
          {hoteis.map((h) => (
            <option key={h.id} value={h.id}>
              {h.nome ?? "(sem nome)"}
            </option>
          ))}
        </select>
        <select
          name="situacao"
          defaultValue={situacao}
          aria-label="Filtrar por situação"
          className={SELECT_FILTRO}
        >
          <option value="todas">Todas as situações</option>
          <option value="aguardando">Aguardando reserva</option>
          <option value="reservado">Reservados</option>
          <option value="cancelado">Cancelados</option>
        </select>
        <Button type="submit" variant="secondary" size="sm">
          Filtrar
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead>Filiado</TableHead>
              <TableHead className="hidden lg:table-cell">CPF</TableHead>
              <TableHead className="hidden md:table-cell">Hotel</TableHead>
              <TableHead>Check-in</TableHead>
              <TableHead className="hidden sm:table-cell">Compareceu</TableHead>
              <TableHead>Situação</TableHead>
              {podeEmitir && <TableHead className="w-28" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {paginaAtual.total === 0 && (
              <TableRow>
                <TableCell colSpan={podeEmitir ? 7 : 6} className="h-40">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <Ticket className="size-6" />
                    <p className="text-sm">Nenhum cupom encontrado.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {paginaAtual.linhas.map((c) => {
              const st = situacaoCupom(c)
              return (
                <TableRow key={c.id}>
                  <TableCell className="max-w-56 font-medium">
                    {c.filiado_id ? (
                      <Link
                        href={`/painel/filiados/${c.filiado_id}`}
                        className="hover:underline"
                      >
                        <span className="block truncate">
                          {c.filiadoNome ?? "(sem nome)"}
                        </span>
                      </Link>
                    ) : (
                      <span className="block truncate">
                        {c.filiadoNome ?? "(sem filiado)"}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden font-mono text-xs lg:table-cell">
                    {c.filiadoCpf ? formatarCpf(c.filiadoCpf) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden max-w-44 truncate md:table-cell">
                    {c.hotelNome ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatarData(c.check_in)}
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden sm:table-cell">
                    {st === "reservado" || st === "cancelado"
                      ? c.compareceu === true
                        ? "Sim"
                        : "Não"
                      : "—"}
                  </TableCell>
                  <TableCell>
                    <SituacaoCupomBadge cancelado={c.cancelado} servicoId={c.servico_id} />
                  </TableCell>
                  {podeEmitir && (
                    <TableCell>
                      {st !== "cancelado" && <CancelarCupomBotao id={c.id} />}
                    </TableCell>
                  )}
                </TableRow>
              )
            })}
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
