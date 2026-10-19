import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, CreditCard } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { rotuloTipoCartao, rotuloUsoCartao } from "@/lib/compras-constantes"
import { pessoasAutorizaveis } from "@/lib/db/caixa"
import { faturasAbertas } from "@/lib/db/cartao-faturas"
import { AVISO_SQL_PAGAMENTO, listarCartoes } from "@/lib/db/compras-pagamento"
import { formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { alternarCartaoAction } from "./actions"
import { CartaoForm } from "./cartao-form"

export const metadata: Metadata = { title: "Cartões — Confluir" }

export default async function CartoesPage() {
  const sessao = await requirePermissao("financeiro_pagamento", [
    "financeiro_caixa",
    "financeiro_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_pagamento", [
    "financeiro_caixa",
  ])

  const [{ disponivel, cartoes }, pessoas, abertas] = await Promise.all([
    listarCartoes(),
    podeEditar ? pessoasAutorizaveis() : Promise.resolve([]),
    faturasAbertas(),
  ])

  return (
    <>
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

      {disponivel && podeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo cartão</CardTitle>
            <CardDescription>
              Cadastre cada cartão uma vez; desative quando for cancelado.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CartaoForm pessoas={pessoas} />
          </CardContent>
        </Card>
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
                      Nenhum cartão cadastrado.
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
