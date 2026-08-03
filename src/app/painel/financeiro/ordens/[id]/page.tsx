import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ExternalLink,
  FileSignature,
  Landmark,
  Pencil,
  Receipt,
  Tags,
} from "lucide-react"

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
import { requirePermissao } from "@/lib/auth"
import {
  detalheOrdem,
  listarCentrosCusto,
  type CentroCusto,
} from "@/lib/db/financeiro"
import { createAdminClient } from "@/lib/supabase/admin"
import { formatarData, formatarMoeda } from "@/lib/formato"

import { SituacaoBadge } from "../../situacao-badge"
import { PagamentoForm } from "./pagamento-form"

export const metadata: Metadata = { title: "Ordem de pagamento — Confluir" }

function Campo({
  rotulo,
  children,
}: {
  rotulo: string
  children: React.ReactNode
}) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{children ?? "—"}</dd>
    </div>
  )
}

function texto(valor: unknown): string {
  return typeof valor === "string" && valor.trim() ? valor : "—"
}

function LinkArquivo({ url }: { url: unknown }) {
  if (typeof url !== "string" || !url.trim()) {
    return <span className="text-muted-foreground">—</span>
  }
  // URLs migradas do Bubble vêm protocolo-relativas (//cdn.bubble.io/…)
  const href = url.startsWith("//") ? `https:${url}` : url
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary inline-flex items-center gap-1 text-sm hover:underline"
    >
      Abrir
      <ExternalLink className="size-3.5" />
    </a>
  )
}

