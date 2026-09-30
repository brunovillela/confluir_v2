import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink, Receipt, Undo2 } from "lucide-react"

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
import { requireSessaoPainel } from "@/lib/auth"
import { FORMAS_ESTORNO } from "@/lib/compras-constantes"
import { hojeSP } from "@/lib/db/comum"
import { obterEstorno } from "@/lib/db/ordens-estorno"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

import { ehFinanceiro, podeCorrigirEstorno, podeVerEstorno } from "../acesso"
import { meiosDoEstorno } from "./actions"
import { CorrecaoEstornoForm } from "./correcao-form"

export const metadata: Metadata = { title: "Estorno de pagamento — Confluir" }

function Campo({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm break-words">{children}</dd>
    </div>
  )
}

function Arquivo({ url, rotulo = "Abrir" }: { url: string | null; rotulo?: string }) {
  if (!url) return <span className="text-muted-foreground">—</span>
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="text-primary inline-flex items-center gap-1 hover:underline">
      {rotulo}
      <ExternalLink className="size-3" />
    </a>
  )
}

export default async function EstornoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ corrigido?: string }>
}) {
  const sessao = await requireSessaoPainel()
  const { id } = await params
  const { corrigido } = await searchParams
  const e = await obterEstorno(id)
  if (!e || !podeVerEstorno(sessao, e.responsavelId)) notFound()

  const financeiro = ehFinanceiro(sessao)
  const corrige = !e.resolvidoEm && podeCorrigirEstorno(sessao, e.responsavelId)
  const formas = e.ordem.fornecedorId
    ? FORMAS_ESTORNO
    : FORMAS_ESTORNO.filter((f) => f === "Pix (QR Code)" || f === "Boleto")
  const depois = (e.correcao?.depois ?? null) as Record<string, unknown> | null

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href={financeiro ? "/painel/financeiro/estornos" : "/painel/estornos"}>
            <ArrowLeft />
            {financeiro ? "Estornos de pagamento" : "Meus estornos"}
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Estorno — ordem {e.ordemCodigo ?? ""}
          </h1>
          <Badge
            variant="outline"
            className={e.resolvidoEm ? "border-success/40 text-success-fg" : "border-warning/50 text-warning-fg"}
          >
            {e.resolvidoEm ? "Resolvido" : "Aguardando correção"}
          </Badge>
          {financeiro && (
            <Button variant="outline" size="sm" asChild className="ml-auto">
              <Link href={`/painel/financeiro/ordens/${e.ordemId}`}>
                <Receipt />
                Abrir a ordem
              </Link>
            </Button>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">{e.ordemDescricao ?? ""}</p>
      </div>

      {corrigido === "1" && (
        <Alert variant="success">
          <AlertDescription>
            Dados conferidos — a ordem voltou para autorização e segue depois para o pagamento.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card className="min-w-0 border-warning/40">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Comunicado de estorno</CardTitle>
                <CardDescription>O banco devolveu o pagamento</CardDescription>
              </div>
              <Undo2 className="text-warning-fg size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo rotulo="Data do estorno">{formatarData(e.dataEstorno)}</Campo>
              <Campo rotulo="Valor devolvido">{formatarMoeda(e.valor)}</Campo>
              <div className="col-span-2">
                <Campo rotulo="Motivo informado pelo banco">{e.motivo}</Campo>
              </div>
              <Campo rotulo="Registrado por">
                {e.registradoPor ?? "—"} · {formatarDataHora(e.criadoEm)}
              </Campo>
              <Campo rotulo="Comunicado do banco">
                <Arquivo url={e.urlComunicado} />
              </Campo>
              <Campo rotulo="Quem confere">{e.responsavel ?? "Financeiro"}</Campo>
            </dl>
          </CardContent>
        </Card>

        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Pagamento estornado</CardTitle>
            <CardDescription>Como a ordem tinha sido paga</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo rotulo="Favorecido">{e.ordem.favorecido ?? "—"}</Campo>
              <Campo rotulo="Pago em">{formatarData(e.pagamento.data)}</Campo>
              <Campo rotulo="Forma">{e.pagamento.forma ?? "—"}</Campo>
              <Campo rotulo="Valor da ordem">{formatarMoeda(e.ordem.valorCobranca)}</Campo>
              {e.pagamento.pagoCom && (
                <div className="col-span-2">
                  <Campo rotulo="Para onde foi">{e.pagamento.pagoCom}</Campo>
                </div>
              )}
              {e.pagamento.pixCodigo && (
                <div className="col-span-2">
                  <Campo rotulo="Código Pix usado">
                    <span className="font-mono text-xs break-all">{e.pagamento.pixCodigo}</span>
                  </Campo>
                </div>
              )}
              <Campo rotulo="Boleto">
                <Arquivo url={e.pagamento.urlBoleto} />
              </Campo>
              <Campo rotulo="Comprovante do pagamento">
                <Arquivo url={e.pagamento.urlComprovante} />
              </Campo>
            </dl>
          </CardContent>
        </Card>
      </div>

      {corrige && (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle className="text-base">Conferir e reencaminhar</CardTitle>
            <CardDescription>
              Confirme com o favorecido os dados bancários ou peça um novo boleto, grave aqui
              e a ordem volta para autorização.
              {!e.ordem.fornecedorId &&
                " O favorecido não é um fornecedor: corrija a conta dele no cadastro (Pessoal, Filiados…) e diga aqui o que foi feito, ou use Pix (QR Code) ou boleto."}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <CorrecaoEstornoForm
              estornoId={e.id}
              formas={formas}
              formaAtual={e.ordem.forma}
              fornecedorId={e.ordem.fornecedorId}
              buscarMeios={meiosDoEstorno.bind(null, e.id)}
              hoje={hojeSP()}
              vencimentoAtual={e.ordem.vencimento ? formatarData(e.ordem.vencimento) : null}
            />
          </CardContent>
        </Card>
      )}

      {!e.resolvidoEm && !corrige && (
        <Alert>
          <AlertDescription>
            Aguardando {e.responsavel ?? "o Financeiro"} conferir os dados de pagamento.
          </AlertDescription>
        </Alert>
      )}

      {e.resolvidoEm && (
        <Card className="min-w-0 border-success/40">
          <CardHeader>
            <CardTitle className="text-base">Correção</CardTitle>
            <CardDescription>
              {formatarDataHora(e.resolvidoEm)}
              {e.resolvidoPor ? ` · ${e.resolvidoPor}` : ""}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <Campo rotulo="O que foi conferido ou corrigido">{e.resolucao ?? "—"}</Campo>
              </div>
              {depois && (
                <>
                  <Campo rotulo="Nova forma">{String(depois.forma_pagamento ?? "—")}</Campo>
                  <Campo rotulo="Vencimento">{formatarData((depois.vencimento as string | null) ?? null)}</Campo>
                  {typeof depois.pago_com === "string" && depois.pago_com && (
                    <div className="col-span-2">
                      <Campo rotulo="Para onde vai">{depois.pago_com}</Campo>
                    </div>
                  )}
                  {e.ordem.urlBoleto && depois.forma_pagamento === "Boleto" && (
                    <Campo rotulo="Boleto">
                      <Arquivo url={e.ordem.urlBoleto} />
                    </Campo>
                  )}
                </>
              )}
              <Campo rotulo="Situação atual da ordem">{e.ordemSituacao ?? "—"}</Campo>
            </dl>
          </CardContent>
        </Card>
      )}
    </>
  )
}
