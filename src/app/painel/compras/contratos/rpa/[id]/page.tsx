import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, Trash2 } from "lucide-react"

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
import { buscarRpa } from "@/lib/db/compras-rpa"
import { formatarCnpjCpf, formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { ExcluirRpa } from "../rpa-forms"

export const metadata: Metadata = { title: "RPA — Confluir" }

export default async function RpaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
  ])
  const podeEditar = podeAcessar(
    sessao.permissoes,
    "aquisicoes_contratos_edicao"
  )
  const { id } = await params
  const { salvo } = await searchParams
  const rpa = await buscarRpa(id)
  if (!rpa) notFound()

  const retencoes = (rpa.inss ?? 0) + (rpa.irrf ?? 0) + (rpa.iss ?? 0)

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link href="/painel/compras/contratos/rpa">
              <ArrowLeft />
              RPAs
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">
            RPA nº {rpa.numero ?? "—"}
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {rpa.fornecedorNome ?? "—"} · emitido por{" "}
            {rpa.criadoPorNome ?? "—"} em {formatarData(rpa.created_at)}
          </p>
        </div>
        <Button asChild>
          <a href={`/painel/compras/contratos/rpa/${id}/pdf`}>
            <Download />
            Baixar PDF
          </a>
        </Button>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            RPA emitido. Baixe o PDF, colha a assinatura do prestador e arquive
            — o recibo assinado vale como comprovante fiscal do serviço.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Prestador e serviço</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Campo rotulo="Prestador" valor={rpa.fornecedorNome} />
            <Campo
              rotulo="CPF/CNPJ"
              valor={
                rpa.fornecedorCnpjCpf
                  ? formatarCnpjCpf(rpa.fornecedorCnpjCpf)
                  : null
              }
            />
            <Campo rotulo="Endereço" valor={rpa.fornecedorEndereco} />
            <Campo rotulo="Serviço prestado" valor={rpa.descricao_servico} />
            <Campo
              rotulo="Data do serviço"
              valor={rpa.data_servico ? formatarData(rpa.data_servico) : null}
            />
            <Campo rotulo="Observações" valor={rpa.observacoes} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Valores</CardTitle>
            <CardDescription>
              Base informada:{" "}
              {rpa.base === "liquido"
                ? "valor líquido (conta inversa achou o bruto)"
                : "valor bruto"}
              {rpa.valor_informado != null
                ? ` — ${formatarMoeda(rpa.valor_informado)}`
                : ""}
              {rpa.dependentes
                ? ` · ${rpa.dependentes} dependente${rpa.dependentes === 1 ? "" : "s"} (IRRF)`
                : ""}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2 text-sm">
            <Valor rotulo="Valor bruto" v={rpa.valor_bruto} forte />
            <Valor rotulo="INSS retido" v={rpa.inss} negativo />
            <Valor rotulo="IRRF retido" v={rpa.irrf} negativo />
            <Valor
              rotulo={`ISS retido${rpa.iss_aliquota != null ? ` (${rpa.iss_aliquota}%)` : ""}`}
              v={rpa.iss}
              negativo
            />
            <Valor rotulo="Total de retenções" v={retencoes} negativo />
            <div className="border-t pt-2">
              <Valor rotulo="Valor líquido a pagar" v={rpa.valor_liquido} forte />
            </div>
          </CardContent>
        </Card>
      </div>

      {podeEditar && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              <Trash2 className="mr-1 inline size-4 align-[-3px]" />
              Excluir RPA
            </CardTitle>
            <CardDescription>
              Para corrigir um recibo, exclua e emita outro — RPAs emitidos não
              são editáveis.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExcluirRpa id={id} />
          </CardContent>
        </Card>
      )}
    </>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5">{valor ?? "—"}</dd>
    </div>
  )
}

function Valor({
  rotulo,
  v,
  forte,
  negativo,
}: {
  rotulo: string
  v: number | null
  forte?: boolean
  negativo?: boolean
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className={forte ? "font-medium" : "text-muted-foreground"}>
        {rotulo}
      </span>
      <span className={`tabular-nums ${forte ? "font-semibold" : ""}`}>
        {negativo && v ? "− " : ""}
        {formatarMoeda(v)}
      </span>
    </div>
  )
}
