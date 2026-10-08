"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight, FileText } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import type { MovimentacaoCaixa, SituacaoConta } from "@/lib/db/caixa"
import { formatarDataHora, formatarMoeda } from "@/lib/formato"
import { cn } from "@/lib/utils"

/** Badge da situação da conta de caixa. */
export function SituacaoContaBadge({
  situacao,
  ativa = true,
}: {
  situacao: SituacaoConta
  ativa?: boolean
}) {
  if (!ativa) {
    return (
      <Badge variant="outline" className="text-destructive border-destructive/40">
        Desativada
      </Badge>
    )
  }
  if (situacao === "aberta") {
    return (
      <Badge
        variant="outline"
        className="border-success/40 text-success-fg"
      >
        Aberta
      </Badge>
    )
  }
  if (situacao === "prestacao_pendente") {
    return (
      <Badge
        variant="outline"
        className="border-warning/40 text-warning-fg"
      >
        Em prestação de contas
      </Badge>
    )
  }
  return (
    <Badge variant="outline" className="text-muted-foreground">
      Fechada
    </Badge>
  )
}

const ROTULO_TIPO: Record<string, string> = {
  aporte: "Aporte",
  compra: "Compra",
  perda: "Perda",
  acerto: "Acerto de conta",
}

/** Crédito soma; débitos subtraem (acerto negativo vira crédito). */
function valorAssinado(m: MovimentacaoCaixa): number {
  return m.tipo === "aporte" ? m.valor : -m.valor
}

type ColunaExtrato = "data" | "tipo" | "beneficiario" | "valor"

const POR_PAGINA = [15, 30, 50] as const

function chaveOrdem(m: MovimentacaoCaixa, coluna: ColunaExtrato): string | number {
  if (coluna === "valor") return valorAssinado(m)
  if (coluna === "tipo") return ROTULO_TIPO[m.tipo] ?? m.tipo
  if (coluna === "beneficiario") return (m.beneficiario ?? "").toLocaleLowerCase("pt-BR")
  return m.created_at ?? ""
}

function CabecalhoOrdenavel({
  coluna,
  rotulo,
  ordem,
  aoOrdenar,
  className,
}: {
  coluna: ColunaExtrato
  rotulo: string
  ordem: { coluna: ColunaExtrato; asc: boolean }
  aoOrdenar: (c: ColunaExtrato) => void
  className?: string
}) {
  const ativa = ordem.coluna === coluna
  const Icone = !ativa ? ArrowUpDown : ordem.asc ? ArrowUp : ArrowDown
  return (
    <TableHead className={className}>
      <button
        type="button"
        onClick={() => aoOrdenar(coluna)}
        className={cn("inline-flex items-center gap-1", ativa ? "text-foreground" : "hover:text-foreground")}
        aria-label={`Ordenar por ${rotulo}`}
      >
        {rotulo}
        <Icone className="size-3.5" />
      </button>
    </TableHead>
  )
}

/**
 * Extrato da conta: data e hora, movimentação, beneficiário (da ordem
 * ligada), descrição e valor — com ordenação por coluna e paginação
 * (08/10/2026). Débito ligado a uma ordem abre o extrato daquela despesa
 * (PDF) num clique; despesa a reconhecer ganha o botão para a aprovação.
 */
