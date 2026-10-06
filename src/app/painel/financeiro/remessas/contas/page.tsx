import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Landmark, Pencil, Plus } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarCentrosDeDebito } from "@/lib/db/financeiro"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { listarContasBancarias, obterContaBancaria } from "@/lib/db/remessas"

import { ContaForm } from "./conta-form"

export const metadata: Metadata = { title: "Contas bancárias — Confluir" }

export default async function ContasBancariasPage({ searchParams }: { searchParams: Promise<{ editar?: string; nova?: string; salvo?: string }> }) {
  await requirePermissao("financeiro_pagamento")
  const sp = await searchParams
  const [{ disponivel, contas }, centros, org] = await Promise.all([listarContasBancarias(), listarCentrosDeDebito().catch(() => []), obterOrganizacao()])
  const editando = sp.editar ? await obterContaBancaria(sp.editar) : null
  const mostrarForm = Boolean(sp.nova) || Boolean(editando)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/remessas">
            <ArrowLeft />
            Remessas
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <Landmark className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">Contas bancárias da entidade</h1>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">De onde a entidade paga. Agência, conta, convênio e versões do layout saem do contrato de remessa com o banco.</p>
      </div>

      {sp.salvo && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Conta salva.</AlertDescription>
        </Alert>
      )}
      {!disponivel && (
        <Alert>
          <AlertDescription>Falta rodar o SQL supabase/financeiro-remessas.sql.</AlertDescription>
        </Alert>
      )}

      {disponivel && !mostrarForm && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Contas</CardTitle>
              <Button size="sm" asChild>
                <Link href="/painel/financeiro/remessas/contas?nova=1">
                  <Plus />
                  Nova conta
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {contas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhuma conta cadastrada. Cadastre a conta de pagamento para gerar a primeira remessa.</p>
            ) : (
              <ul className="divide-y">
                {contas.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center justify-between gap-3 py-2 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium">{c.apelido}</span>
                      {!c.ativa && (
                        <Badge variant="outline" className="ml-2">
                          inativa
                        </Badge>
                      )}
                      <span className="text-muted-foreground block text-xs">
                        {c.bancoCodigo} {c.bancoNome ?? ""} · ag. {c.agencia}
                        {c.agenciaDv ? `-${c.agenciaDv}` : ""} · {c.tipoConta === "poupanca" ? "poupança" : "c/c"} {c.conta}
                        {c.contaDv ? `-${c.contaDv}` : ""}
                        {c.convenio ? ` · convênio ${c.convenio}` : " · sem convênio"} · {c.sequenciaRemessa} remessa{c.sequenciaRemessa === 1 ? "" : "s"}
                      </span>
                    </span>
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/painel/financeiro/remessas/contas?editar=${c.id}`}>
                        <Pencil />
                        Editar
                      </Link>
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {disponivel && mostrarForm && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{editando ? `Editar ${editando.apelido}` : "Nova conta"}</CardTitle>
            <CardDescription className="text-xs">Sem titular informado, a remessa usa o nome e o CNPJ do cadastro da entidade.</CardDescription>
          </CardHeader>
          <CardContent>
            <ContaForm
              conta={editando}
              centros={centros.map((c) => ({ id: c.id, nome: [c.classificador, c.nome_da_conta].filter(Boolean).join(" · ") }))}
              titularPadrao={{ nome: org?.nomeRazao ?? org?.nomeFantasia ?? null, documento: org?.cnpjCpf ?? null }}
            />
          </CardContent>
        </Card>
      )}
    </>
  )
}