function CartaoCentroCusto({
  titulo,
  centro,
}: {
  titulo: string
  centro: CentroCusto | null
}) {
  return (
    <div className="rounded-lg border px-4 py-3">
      <p className="text-muted-foreground text-xs font-medium">{titulo}</p>
      {centro ? (
        <div className="mt-1 grid gap-1 text-sm">
          <Link
            href={`/painel/financeiro/centros-custo/${centro.id}`}
            className="font-medium hover:underline"
          >
            {centro.nome_da_conta ?? "(sem nome)"}
          </Link>
          <p className="text-muted-foreground text-xs">
            {[
              centro.acesso && `código ${centro.acesso}`,
              centro.classificador,
              centro.tipo_da_conta,
              centro.usavel === false && "não usável",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">Não informado.</p>
      )}
    </div>
  )
}

export default async function OrdemPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string; removido?: string }>
}) {
  await requirePermissao("financeiro_pagamento")

  const { id } = await params
  const { editar, salvo, removido } = await searchParams
  const detalhe = await detalheOrdem(id)
  if (!detalhe) notFound()
  const { ordem, favorecido, pagador, autorizador, contratos } = detalhe

  const editandoPagamento = editar === "pagamento"
  const temPagamento =
    ordem.data_pagamento !== null ||
    ordem.arquivo_pagamento !== null ||
    ordem.situacao === "Paga"

  // Arquivos novos são caminhos no bucket 'comprovantes' (URLs legadas do
  // Bubble passam direto pelo LinkArquivo).
  const resolverArquivo = async (valor: unknown): Promise<string | null> => {
    if (typeof valor !== "string" || !valor.trim()) return null
    if (/^(https?:)?\/\//.test(valor)) return valor
    const admin = await createAdminClient()
    const { data } = await admin.storage
      .from("comprovantes")
      .createSignedUrl(valor, 3600)
    return data?.signedUrl ?? null
  }
  const [urlComprovante, urlBoleto] = await Promise.all([
    resolverArquivo(ordem.arquivo_pagamento),
    resolverArquivo(ordem.arquivo_boleto),
  ])

  const centros = editandoPagamento ? await listarCentrosCusto() : []

  // Seção de contratos só para ordens provenientes de contrato.
  const ordemDeContrato = String(ordem.tipo ?? "").startsWith("Contrato")

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/financeiro/ordens">
            <ArrowLeft />
            Ordens de pagamento
          </Link>
        </Button>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Ordem {texto(ordem.codigo)}
          </h1>
          <SituacaoBadge situacao={(ordem.situacao as string) ?? null} />
          {typeof ordem.tipo === "string" && ordem.tipo && (
            <Badge variant="outline" className="text-muted-foreground">
              {ordem.tipo}
            </Badge>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {texto(ordem.descricao)}
        </p>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Pagamento registrado — ordem marcada como Paga.</AlertDescription>
        </Alert>
      )}
      {removido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Registro de pagamento removido.</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  Detalhes da despesa
                </CardTitle>
                <CardDescription>Compra e documentos fiscais</CardDescription>
              </div>
              <Receipt className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <div className="col-span-2">
                <Campo rotulo="Descrição">{texto(ordem.descricao)}</Campo>
              </div>
              <Campo rotulo="Favorecido">{favorecido ?? "—"}</Campo>
              <Campo rotulo="Tipo">{texto(ordem.tipo)}</Campo>
              <Campo rotulo="Valor cobrado">
                {formatarMoeda(ordem.valor_inicial_cobranca as number | null)}
              </Campo>
              <Campo rotulo="Reembolso">
                {ordem.reembolso_pagamento === true ? "Sim" : "Não"}
              </Campo>
              <Campo rotulo="Nota fiscal">
                <LinkArquivo url={ordem.arquivo_nota_fiscal} />
              </Campo>
              <Campo rotulo="Orçamento">
                <LinkArquivo url={ordem.arquivo_orcamento} />
              </Campo>
              <Campo rotulo="Boleto">
                <LinkArquivo url={urlBoleto} />
              </Campo>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">
                  Detalhes do pagamento
                </CardTitle>
                <CardDescription>
                  Autorização, forma e comprovante
                </CardDescription>
              </div>
              {editandoPagamento ? (
                <Landmark className="text-muted-foreground size-4" />
              ) : (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/financeiro/ordens/${id}?editar=pagamento`}>
                    <Pencil />
                    {temPagamento ? "Editar pagamento" : "Registrar pagamento"}
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          {editandoPagamento ? (
            <CardContent>
              <PagamentoForm
                ordemId={id}
                valorPago={ordem.valor_pago as number | null}
                dataPagamento={ordem.data_pagamento as string | null}
                centroReceitaId={ordem.centro_custo_receita_id as string | null}
                temComprovante={!!ordem.arquivo_pagamento}
                temPagamento={temPagamento}
                centros={centros
                  .filter((c) => c.usavel !== false)
                  .map((c) => ({
                    id: c.id,
                    rotulo: [c.acesso, c.nome_da_conta ?? "(sem nome)"]
                      .filter(Boolean)
                      .join(" — "),
                  }))}
              />
            </CardContent>
          ) : (
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <Campo rotulo="Valor pago">
                {formatarMoeda(ordem.valor_pago as number | null)}
              </Campo>
              <Campo rotulo="Vencimento">
                {formatarData(ordem.vencimento as string | null)}
              </Campo>
              <Campo rotulo="Data do pagamento">
                {formatarData(ordem.data_pagamento as string | null)}
              </Campo>
              <Campo rotulo="Forma de pagamento">
                {texto(ordem.forma_pagamento)}
              </Campo>
              <Campo rotulo="Código PIX">{texto(ordem.pix_codigo)}</Campo>
              <Campo rotulo="Pagador">{pagador ?? "—"}</Campo>
              <Campo rotulo="Comprovante de pagamento">
                <LinkArquivo url={urlComprovante} />
              </Campo>
              <Campo rotulo="Autorização">
                {ordem.autorizacao_esta_autorizado === true ? (
                  <Badge
                    variant="outline"
                    className="border-success/40 text-success-fg"
                  >
                    Autorizada
                  </Badge>
                ) : (
                  <Badge variant="outline" className="text-muted-foreground">
                    Sem autorização registrada
                  </Badge>
                )}
              </Campo>
              <Campo rotulo="Autorizador / data">
                {autorizador ?? "—"}
                {ordem.autorizacao_data ? (
                  <> · {formatarData(ordem.autorizacao_data as string)}</>
                ) : null}
              </Campo>
              {typeof ordem.autorizacao_observacao === "string" &&
                ordem.autorizacao_observacao.trim() && (
                  <div className="col-span-2">
                    <Campo rotulo="Observação da autorização">
                      {ordem.autorizacao_observacao}
                    </Campo>
                  </div>
                )}
            </dl>
          </CardContent>
          )}
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Centro de custo</CardTitle>
              <CardDescription>
                Classificação contábil da despesa e da receita
              </CardDescription>
            </div>
            <Tags className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <CartaoCentroCusto
            titulo="Centro de custo — despesa"
            centro={detalhe.centroCustoDespesa}
          />
          <CartaoCentroCusto
            titulo="Centro de custo — receita"
            centro={detalhe.centroCustoReceita}
          />
        </CardContent>
      </Card>

      {ordemDeContrato && (
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">
                Contratos do fornecedor
                <span className="text-muted-foreground ml-2 text-sm font-normal">
                  {contratos.length} encontrado
                  {contratos.length === 1 ? "" : "s"}
                </span>
              </CardTitle>
              <CardDescription>
                Contratos ligados à empresa favorecida desta ordem
              </CardDescription>
            </div>
            <FileSignature className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent>
          {contratos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum contrato registrado para este fornecedor
              {detalhe.fornecedorNome ? ` (${detalhe.fornecedorNome})` : ""}.
            </p>
          ) : (
            <ul className="grid gap-2">
              {contratos.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
                >
                  <span className="min-w-0">
                    <span className="block truncate font-medium">
                      {c.codigo ? `${c.codigo} — ` : ""}
                      {c.objeto ?? "(sem objeto)"}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      Vigência {formatarData(c.vigencia_inicio)} a{" "}
                      {formatarData(c.vigencia_termino)}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    {c.ativo === true ? (
                      <Badge
                        variant="outline"
                        className="border-success/40 text-success-fg"
                      >
                        Ativo
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-muted-foreground">
                        Inativo
                      </Badge>
                    )}
                    <LinkArquivo url={c.arquivo_contrato} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
      )}
    </>
  )
}