export function ExtratoCaixa({
  extrato,
  baseExtrato = "/painel/perfil/caixa/despesa",
  podeReconhecer = false,
}: {
  extrato: MovimentacaoCaixa[]
  /** Rota do extrato da despesa: `${base}/<ordem>/extrato`. */
  baseExtrato?: string
  /** Quem vê é o responsável: mostra "Reconhecer" nas despesas pendentes. */
  podeReconhecer?: boolean
}) {
  const [ordem, setOrdem] = useState<{ coluna: ColunaExtrato; asc: boolean }>({ coluna: "data", asc: false })
  const [pagina, setPagina] = useState(1)
  const [porPagina, setPorPagina] = useState<number>(POR_PAGINA[0])

  const ordenado = useMemo(() => {
    const lista = [...extrato]
    lista.sort((a, b) => {
      const x = chaveOrdem(a, ordem.coluna)
      const y = chaveOrdem(b, ordem.coluna)
      // Sem beneficiário (aporte, acerto) fica sempre no fim.
      if (x === "" && y !== "") return 1
      if (y === "" && x !== "") return -1
      const cmp = typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), "pt-BR")
      return ordem.asc ? cmp : -cmp
    })
    return lista
  }, [extrato, ordem])

  if (extrato.length === 0) {
    return (
      <p className="text-muted-foreground py-6 text-center text-sm">
        Nenhuma movimentação ainda.
      </p>
    )
  }

  const totalPaginas = Math.max(1, Math.ceil(ordenado.length / porPagina))
  const atual = Math.min(pagina, totalPaginas)
  const inicio = (atual - 1) * porPagina
  const visiveis = ordenado.slice(inicio, inicio + porPagina)

  const aoOrdenar = (coluna: ColunaExtrato) => {
    setOrdem((o) => (o.coluna === coluna ? { coluna, asc: !o.asc } : { coluna, asc: coluna !== "data" && coluna !== "valor" }))
    setPagina(1)
  }

  return (
    <div className="grid gap-3">
      <Table>
        <TableHeader>
          <TableRow>
            <CabecalhoOrdenavel coluna="data" rotulo="Data e hora" ordem={ordem} aoOrdenar={aoOrdenar} />
            <CabecalhoOrdenavel coluna="tipo" rotulo="Movimentação" ordem={ordem} aoOrdenar={aoOrdenar} />
            <CabecalhoOrdenavel
              coluna="beneficiario"
              rotulo="Beneficiário"
              ordem={ordem}
              aoOrdenar={aoOrdenar}
              className="hidden sm:table-cell"
            />
            <TableHead className="hidden md:table-cell">Descrição</TableHead>
            <CabecalhoOrdenavel coluna="valor" rotulo="Valor" ordem={ordem} aoOrdenar={aoOrdenar} className="text-right" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {visiveis.map((m) => {
            const assinado = valorAssinado(m)
            const pendente = m.situacao === "pendente"
            const cancelada = m.situacao === "cancelada"
            // Não reconhecida pelo responsável: fora do saldo (o valor voltou).
            const foraDoSaldo = !cancelada && m.reconhecimento === "nao_reconhecida"
            // Débito ligado a uma ordem: a linha abre o extrato da despesa.
            const hrefExtrato = m.ordemId && m.tipo !== "aporte" ? `${baseExtrato}/${m.ordemId}/extrato` : null
            const abrir = () => {
              if (hrefExtrato) window.open(hrefExtrato, "_blank", "noopener")
            }
            return (
              <TableRow
                key={m.id}
                className={cn(cancelada && "opacity-50", hrefExtrato && "hover:bg-muted/50 cursor-pointer")}
                onClick={hrefExtrato ? abrir : undefined}
                onKeyDown={
                  hrefExtrato
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault()
                          abrir()
                        }
                      }
                    : undefined
                }
                tabIndex={hrefExtrato ? 0 : undefined}
                role={hrefExtrato ? "link" : undefined}
                title={hrefExtrato ? "Abrir o extrato desta despesa" : undefined}
              >
                <TableCell className="whitespace-nowrap tabular-nums">
                  {formatarDataHora(m.created_at)}
                </TableCell>
                <TableCell>
                  <span className="flex flex-wrap items-center gap-1.5">
                    {ROTULO_TIPO[m.tipo] ?? m.tipo}
                    {pendente && (
                      <Badge variant="outline" className="border-warning/40 text-warning-fg">
                        Aguardando confirmação
                      </Badge>
                    )}
                    {cancelada && (
                      <Badge variant="outline" className="text-muted-foreground">
                        {m.reconhecimento === "transferida" ? "Transferida para outra conta" : "Cancelada"}
                      </Badge>
                    )}
                    {!cancelada && m.reconhecimento === "pendente" && (
                      <Badge variant="outline" className="border-warning/40 text-warning-fg">
                        A reconhecer pelo responsável
                      </Badge>
                    )}
                    {!cancelada && m.reconhecimento === "pendente" && podeReconhecer && (
                      <Button
                        asChild
                        size="sm"
                        className="h-6 px-2 text-xs"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href="/painel/perfil/despesas-caixa">Reconhecer</Link>
                      </Button>
                    )}
                    {!cancelada && m.reconhecimento === "nao_reconhecida" && (
                      <Badge
                        variant="outline"
                        className="border-destructive/40 text-destructive"
                        title={m.reconhecimentoMotivo ?? undefined}
                      >
                        Não reconhecida — fora do saldo
                      </Badge>
                    )}
                    {!cancelada && m.reconhecimento === "reconhecida" && (
                      <Badge variant="outline" className="border-success/40 text-success-fg">
                        Reconhecida
                      </Badge>
                    )}
                  </span>
                  {/* No celular o beneficiário vem aqui embaixo. */}
                  {m.beneficiario && (
                    <span className="text-muted-foreground block text-xs sm:hidden">{m.beneficiario}</span>
                  )}
                </TableCell>
                <TableCell className="hidden max-w-48 truncate sm:table-cell">
                  {m.beneficiario ?? <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-muted-foreground hidden max-w-72 truncate md:table-cell">
                  {hrefExtrato && <FileText className="mr-1 inline size-3.5 align-[-2px]" aria-hidden />}
                  {m.descricao ?? "—"}
                  {m.criadaPor && <span className="text-xs"> · por {m.criadaPor}</span>}
                </TableCell>
                <TableCell
                  className={cn(
                    "text-right whitespace-nowrap tabular-nums",
                    foraDoSaldo && "text-muted-foreground line-through",
                    !pendente && !cancelada && !foraDoSaldo && (assinado >= 0 ? "text-success-fg" : "text-destructive")
                  )}
                >
                  {assinado >= 0 ? "+" : "−"}
                  {formatarMoeda(Math.abs(assinado))}
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      <div className="text-muted-foreground flex flex-wrap items-center justify-between gap-2 text-xs">
        <span>
          {inicio + 1}–{Math.min(inicio + porPagina, ordenado.length)} de {ordenado.length}
        </span>
        <span className="flex items-center gap-2">
          <label className="flex items-center gap-1">
            Por página
            <select
              value={porPagina}
              onChange={(e) => {
                setPorPagina(Number(e.target.value))
                setPagina(1)
              }}
              className="border-input bg-background text-foreground h-7 rounded-md border px-1 text-xs [color-scheme:light] dark:[color-scheme:dark]"
            >
              {POR_PAGINA.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => setPagina(atual - 1)}
            disabled={atual <= 1}
            aria-label="Página anterior"
          >
            <ChevronLeft />
          </Button>
          <span className="tabular-nums">
            {atual} / {totalPaginas}
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="size-7"
            onClick={() => setPagina(atual + 1)}
            disabled={atual >= totalPaginas}
            aria-label="Próxima página"
          >
            <ChevronRight />
          </Button>
        </span>
      </div>
    </div>
  )
}
