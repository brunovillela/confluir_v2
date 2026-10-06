import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, FileCheck2, Trash2 } from "lucide-react"

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
import { urlArquivoCompras } from "@/lib/db/compras"
import { buscarRpa } from "@/lib/db/compras-rpa"
import { formatarCnpjCpf, formatarData, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { AnexarRpaAssinado, ExcluirRpa } from "../rpa-forms"

export const metadata: Metadata = { title: "RPA — Confluir" }

export default async function RpaDetalhePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ salvo?: string }>
}) {
  // Quem opera a compra de serviço também abre (e cuida d)o RPA dela.
  const permissoesCompra = ["aquisicoes_compras_edicao", "aquisicoes_comprador", "aquisicoes_compra_direta"]
  const sessao = await requirePermissao("aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
    ...permissoesCompra,
  ])
  const { id } = await params
  const { salvo } = await searchParams
  const rpa = await buscarRpa(id)
  if (!rpa) notFound()
  const operaCompra = permissoesCompra.some((p) => podeAcessar(sessao.permissoes, p))
  const veContratos = podeAcessar(sessao.permissoes, "aquisicoes_contratos", ["aquisicoes_contratos_edicao"])
  if (!veContratos && !(rpa.compraId && operaCompra)) notFound()
  const podeEditar =
    podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao") || Boolean(rpa.compraId && operaCompra)

  const retencoes = (rpa.inss ?? 0) + (rpa.irrf ?? 0) + (rpa.iss ?? 0)
  const urlAssinado = await urlArquivoCompras(rpa.arquivoAssinado)

  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
            <Link
              href={
                rpa.contratoId
                  ? `/painel/compras/contratos/${rpa.contratoId}`
                  : "/painel/compras/contratos/rpa"
              }
            >
              <ArrowLeft />
              {rpa.contratoId ? (rpa.contratoCodigo ?? "Contrato") : "RPAs"}
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
            {rpa.ordemSituacao === "Aguardando documento fiscal" ? (
              <>
                RPA emitido — a ordem de pagamento da compra aguarda o documento fiscal. Baixe o PDF,
                colha a assinatura do prestador e anexe o recibo assinado abaixo: com ele, a ordem segue
                para autorização.
              </>
            ) : (
              <>
                RPA emitido{rpa.ordemId ? ` e ordem de pagamento gerada (${rpa.ordemSituacao ?? "Em autorização"})` : ""}.
                Baixe o PDF, colha a assinatura do prestador e anexe o recibo assinado
                abaixo — ele vale como comprovante fiscal do serviço.
              </>
            )}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Origem e pagamento</CardTitle>
          <CardDescription>
            {rpa.contratoId
              ? "O RPA é uma forma de pagamento do contrato: a ordem do valor líquido nasce junto com o recibo."
              : rpa.compraId
                ? "RPA da compra de serviço: a ordem do valor líquido é a ordem da compra, e o recibo assinado vale como a nota dela."
                : "RPA anterior aos contratos e às compras de serviço."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-2 text-sm sm:grid-cols-2">
          <div className="grid grid-cols-[9rem_1fr] gap-2">
            <span className="text-muted-foreground">{rpa.compraId ? "Compra" : "Contrato"}</span>
            <span>
              {rpa.compraId ? (
                <Link href={`/painel/compras/${rpa.compraId}`} className="text-primary tabular-nums hover:underline">
                  {rpa.compraCodigo ?? "(sem código)"}
                </Link>
              ) : rpa.contratoId ? (
                <Link
                  href={`/painel/compras/contratos/${rpa.contratoId}`}
                  className="text-primary tabular-nums hover:underline"
                >
                  {rpa.contratoCodigo ?? "(sem código)"}
                  {rpa.contratoObjeto ? ` — ${rpa.contratoObjeto}` : ""}
                </Link>
              ) : (
                <span className="text-muted-foreground">Sem contrato (anterior)</span>
              )}
            </span>
          </div>
          <div className="grid grid-cols-[9rem_1fr] gap-2">
            <span className="text-muted-foreground">Ordem de pagamento</span>
            <span>
              {rpa.ordemId ? (
                <Link
                  href={`/painel/financeiro/ordens/${rpa.ordemId}`}
                  className="text-primary tabular-nums hover:underline"
                >
                  {rpa.ordemCodigo ?? "(sem código)"} · {rpa.ordemSituacao ?? "—"}
                </Link>
              ) : (
                <span className="text-muted-foreground">Nenhuma</span>
              )}
            </span>
          </div>
        </CardContent>
      </Card>

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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <FileCheck2 className="mr-1 inline size-4 align-[-3px]" />
            Recibo assinado
          </CardTitle>
          <CardDescription>
            {rpa.arquivoAssinado
              ? `Anexado em ${formatarData(rpa.assinadoEm ?? rpa.created_at)}. Com o recibo assinado, o RPA é comprovante fiscal e não pode mais ser excluído.`
              : "Baixe o PDF, colha a assinatura do prestador e anexe aqui o recibo assinado (PDF ou foto). Enquanto não houver recibo assinado, o RPA pode ser excluído."}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {urlAssinado && (
            <div>
              <Button asChild variant="outline" size="sm">
                <a href={urlAssinado} target="_blank" rel="noopener noreferrer">
                  <Download />
                  Ver o recibo assinado
                </a>
              </Button>
            </div>
          )}
          {podeEditar ? (
            <AnexarRpaAssinado id={id} substituir={Boolean(rpa.arquivoAssinado)} />
          ) : (
            !rpa.arquivoAssinado && (
              <p className="text-muted-foreground text-sm">Ainda não anexado.</p>
            )
          )}
        </CardContent>
      </Card>

      {podeEditar && !rpa.arquivoAssinado && (
        <Card>
          <CardHeader>
            <CardTitle className="text-destructive text-base">
              <Trash2 className="mr-1 inline size-4 align-[-3px]" />
              Excluir RPA
            </CardTitle>
            <CardDescription>
              Para corrigir um recibo ainda não assinado, exclua e emita outro — RPAs
              emitidos não são editáveis. A ordem de pagamento vai junto enquanto
              estiver Em autorização; depois de autorizada, o Financeiro precisa
              cancelá-la antes.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ExcluirRpa id={id} numero={rpa.numero} />
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
