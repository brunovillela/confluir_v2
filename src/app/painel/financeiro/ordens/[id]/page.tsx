import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import {
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
  Undo2,
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
import { listarCentrosCusto, listarCentrosDeDebito, type CentroCusto } from "@/lib/db/financeiro"
import { hojeSP } from "@/lib/db/comum"
import { SITUACOES_ENCERRADAS, SITUACOES_PAGAVEIS } from "@/lib/db/ordens-ciclo"
import { estornosDaOrdem, janelaDeEstorno, obterPrazoEstorno } from "@/lib/db/ordens-estorno"
import { extratoDaOrdem } from "@/lib/db/ordens-extrato"
import type { StatusAuditoria } from "@/lib/db/ordens-auditoria"
import { TIPO_ORDEM_FOLHA } from "@/lib/contracheques-constantes"
import { podeAcessar } from "@/lib/permissoes"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"

import { SituacaoBadge } from "../../situacao-badge"
import { VoltarListaOrdens } from "../lembrar-lista"
import { AcoesOrdem } from "./acoes-ordem"
import { DocumentosForm } from "./documentos-form"
import { EstornoForm } from "./estorno-form"
import { PagamentoForm } from "./pagamento-form"
import { SituacaoForm } from "./situacao-form"

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
    estornada?: string
    documentos?: string
    situacao?: string
  }>
}) {
  const sessao = await requirePermissao("financeiro_pagamento", [
    "financeiro_leitura",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "financeiro_pagamento")

  const { id } = await params
  const {
    editar,
    salvo,
    removido,
    cancelada,
    corrigida,
    reenviada,
    estornada,
    documentos: documentosSalvos,
    situacao: situacaoTrocada,
  } = await searchParams
  const x = await extratoDaOrdem(id)
  if (!x) notFound()
  const detalhe = x.detalhe
  const pagoCom = x.pagoCom
  const { ordem, favorecido, pagador, contratoVinculado } = detalhe
  const situacao = String(ordem.situacao ?? "")

  const pagavel = SITUACOES_PAGAVEIS.includes(situacao)
  const editandoPagamento = editar === "pagamento" && podeEditar && (pagavel || situacao === "Paga")
  const editandoDocumentos = editar === "documentos" && podeEditar && situacao !== "Cancelada"
  const formaBoleto = /boleto/i.test(String(ordem.forma_pagamento ?? ""))
  const temPagamento =
    ordem.data_pagamento !== null ||
    ordem.arquivo_pagamento !== null ||
    situacao === "Paga"
  const aberta = !SITUACOES_ENCERRADAS.includes(situacao)

  // Estorno: pendente trava o reenvio genérico; o botão vale só na ordem paga,
  // dentro do prazo pós-pagamento, para quem tem a permissão.
  const [estornos, prazoEstorno] = await Promise.all([estornosDaOrdem(id), obterPrazoEstorno()])
  const estornoPendente = estornos.find((e) => !e.resolvidoEm) ?? null
  const janelaEstorno = janelaDeEstorno((ordem.data_pagamento as string | null) ?? null, prazoEstorno.dias)
  const podeEstornar =
    prazoEstorno.disponivel &&
    podeAcessar(sessao.permissoes, "financeiro_estorno") &&
    situacao === "Paga" &&
    !ordem.caixa_conta_id &&
    janelaEstorno.aberta

  const urlComprovante = x.arquivos.comprovante
  const urlBoleto = x.arquivos.boleto
  const urlNotaFiscal = x.arquivos.notaFiscal
  const rateio = x.rateio
  const pr = x.procedencia
  const pessoas = [pr.solicitante, ...pr.envolvidos].filter(
    (p): p is NonNullable<typeof p> => Boolean(p)
  )
  // Contrato/minuta/termo do custeio: aparecem no cartão da origem.
  const formalizacao = pr.documentos.filter((d) => d.formalizacao)

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
        <VoltarListaOrdens />
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
          <div className="ml-auto flex flex-wrap gap-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/painel/financeiro/ordens/${id}/extrato?simples=1`}
                target="_blank"
                rel="noopener noreferrer"
                title="Sem as verificações e a auditoria automática"
              >
                <Printer />
                Extrato simplificado
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/painel/financeiro/ordens/${id}/extrato`}
                target="_blank"
                rel="noopener noreferrer"
              >
                <Printer />
                Extrato completo (PDF)
              </a>
            </Button>
          </div>
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
      {estornada === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Estorno registrado — a ordem voltou para &quot;Aguardando informações&quot;
            {estornoPendente?.responsavel ? ` e ${estornoPendente.responsavel} foi avisado no sino` : ""}.
          </AlertDescription>
        </Alert>
      )}
      {estornoPendente && (
        <Alert variant="warning">
          <Undo2 />
          <AlertDescription>
            <p className="font-medium">
              Pagamento estornado em {formatarData(estornoPendente.dataEstorno)}
              {estornoPendente.valor !== null ? ` (${formatarMoeda(estornoPendente.valor)})` : ""}
            </p>
            <p>{estornoPendente.motivo}</p>
            <p className="mt-1">
              {estornoPendente.responsavel
                ? `Aguardando ${estornoPendente.responsavel} conferir os dados bancários ou o boleto e reencaminhar para autorização.`
                : "Aguardando a correção dos dados de pagamento."}{" "}
              <Link href={`/painel/estornos/${estornoPendente.id}`} className="font-medium underline">
                Abrir o estorno
              </Link>
            </p>
          </AlertDescription>
        </Alert>
      )}
      {reenviada === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Ordem reenviada para autorização.</AlertDescription>
        </Alert>
      )}
      {documentosSalvos && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {documentosSalvos === "pagar"
              ? "Documento fiscal recebido — a ordem já estava autorizada e seguiu para pagamento."
              : documentosSalvos === "autorizacao"
                ? "Documento fiscal recebido — a ordem seguiu para autorização."
                : "Documentos salvos — a troca ficou no histórico."}
          </AlertDescription>
        </Alert>
      )}
      {situacaoTrocada === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            Situação alterada — a ordem agora está &quot;{situacao}&quot;.
          </AlertDescription>
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
            {pr.documentos
              .filter((d) => !(d.formalizacao && (contratoVinculado || ordem.custeio_id)))
              .map((d) => (
                <Campo key={d.rotulo} rotulo={d.rotulo}>
                  <LinkArquivo url={d.url} />
                </Campo>
              ))}
          </dl>
          {pr.detalhamento && pr.detalhamento.itens.length > 0 && (
            <div className="rounded-md border">
              <p className="border-b px-3 py-2 text-sm font-medium">{pr.detalhamento.titulo}</p>
              <ul className="divide-border divide-y">
                {pr.detalhamento.itens.map((it, i) => (
                  <li key={i} className="grid gap-1 px-3 py-2 text-sm">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-medium">{it.descricao}</p>
                        {it.detalhe && <p className="text-muted-foreground text-xs">{it.detalhe}</p>}
                      </div>
                      <span className="font-medium tabular-nums">{it.valor}</span>
                    </div>
                    {it.subitens.length > 1 && (
                      <ul className="text-muted-foreground grid gap-0.5 text-xs">
                        {it.subitens.map((sub, j) => (
                          <li key={j} className="flex justify-between gap-2">
                            <span className="min-w-0">{sub.descricao}</span>
                            <span className="tabular-nums">{sub.valor}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                ))}
              </ul>
              <p className="flex justify-between gap-2 border-t px-3 py-2 text-sm font-medium">
                <span>Total</span>
                <span className="tabular-nums">{pr.detalhamento.total}</span>
              </p>
            </div>
          )}
          {podeEditar && aberta && (
            <AcoesOrdem
              ordemId={id}
              situacao={situacao}
              podeCorrigir={situacao !== "Paga"}
              podeCancelar={situacao !== "Paga"}
              podeReenviar={situacao === "Aguardando informações" && !estornoPendente}
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
              {podeEditar && situacao !== "Cancelada" && !editandoDocumentos ? (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/financeiro/ordens/${id}?editar=documentos`}>
                    <Pencil />
                    Documentos
                  </Link>
                </Button>
              ) : (
                <Receipt className="text-muted-foreground size-4" />
              )}
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
                {/boleto/i.test(String(ordem.forma_pagamento ?? "")) || urlBoleto ? (
                  <LinkArquivo url={urlBoleto} />
                ) : (
                  <span className="text-muted-foreground">Não aplicável</span>
                )}
              </Campo>
              {detalhe.compraObservacao && (
                <div className="col-span-2">
                  <Campo rotulo="Observação da compra">
                    {detalhe.compraObservacao}
                  </Campo>
                </div>
              )}
            </dl>
            {editandoDocumentos && (
              <DocumentosForm
                ordemId={id}
                temNota={Boolean(ordem.arquivo_nota_fiscal)}
                temBoleto={Boolean(ordem.arquivo_boleto)}
                pedeBoleto={formaBoleto}
                rotuloNota={ordem.tipo === TIPO_ORDEM_FOLHA ? "Contracheque (comprovante)" : "Nota fiscal"}
              />
            )}
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
                centros={(await listarCentrosDeDebito((ordem.centro_custo_receita_id as string | null) ?? null)).map(
                  (c) => ({
                    id: c.id,
                    rotulo: [c.acesso, c.nome_da_conta ?? "(sem nome)"].filter(Boolean).join(" — "),
                  })
                )}
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
            {podeEditar && (aberta || (situacao === "Paga" && !estornoPendente)) && !editandoPagamento && (
              <SituacaoForm
                ordemId={id}
                situacao={situacao}
                temContrato={Boolean(ordem.contrato_id)}
                autorizada={ordem.autorizacao_esta_autorizado === true || situacao === "A pagar"}
              />
            )}
            {podeEstornar && janelaEstorno.ate && (
              <div className="mt-4">
                <EstornoForm
                  ordemId={id}
                  ate={formatarData(janelaEstorno.ate)}
                  hoje={hojeSP()}
                  dataPagamento={String(ordem.data_pagamento).slice(0, 10)}
                  responsavel={
                    x.eventos.find((e) => e.tipo === "criada" && e.usuario)?.usuario ??
                    pr.solicitante?.nome ??
                    null
                  }
                />
              </div>
            )}
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
              {contratoVinculado.origem === "aluguel" && (
                <Campo rotulo="Documento do contrato">
                  <LinkArquivo url={contratoVinculado.arquivo_contrato} />
                </Campo>
              )}
              {formalizacao.map((d) => (
                <Campo key={d.rotulo} rotulo={d.rotulo}>
                  <LinkArquivo url={d.url} />
                </Campo>
              ))}
            </div>
            {pr.href && (
              <Button variant="outline" size="sm" asChild className="mt-4">
                <Link href={pr.href}>
                  <FileSignature />
                  {contratoVinculado.origem === "aluguel" ? "Abrir o contrato de locação" : "Abrir o contrato"}
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {Boolean(ordem.custeio_id) && (
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Custeio vinculado</CardTitle>
                <CardDescription>Custeio institucional que originou esta ordem e o documento que o formaliza</CardDescription>
              </div>
              <FileSignature className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2">
              <Campo rotulo="Custeio">{pr.titulo ?? "—"}</Campo>
              {formalizacao.map((d) => (
                <Campo key={d.rotulo} rotulo={d.rotulo}>
                  {d.url ? <LinkArquivo url={d.url} /> : <span className="text-muted-foreground">Não anexada</span>}
                </Campo>
              ))}
            </div>
            {pr.href && (
              <Button variant="outline" size="sm" asChild className="mt-4">
                <Link href={pr.href}>
                  <FileSignature />
                  Abrir o custeio
                </Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {estornos.length > 0 && (
        <Card className="min-w-0">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">Estornos</CardTitle>
                <CardDescription>Pagamentos devolvidos pelo banco e a correção dos dados</CardDescription>
              </div>
              <Undo2 className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <CardContent>
            <ul className="divide-border grid divide-y">
              {estornos.map((e) => (
                <li key={e.id} className="flex flex-wrap items-start justify-between gap-2 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">
                      {formatarData(e.dataEstorno)}
                      {e.valor !== null ? ` · ${formatarMoeda(e.valor)}` : ""}
                      {e.registradoPor ? ` · registrado por ${e.registradoPor}` : ""}
                    </p>
                    <p className="text-muted-foreground">{e.motivo}</p>
                    {e.resolvidoEm && (
                      <p className="text-muted-foreground text-xs">
                        Resolvido em {formatarDataHora(e.resolvidoEm)}
                        {e.resolvidoPor ? ` por ${e.resolvidoPor}` : ""}
                        {e.resolucao ? `: ${e.resolucao}` : ""}
                      </p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge
                      variant="outline"
                      className={e.resolvidoEm ? "border-success/40 text-success-fg" : "border-warning/50 text-warning-fg"}
                    >
                      {e.resolvidoEm ? "Resolvido" : "Pendente"}
                    </Badge>
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`/painel/estornos/${e.id}`}>Abrir</Link>
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
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

      {/* Verificação e auditoria fecham a página, lado a lado: são conferências
          sobre o conteúdo acima, não o conteúdo em si. */}
      <div className="grid items-start gap-4 lg:grid-cols-2">
        {x.verificacoes.length > 0 && (
          <Card className="min-w-0">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    Verificações na criação
                    {x.verificacoes.some((v) => v.status === "alerta") ? (
                      <Badge variant="outline" className={ESTILO_STATUS.alerta.classe}>
                        {x.verificacoes.filter((v) => v.status === "alerta").length} alerta(s)
                      </Badge>
                    ) : (
                      <Badge variant="outline" className={ESTILO_STATUS.ok.classe}>Sem alertas</Badge>
                    )}
                  </CardTitle>
                  <CardDescription>
                    Regras de auditoria do Financeiro conferidas quando a ordem foi criada,
                    em {formatarDataHora(x.verificacoes[0].quando)}
                  </CardDescription>
                </div>
                <ShieldCheck className="text-muted-foreground size-4" />
              </div>
            </CardHeader>
            <CardContent>
              <ul className="divide-border grid divide-y">
                {x.verificacoes.map((v) => (
                  <li key={v.codigo} className="flex items-start gap-3 py-2">
                    <Badge variant="outline" className={`w-20 shrink-0 justify-center ${ESTILO_STATUS[v.status === "alerta" ? "alerta" : v.status === "ok" ? "ok" : "na"].classe}`}>
                      {v.status === "alerta" ? "Alerta" : v.status === "ok" ? "OK" : "N/A"}
                    </Badge>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">{v.titulo}</p>
                      {v.detalhe && <p className="text-muted-foreground text-xs">{v.detalhe}</p>}
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        )}

        <Card className={x.verificacoes.length > 0 ? "min-w-0" : "min-w-0 lg:col-span-2"}>
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
                  Verificações feitas na hora — saem no extrato completo em PDF, não no simplificado.
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
      </div>
    </>
  )
}
