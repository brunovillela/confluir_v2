import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Pencil, Undo2 } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarEstornos, obterPrazoEstorno } from "@/lib/db/ordens-estorno"
import { podeAcessar } from "@/lib/permissoes"
import { cn } from "@/lib/utils"

import { TabelaEstornos } from "../../estornos/tabela-estornos"
import { PrazoEstornoForm } from "./prazo-form"

export const metadata: Metadata = { title: "Estornos de pagamento — Confluir" }

const ABAS = [
  { valor: "pendentes", rotulo: "Aguardando correção" },
  { valor: "resolvidos", rotulo: "Resolvidos" },
  { valor: "todos", rotulo: "Todos" },
] as const

export default async function EstornosPage({
  searchParams,
}: {
  searchParams: Promise<{ situacao?: string; editar?: string; prazo?: string }>
}) {
  const sessao = await requirePermissao("financeiro_estorno", ["financeiro_pagamento", "financeiro_leitura"])
  const configura = podeAcessar(sessao.permissoes, "financeiro_estorno")
  const brutos = await searchParams
  const situacao = ABAS.find((a) => a.valor === brutos.situacao)?.valor ?? "pendentes"
  const [{ disponivel, estornos }, prazo] = await Promise.all([
    listarEstornos({ situacao }),
    obterPrazoEstorno(),
  ])
  const editandoPrazo = configura && brutos.editar === "prazo" && prazo.disponivel

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro">
            <ArrowLeft />
            Financeiro
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Estornos de pagamento</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Pagamentos devolvidos pelo banco. O estorno se registra na própria ordem paga;
          quem a lançou confere os dados e a reencaminha para autorização.
        </p>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>Rode supabase/ordens-estorno.sql para usar os estornos.</AlertDescription>
        </Alert>
      )}
      {brutos.prazo === "1" && (
        <Alert variant="success">
          <AlertDescription>Prazo salvo.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Prazo para registrar estorno</CardTitle>
              <CardDescription>
                {editandoPrazo
                  ? "Quantos dias depois do pagamento a ordem aceita o estorno"
                  : `Até ${prazo.dias} dia${prazo.dias === 1 ? "" : "s"} após o pagamento`}
              </CardDescription>
            </div>
            {configura && prazo.disponivel && !editandoPrazo && (
              <Button variant="outline" size="sm" asChild>
                <Link href="/painel/financeiro/estornos?editar=prazo">
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        {editandoPrazo && (
          <CardContent>
            <PrazoEstornoForm dias={prazo.dias} />
          </CardContent>
        )}
      </Card>

      <div className="flex flex-wrap gap-1">
        {ABAS.map((a) => (
          <Button key={a.valor} size="sm" variant={a.valor === situacao ? "secondary" : "ghost"} asChild>
            <Link href={`/painel/financeiro/estornos?situacao=${a.valor}`} className={cn(a.valor === situacao && "font-semibold")}>
              {a.rotulo}
            </Link>
          </Button>
        ))}
      </div>

      <Card>
        <CardContent>
          {estornos.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-sm">
              <Undo2 className="size-6" />
              {situacao === "pendentes" ? "Nenhum estorno aguardando correção." : "Nenhum estorno."}
            </div>
          ) : (
            <TabelaEstornos estornos={estornos} />
          )}
        </CardContent>
      </Card>
    </>
  )
}
