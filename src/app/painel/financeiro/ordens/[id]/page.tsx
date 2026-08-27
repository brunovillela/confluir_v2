import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ExternalLink,
  FileSignature,
  Landmark,
  Pencil,
  Printer,
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
import { podeAcessar } from "@/lib/permissoes"
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
      <dd className="mt-0.5 text-sm break-words">{children ?? "—"}</dd>
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
  const sessao = await requirePermissao("financeiro_pagamento", [
    "financeiro_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_pagamento")

  const { id } = await params
  const { editar, salvo, removido } = await searchParams
  const detalhe = await detalheOrdem(id)
  if (!detalhe) notFound()
  const { ordem, favorecido, pagador, autorizador, contratoVinculado } =
    detalhe

  const editandoPagamento = editar === "pagamento" && podeEditar
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
          <Button variant="outline" size="sm" asChild className="ml-auto">
            <a
              href={`/painel/financeiro/ordens/${id}/extrato`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Printer />
              Extrato (PDF)
            </a>
          </Button>
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
        <Card className="min-w-0">
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
              {detalhe.compraObservacao && (
                <div className="col-span-2">
                  <Campo rotulo="Observação da compra">
                    {detalhe.compraObservacao}
                  </Campo>
                </div>
              )}
            </dl>
          </CardContent>
        </Card>

        <Card className="min-w-0">
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
              {editandoPagamento || !podeEditar ? (
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
                podeEditar={podeEditar}
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

      {contratoVinculado && (
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Contrato vinculado</CardTitle>
                <CardDescription>
                  Contrato que originou esta ordem de pagamento
                </CardDescription>
              </div>
              <FileSignature className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo rotulo="Objeto">
                  {contratoVinculado.codigo ? (
                    <span className="text-muted-foreground">
                      {contratoVinculado.codigo} —{" "}
                    </span>
                  ) : null}
                  {contratoVinculado.objeto ?? "(sem objeto)"}
                </Campo>
              </div>
              <Campo rotulo="Vigência">
                {formatarData(contratoVinculado.vigencia_inicio)} a{" "}
                {formatarData(contratoVinculado.vigencia_termino)}
              </Campo>
              <Campo rotulo="Situação">
                {contratoVinculado.ativo === true ? (
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
              </Campo>
              <Campo rotulo="Documento do contrato">
                <LinkArquivo url={contratoVinculado.arquivo_contrato} />
              </Campo>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
