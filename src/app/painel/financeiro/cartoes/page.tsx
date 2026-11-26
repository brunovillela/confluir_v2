import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CreditCard, Search } from "lucide-react"

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
import { LembrarLista } from "@/components/voltar-lista"
import { requirePermissao } from "@/lib/auth"
import { rotuloTipoCartao, rotuloUsoCartao, TIPOS_CARTAO } from "@/lib/compras-constantes"
import { pessoasAutorizaveis } from "@/lib/db/caixa"
import { faturasAbertas } from "@/lib/db/cartao-faturas"
import { AVISO_SQL_PAGAMENTO, listarCartoes } from "@/lib/db/compras-pagamento"
import { formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { semAcento } from "@/lib/texto"

import { alternarCartaoAction } from "./actions"
import { NovoCartaoDialog } from "./cartao-form"

export const metadata: Metadata = { title: "Cartões — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function CartoesPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; tipo?: string; uso?: string; situacao?: string }>
}) {
  const sessao = await requirePermissao("financeiro_pagamento", [
    "financeiro_caixa",
    "financeiro_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_pagamento", [
    "financeiro_caixa",
  ])

  const [{ disponivel, cartoes: todos }, pessoas, abertas] = await Promise.all([
    listarCartoes(),
    podeEditar ? pessoasAutorizaveis() : Promise.resolve([]),
    faturasAbertas(),
  ])

  // Filtros (26/11/2026): busca (apelido, bandeira, final, titular), tipo, uso
  // e situação; o cartão volta ao recorte (LembrarLista).
  const sp = await searchParams
  const buscaBruta = (sp.busca ?? "").trim()
  const termo = semAcento(buscaBruta.toLowerCase())
  const tipo = TIPOS_CARTAO.some((t) => t.valor === sp.tipo) ? sp.tipo! : ""
  const uso = sp.uso === "corporativo" || sp.uso === "responsavel" ? sp.uso : ""
  const situacao = sp.situacao === "ativos" || sp.situacao === "desativados" ? sp.situacao : ""
  const cartoes = todos.filter((c) => {
    if (tipo && c.tipo !== tipo) return false
    if (uso && c.uso !== uso) return false
    if (situacao === "ativos" && !c.ativo) return false
    if (situacao === "desativados" && c.ativo) return false
    if (!termo) return true
    return semAcento(`${c.apelido} ${c.bandeira ?? ""} ${c.final} ${c.titular ?? ""}`.toLowerCase()).includes(termo)
  })
  const filtrando = Boolean(buscaBruta || tipo || uso || situacao)
  const q = new URLSearchParams()
  if (buscaBruta) q.set("busca", buscaBruta)
  if (tipo) q.set("tipo", tipo)
  if (uso) q.set("uso", uso)
  if (situacao) q.set("situacao", situacao)
  const urlAtual = `/painel/financeiro/cartoes${q.size ? `?${q}` : ""}`

  return (
    <>
      <LembrarLista chave="cartoes" url={urlAtual} />
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">Cartões</h1>
          <CreditCard className="text-muted-foreground size-5" />
          {disponivel && podeEditar && (
            <div className="ml-auto">
              <NovoCartaoDialog pessoas={pessoas} />
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Cartões da entidade usados em compras. Na aquisição direta paga em
          cartão, quem registra escolhe qual cartão foi usado. No crédito, a
          compra entra na fatura aberta do cartão, que o Financeiro fecha e paga
          numa ordem só.
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>{AVISO_SQL_PAGAMENTO}</AlertDescription>
        </Alert>
      )}

      {disponivel && todos.length > 0 && (
        <form method="GET" className="flex flex-wrap items-center gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-sm">
            <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
            <Input
              name="busca"
              defaultValue={buscaBruta}
              placeholder="Apelido, bandeira, final ou titular"
              className="pl-8"
              aria-label="Buscar cartão"
            />
          </div>
          <select name="tipo" defaultValue={tipo} aria-label="Filtrar por tipo" className={SELECT_FILTRO}>
            <option value="">Todos os tipos</option>
            {TIPOS_CARTAO.map((t) => (
              <option key={t.valor} value={t.valor}>
                {t.rotulo}
              </option>
            ))}
          </select>
          <select name="uso" defaultValue={uso} aria-label="Filtrar por uso" className={SELECT_FILTRO}>
            <option value="">Todos os usos</option>
            <option value="corporativo">Corporativo</option>
            <option value="responsavel">Com responsável</option>
          </select>
          <select name="situacao" defaultValue={situacao} aria-label="Filtrar por situação" className={SELECT_FILTRO}>
            <option value="">Ativos e desativados</option>
            <option value="ativos">Ativos</option>
            <option value="desativados">Desativados</option>
          </select>
          <Button type="submit" variant="secondary">
            Buscar
          </Button>
          {filtrando && (
            <Button variant="ghost" size="sm" asChild>
              <Link href="/painel/financeiro/cartoes">Limpar</Link>
            </Button>
          )}
          {filtrando && (
            <span className="text-muted-foreground text-xs">
              {cartoes.length} de {todos.length} cartões
            </span>
          )}
        </form>
      )}

      {disponivel && (
        <div className="overflow-hidden rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead>Cartão</TableHead>
                <TableHead>Tipo</TableHead>
                <TableHead className="hidden md:table-cell">Uso</TableHead>
                <TableHead>Fatura aberta</TableHead>
                <TableHead>Situação</TableHead>
                {podeEditar && <TableHead className="w-0" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {cartoes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="h-24">
                    <p className="text-muted-foreground text-center text-sm">
                      {filtrando ? "Nenhum cartão com esses filtros." : "Nenhum cartão cadastrado."}
                    </p>
                  </TableCell>
                </TableRow>
              )}
              {cartoes.map((c) => (
                <TableRow key={c.id} className={c.ativo ? "" : "opacity-60"}>
                  <TableCell>
                    <Link href={`/painel/financeiro/cartoes/${c.id}`} className="font-medium hover:underline">
                      {c.apelido}
                    </Link>
                    <span className="text-muted-foreground block text-xs">
                      {c.bandeira ? `${c.bandeira} · ` : ""}final {c.final}
                    </span>
                  </TableCell>
                  <TableCell>{rotuloTipoCartao(c.tipo)}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {rotuloUsoCartao(c.uso)}
                    <span className="text-muted-foreground block text-xs">
                      {c.uso === "responsavel" ? `com ${c.titular ?? "—"}` : c.titular ? `titular ${c.titular}` : "fatura no Financeiro"}
                    </span>
                  </TableCell>
                  <TableCell>
                    {c.tipo !== "credito" ? (
                      <span className="text-muted-foreground text-xs">Sem fatura</span>
                    ) : abertas.get(c.id) ? (
                      <Link
                        href={`/painel/financeiro/cartoes/faturas/${abertas.get(c.id)!.id}`}
                        className="hover:underline"
                      >
                        <span className="tabular-nums">{formatarMoeda(abertas.get(c.id)!.soma)}</span>
                        <span className="text-muted-foreground block text-xs">
                          nº {abertas.get(c.id)!.numero} · {abertas.get(c.id)!.compras} compra(s)
                        </span>
                      </Link>
                    ) : (
                      <Link href={`/painel/financeiro/cartoes/${c.id}`} className="text-muted-foreground text-xs hover:underline">
                        Faturas
                      </Link>
                    )}
                  </TableCell>
                  <TableCell>
                    <Badge variant={c.ativo ? "default" : "secondary"}>
                      {c.ativo ? "Ativo" : "Desativado"}
                    </Badge>
                  </TableCell>
                  {podeEditar && (
                    <TableCell>
                      <form action={alternarCartaoAction}>
                        <input type="hidden" name="cartao_id" value={c.id} />
                        <input type="hidden" name="ativo" value={c.ativo ? "0" : "1"} />
                        <Button type="submit" variant="ghost" size="sm">
                          {c.ativo ? "Desativar" : "Reativar"}
                        </Button>
                      </form>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </>
  )
}
