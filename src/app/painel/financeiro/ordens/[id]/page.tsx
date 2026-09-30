import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  ExternalLink,
  FileSignature,
  FolderKanban,
  GitBranch,
  History,
  Landmark,
  Pencil,
  Printer,
  Receipt,
  ShieldCheck,
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
import { listarCentrosCusto, type CentroCusto } from "@/lib/db/financeiro"
import { SITUACOES_ENCERRADAS, SITUACOES_PAGAVEIS } from "@/lib/db/ordens-ciclo"
import { extratoDaOrdem } from "@/lib/db/ordens-extrato"
import type { StatusAuditoria } from "@/lib/db/ordens-auditoria"
import { TIPO_ORDEM_FOLHA } from "@/lib/contracheques-constantes"
import { podeAcessar } from "@/lib/permissoes"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

import { SituacaoBadge } from "../../situacao-badge"
import { AcoesOrdem } from "./acoes-ordem"
import { PagamentoForm } from "./pagamento-form"

const ESTILO_STATUS: Record<StatusAuditoria, { rotulo: string; classe: string }> = {
  ok: { rotulo: "OK", classe: "border-success/40 text-success-fg" },
  alerta: { rotulo: "Alerta", classe: "border-warning/50 text-warning-fg" },
  falha: { rotulo: "Falha", classe: "border-destructive/50 text-destructive" },
  pendente: { rotulo: "Pendente", classe: "border-info/40 text-info-fg" },
  na: { rotulo: "N/A", classe: "text-muted-foreground" },
}

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
  searchParams: Promise<{
    editar?: string
    salvo?: string
    removido?: string
    cancelada?: string
    corrigida?: string
    reenviada?: string
  }>
}) {
  const sessao = await requirePermissao("financeiro_pagamento", [
    "financeiro_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_pagamento")

  const { id } = await params
  const { editar, salvo, removido, cancelada, corrigida, reenviada } = await searchParams
  const x = await extratoDaOrdem(id)
  if (!x) notFound()
  const detalhe = x.detalhe
  const pagoCom = x.pagoCom
  const { ordem, favorecido, pagador, contratoVinculado } = detalhe
  const situacao = String(ordem.situacao ?? "")

  const pagavel = SITUACOES_PAGAVEIS.includes(situacao)
  const editandoPagamento = editar === "pagamento" && podeEditar && (pagavel || situacao === "Paga")
  const temPagamento =
    ordem.data_pagamento !== null ||
    ordem.arquivo_pagamento !== null ||
    situacao === "Paga"
  const aberta = !SITUACOES_ENCERRADAS.includes(situacao)

  const urlComprovante = x.arquivos.comprovante
  const urlBoleto = x.arquivos.boleto
  const urlNotaFiscal = x.arquivos.notaFiscal
  const rateio = x.rateio
  const pr = x.procedencia
  const pessoas = [pr.solicitante, ...pr.envolvidos].filter(
    (p): p is NonNullable<typeof p> => Boolean(p)
  )

  const centros = podeEditar ? await listarCentrosCusto() : []
  const opcoesCentro = centros
    .filter((c) => c.usavel !== false)
    .map((c) => ({
      id: c.id,
      rotulo: [c.acesso, c.nome_da_conta ?? "(sem nome)"].filter(Boolean).join(" — "),
    }))

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
      {cancelada === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ordem cancelada — o motivo ficou no histórico.</AlertDescription>
        </Alert>
      )}
      {corrigida && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {corrigida === "reautorizar"
              ? "Ordem corrigida. Como o valor mudou, ela voltou para autorização."
              : "Ordem corrigida — o antes e o depois ficaram no histórico."}
          </AlertDescription>
        </Alert>
      )}
      {reenviada === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ordem reenviada para autorização.</AlertDescription>
        </Alert>
      )}

      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Procedência</CardTitle>
              <CardDescription>{pr.origem}</CardDescription>
            </div>
            <GitBranch className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-4">
          <dl className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
            {pr.titulo && (
              <Campo rotulo="Registro de origem">
                {pr.href ? (
                  <Link href={pr.href} className="text-primary hover:underline">
                    {pr.titulo}
                  </Link>
                ) : (
                  pr.titulo
                )}
              </Campo>
            )}
            {pr.linhas.map((l) => (
              <Campo key={l.rotulo} rotulo={l.rotulo}>
                {l.valor}
              </Campo>
            ))}
            {pessoas.map((p) => (
              <Campo key={p.papel + (p.id ?? p.nome)} rotulo={p.papel}>
                {p.nome ?? "—"}
              </Campo>
            ))}
            {pr.recebimento && (
              <Campo rotulo="Recebimento">
                {pr.recebimento.recebido
                  ? `Recebido${pr.recebimento.data ? ` em ${formatarData(pr.recebimento.data)}` : ""}${pr.recebimento.por ? ` por ${pr.recebimento.por}` : ""}${pr.recebimento.deAcordo === false ? " — com ressalva" : ""}`
                  : "Ainda não recebido"}
              </Campo>
            )}
            {pr.documentos.map((d) => (
              <Campo key={d.rotulo} rotulo={d.rotulo}>
                <LinkArquivo url={d.url} />
              </Campo>
            ))}
          </dl>
          {podeEditar && aberta && (
            <AcoesOrdem
              ordemId={id}
              situacao={situacao}
              podeCorrigir={situacao !== "Paga"}
              podeCancelar={situacao !== "Paga"}
              podeReenviar={situacao === "Aguardando informações"}
              atual={{
                descricao: typeof ordem.descricao === "string" ? ordem.descricao : "",
                valor:
                  ordem.valor_inicial_cobranca === null || ordem.valor_inicial_cobranca === undefined
                    ? ""
                    : Number(ordem.valor_inicial_cobranca).toFixed(2).replace(".", ","),
                vencimento: typeof ordem.vencimento === "string" ? ordem.vencimento : "",
                centroCustoDespesaId:
                  typeof ordem.centro_custo_despesa_id === "string" ? ordem.centro_custo_despesa_id : "",
                formaPagamento: typeof ordem.forma_pagamento === "string" ? ordem.forma_pagamento : "",
              }}
              centros={opcoesCentro}
            />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                Auditoria automática
                <Badge variant="outline" className={ESTILO_STATUS[x.auditoria.geral].classe}>
                  {ESTILO_STATUS[x.auditoria.geral].rotulo}
                </Badge>
              </CardTitle>
              <CardDescription>
                Verificações feitas na hora — também saem no extrato em PDF.
              </CardDescription>
            </div>
            <ShieldCheck className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent>
          <ul className="divide-border grid divide-y">
            {x.auditoria.itens.map((i) => (
              <li key={i.codigo} className="flex items-start gap-3 py-2">
                <Badge variant="outline" className={`w-20 shrink-0 justify-center ${ESTILO_STATUS[i.status].classe}`}>
                  {ESTILO_STATUS[i.status].rotulo}
                </Badge>
                <div className="min-w-0 text-sm">
                  <p className="font-medium">{i.rotulo}</p>
                  <p className="text-muted-foreground text-xs">{i.detalhe}</p>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

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
              <Campo rotulo={ordem.tipo === TIPO_ORDEM_FOLHA ? "Contracheque (comprovante)" : "Nota fiscal"}>
                <LinkArquivo url={urlNotaFiscal} />
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
              {editandoPagamento || !podeEditar || !(pagavel || situacao === "Paga") ? (
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
              {pagoCom && (
                <Campo rotulo="Pago com">{pagoCom}</Campo>
              )}
              <Campo rotulo="Código PIX">{texto(ordem.pix_codigo)}</Campo>
              <Campo rotulo="Pagador">{pagador ?? "—"}</Campo>
              <Campo rotulo="Comprovante de pagamento">
                <LinkArquivo url={urlComprovante} />
              </Campo>
              <div className="col-span-2">
                <Campo rotulo="Autorização">{x.autorizacao.texto}</Campo>
              </div>
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
                Classificação contábil: a despesa (crédito) e a conta de onde o
                dinheiro saiu (débito)
              </CardDescription>
            </div>
            <Tags className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2">
          <CartaoCentroCusto
            titulo="Centro de custo da despesa (crédito)"
            centro={detalhe.centroCustoDespesa}
          />
          <CartaoCentroCusto
            titulo="Centro de custo do débito (de onde saiu)"
            centro={detalhe.centroCustoReceita}
          />
          {rateio.length > 0 && (
            <div className="sm:col-span-2">
              <p className="text-sm font-medium">Rateio entre contas</p>
              <ul className="mt-2 grid gap-1 text-sm">
                {rateio.map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center justify-between gap-2">
                    <span className="min-w-0">
                      {l.centroCustoNome ?? "Sem conta definida"}
                      {l.descricao && (
                        <span className="text-muted-foreground"> — {l.descricao}</span>
                      )}
                    </span>
                    <span className="tabular-nums">{formatarMoeda(l.valor)}</span>
                  </li>
                ))}
              </ul>
              <p className="text-muted-foreground mt-2 text-xs">
                O pagamento é um só; a despesa se divide entre as contas acima (a primeira é a da
                ordem).
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {contratoVinculado && (
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  Contrato vinculado
                  <Badge variant="outline" className="text-muted-foreground">
                    {contratoVinculado.origem === "aluguel"
                      ? "Locação de veículo"
                      : "Contrato"}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {contratoVinculado.origem === "aluguel"
                    ? "Contrato de locação que originou esta ordem"
                    : "Contrato que originou esta ordem de pagamento"}
                </CardDescription>
              </div>
              <FileSignature className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo
                  rotulo={
                    contratoVinculado.origem === "aluguel"
                      ? "Finalidade"
                      : "Objeto"
                  }
                >
                  {contratoVinculado.codigo ? (
                    <span className="text-muted-foreground">
                      {contratoVinculado.codigo} —{" "}
                    </span>
                  ) : null}
                  {contratoVinculado.objeto ?? "(sem descrição)"}
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
                    {contratoVinculado.origem === "aluguel"
                      ? "Finalizado"
                      : "Inativo"}
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

      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Histórico</CardTitle>
              <CardDescription>Tudo o que aconteceu com esta ordem, por quem e quando</CardDescription>
            </div>
            <History className="text-muted-foreground size-4" />
          </div>
        </CardHeader>
        <CardContent>
          {x.eventos.length === 0 ? (
            <p className="text-muted-foreground text-sm">Sem eventos registrados.</p>
          ) : (
            <ol className="grid gap-3">
              {x.eventos.map((e) => (
                <li key={e.id + e.quando} className="border-border border-l-2 pl-3 text-sm">
                  <p>
                    <span className="font-medium">{e.rotulo}</span>
                    {e.usuario && <span className="text-muted-foreground"> — {e.usuario}</span>}
                    <span className="text-muted-foreground text-xs"> · {formatarDataHora(e.quando)}</span>
                  </p>
                  {e.descricao && <p className="text-muted-foreground text-xs">{e.descricao}</p>}
                </li>
              ))}
            </ol>
          )}
          <p className="text-muted-foreground mt-3 text-xs">
            Código de verificação do extrato: <span className="font-mono">{x.codigoVerificacao}</span>
          </p>
        </CardContent>
      </Card>

      {detalhe.projetoVinculado && (
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Projeto vinculado</CardTitle>
                <CardDescription>
                  Projeto ao qual esta ordem de pagamento pertence
                </CardDescription>
              </div>
              <FolderKanban className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <Campo rotulo="Descrição">
                  {detalhe.projetoVinculado.descricao ?? "(sem descrição)"}
                </Campo>
              </div>
              <Campo rotulo="Tipo">
                {detalhe.projetoVinculado.tipo ?? "—"}
              </Campo>
              <Campo rotulo="Período">
                {formatarData(detalhe.projetoVinculado.inicio)} a{" "}
                {formatarData(detalhe.projetoVinculado.termino_previsao)}
              </Campo>
              <Campo rotulo="Situação">
                {detalhe.projetoVinculado.finalizado === true ? (
                  <Badge variant="outline" className="text-muted-foreground">
                    Finalizado
                  </Badge>
                ) : (
                  <Badge
                    variant="outline"
                    className="border-success/40 text-success-fg"
                  >
                    Em andamento
                  </Badge>
                )}
              </Campo>
            </div>
          </CardContent>
        </Card>
      )}
    </>
  )
}
