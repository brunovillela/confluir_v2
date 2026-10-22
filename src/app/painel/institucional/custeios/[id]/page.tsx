import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil } from "lucide-react"

import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
import { Alert, AlertDescription } from "@/components/ui/alert"
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
import {
  detalheCusteio,
  listarAssessoriasParaCusteio,
  listarConvidados,
  listarDiretoresParaCusteio,
  listarFinalidades,
  MEIO_CONTA_DO_CUSTEIO,
  MEIO_PIX_DO_CUSTEIO,
  pagoComDoCusteio,
  urlFormalizacaoCusteio,
} from "@/lib/db/custeio"
import { contasAbertasParaCompras } from "@/lib/db/caixa"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import { SITUACOES_ENCERRADAS, SITUACOES_NAO_AUTORIZADAS } from "@/lib/db/ordens-ciclo"
import { hojeLocalISO } from "@/lib/compras-constantes"
import {
  CADENCIAS,
  ROTULO_TIPO_BENEFICIARIO,
  vencimentoParcela,
} from "@/lib/custeio-constantes"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import {
  ExclusaoOrdensBarra,
  MarcarTodasOrdens,
} from "@/app/painel/compras/contratos/[id]/ordens-contrato"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoCusteioBadge } from "../custeio-badges"
import { CusteioForm, type CusteioInicial } from "../custeio-form"
import {
  BotaoAutorizar,
  BotaoCancelar,
  BotaoReabrir,
  BotaoSubmeter,
  FormReprovar,
} from "./custeio-acoes"
import { excluirOrdensCusteioAction } from "../actions"
import {
  FormalizacaoForm,
  GerarOrdensCusteioForm,
  ReceberDocumentoCusteioForm,
  type PadraoPagamentoCusteio,
} from "./custeio-pagamentos"

export const metadata: Metadata = { title: "Custeio — Confluir" }

function str(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

export default async function CusteioPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    salvo?: string
    submetido?: string
    reprovado?: string
    cancelado?: string
    editar?: string
    geradas?: string
    puladas?: string
    formalizacao?: string
    novas?: string
  }>
}) {
  const sessao = await requirePermissao("custeio_institucional", [
    "custeio_institucional_edicao",
    "custeio_institucional_autorizacao",
  ])
  const podeEditar = podeAcessar(
    sessao.permissoes,
    "custeio_institucional_edicao"
  )
  const podeAutorizar = podeAcessar(
    sessao.permissoes,
    "custeio_institucional_autorizacao"
  )

  const { id } = await params
  const brutos = await searchParams

  const detalhe = await detalheCusteio(id)
  if (!detalhe) notFound()
  const c = detalhe.custeio

  const situacao = String(c.situacao)
  const aqui = `/painel/institucional/custeios/${id}`
  const editando =
    brutos.editar === "1" && podeEditar && situacao === "rascunho"

  const opcoes = editando
    ? await Promise.all([
        listarFinalidades(),
        listarCentrosCusto(),
        listarDiretoresParaCusteio(),
        listarConvidados(),
        contasAbertasParaCompras(),
        listarAssessoriasParaCusteio(),
      ])
    : null
  const urlFormalizacao = await urlFormalizacaoCusteio(str(c.arquivo_formalizacao))
  const pagoCom = await pagoComDoCusteio(id, str(c.forma_pagamento))

  const inicial: CusteioInicial | undefined = editando
    ? {
        id,
        finalidade_id: str(c.finalidade_id),
        tipo_beneficiario: String(c.tipo_beneficiario),
        diretoria_integrante_id: str(c.diretoria_integrante_id),
        filiacao_id: str(c.filiacao_id),
        convidado_id: str(c.convidado_id),
        fornecedor_id: str(c.fornecedor_id),
        beneficiario_nome: str(c.beneficiario_nome),
        descricao: str(c.descricao),
        evento: str(c.evento),
        centro_custo_despesa_id: str(c.centro_custo_despesa_id),
        cadencia: String(c.cadencia),
        valor_parcela:
          typeof c.valor_parcela === "number" ? c.valor_parcela : null,
        num_parcelas: typeof c.num_parcelas === "number" ? c.num_parcelas : 1,
        periodicidade: str(c.periodicidade),
        primeiro_vencimento: str(c.primeiro_vencimento),
        forma_pagamento: str(c.forma_pagamento),
        temBoleto: Boolean(str(c.arquivo_boleto)),
        temFormalizacao: Boolean(str(c.arquivo_formalizacao)),
      }
    : undefined

  const ordensAbertas = detalhe.ordens.filter(
    (o) => !SITUACOES_ENCERRADAS.includes(String(o.situacao))
  ).length
  const ordensCanceladas = detalhe.ordens.filter(
    (o) => o.situacao === "Cancelada"
  ).length

  // Novas ordens (custeio autorizado): forma do custeio já preenchida, 1º
  // vencimento sugerido no período seguinte à última ordem.
  const gerar = !editando && podeEditar && situacao === "autorizado"
  const caixas = gerar ? await contasAbertasParaCompras() : []
  const ultimoVenc = detalhe.ordens
    .map((o) => (o.vencimento ?? "").slice(0, 10))
    .filter((v) => /^\d{4}-\d{2}-\d{2}$/.test(v))
    .sort()
    .at(-1)
  const primeiroSugerido = ultimoVenc
    ? vencimentoParcela(ultimoVenc, "mensal", 1)
    : hojeLocalISO()
  const padraoPagamento: PadraoPagamentoCusteio = {
    forma: str(c.forma_pagamento),
    escolha:
      c.forma_pagamento === "Pix" && str(c.pix)
        ? MEIO_PIX_DO_CUSTEIO
        : c.forma_pagamento === "Depósito bancário (TED)" && str(c.conta)
          ? MEIO_CONTA_DO_CUSTEIO
          : undefined,
    caixaContaId: str(c.caixa_conta_id) ?? undefined,
    pixCodigo: str(c.pix_codigo) ?? undefined,
  }
  // Resumo e exclusão em massa, como no contrato.
  const vivas = detalhe.ordens.filter((o) => o.situacao !== "Cancelada")
  const previsto = vivas.reduce((s, o) => s + (o.valor_inicial_cobranca ?? o.valor_pago ?? 0), 0)
  const pago = vivas.reduce((s, o) => s + (o.valor_pago ?? 0), 0)
  const resumo = { previsto, pago, aberto: Math.max(0, previsto - pago) }
  const FORM_EXCLUSAO = "excluir-ordens-custeio"
  const excluivel = (o: (typeof detalhe.ordens)[number]) =>
    podeEditar && SITUACOES_NAO_AUTORIZADAS.includes(o.situacao ?? "")
  const temExcluivel = detalhe.ordens.some(excluivel)

  const cadenciaRotulo =
    CADENCIAS.find((x) => x.chave === c.cadencia)?.rotulo ?? String(c.cadencia)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/custeios">
            <ArrowLeft />
            Custeio institucional
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
              {str(c.codigo) ?? "(sem código)"}
            </h1>
            <SituacaoCusteioBadge situacao={situacao} />
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {str(c.beneficiario_nome) ?? "Sem beneficiário"}
          {" · "}
          {ROTULO_TIPO_BENEFICIARIO[String(c.tipo_beneficiario)] ??
            String(c.tipo_beneficiario)}
          {detalhe.finalidade && <> · {detalhe.finalidade.nome}</>}
        </p>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Custeio salvo.</AlertDescription>
        </Alert>
      )}
      {brutos.submetido === "1" && (
        <Alert className="border-info/40 text-info-fg">
          <AlertDescription>
            Enviado para autorização.
          </AlertDescription>
        </Alert>
      )}
      {brutos.reprovado === "1" && (
        <Alert variant="warning">
          <AlertDescription>Custeio reprovado.</AlertDescription>
        </Alert>
      )}
      {brutos.cancelado === "1" && (
        <Alert variant="warning">
          <AlertDescription>Custeio cancelado.</AlertDescription>
        </Alert>
      )}
      {brutos.geradas !== undefined && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {Number(brutos.geradas) > 0
              ? c.cadencia === "recorrente"
                ? `Autorizado — ${brutos.geradas} parcela(s) gerada(s), já autorizadas: cada uma espera só o documento fiscal para seguir para pagamento.`
                : `Autorizado — a ordem do pagamento único foi gerada e passa pela autorização pontual no Financeiro.`
              : "Autorizado. Nenhuma ordem nova gerada."}
            {Number(brutos.puladas) > 0 &&
              ` ${brutos.puladas} vencimento(s) já tinham ordem e foram pulados.`}
          </AlertDescription>
        </Alert>
      )}
      {brutos.formalizacao === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Formalização anexada — ela aparece nas ordens deste custeio e no extrato.</AlertDescription>
        </Alert>
      )}
      {brutos.formalizacao === "erro" && (
        <Alert variant="warning">
          <AlertDescription>O custeio foi salvo, mas a formalização não subiu — anexe de novo no cartão abaixo.</AlertDescription>
        </Alert>
      )}
      {brutos.novas !== undefined && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {Number(brutos.novas) > 0
              ? `${brutos.novas} nova(s) ordem(ns) gerada(s) — veja a situação de cada uma na lista abaixo.`
              : "Nenhuma ordem nova gerada."}
            {Number(brutos.puladas) > 0 &&
              ` ${brutos.puladas} vencimento(s) já tinham ordem e foram pulados.`}
          </AlertDescription>
        </Alert>
      )}
      {situacao === "cancelado" && str(c.cancelamento_motivo) && (
        <Alert variant="warning">
          <AlertDescription>
            Cancelado
            {detalhe.canceladoPor && <> por {detalhe.canceladoPor}</>}
            {str(c.cancelado_em) && <> em {formatarDataHora(str(c.cancelado_em))}</>}
            : {str(c.cancelamento_motivo)}
          </AlertDescription>
        </Alert>
      )}
      {situacao === "autorizado" && ordensCanceladas > 0 && (
        <Alert variant="warning">
          <AlertDescription>
            {ordensCanceladas} de {detalhe.ordens.length} ordem(ns) deste custeio
            {ordensCanceladas === 1 ? " foi cancelada" : " foram canceladas"} no
            Financeiro. Veja o motivo na lista de ordens abaixo.
          </AlertDescription>
        </Alert>
      )}
      {situacao === "rascunho" && str(c.motivo_reprovacao) && (
        <Alert variant="warning">
          <AlertDescription>
            Reaberto depois de reprovado. Motivo da reprovação: {str(c.motivo_reprovacao)}
          </AlertDescription>
        </Alert>
      )}
      {situacao === "reprovado" && str(c.motivo_reprovacao) && (
        <Alert variant="warning">
          <AlertDescription>
            Motivo da reprovação: {str(c.motivo_reprovacao)}
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados do custeio</CardTitle>
            {!editando && podeEditar && situacao === "rascunho" && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`${aqui}?editar=1`}>
                  <Pencil />
                  Editar
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {editando && opcoes && inicial ? (
            <CusteioForm
              custeio={inicial}
              finalidades={opcoes[0].map((f) => ({
                id: f.id,
                nome: f.nome,
                tipo_beneficiario_sugerido: f.tipo_beneficiario_sugerido,
              }))}
              centrosCusto={opcoes[1].map((cc) => ({
                id: cc.id,
                nome: [cc.acesso, cc.nome_da_conta].filter(Boolean).join(" — "),
              }))}
              diretores={opcoes[2].map((d) => ({
                id: d.id,
                nome: d.nome,
                detalhe: d.detalhe,
              }))}
              convidados={opcoes[3].map((cv) => ({ id: cv.id, nome: cv.nome }))}
              caixas={opcoes[4]}
              fornecedores={opcoes[5]}
              aoCancelarHref={aqui}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Beneficiário" valor={str(c.beneficiario_nome)} />
              <Campo rotulo={c.tipo_beneficiario === "assessoria" ? "CNPJ/CPF" : "CPF"} valor={str(c.beneficiario_cpf)} />
              <Campo
                rotulo="Finalidade"
                valor={detalhe.finalidade?.nome ?? null}
              />
              <Campo
                rotulo="Valor da parcela"
                valor={formatarMoeda(
                  typeof c.valor_parcela === "number" ? c.valor_parcela : 0
                )}
              />
              <Campo
                rotulo="Cadência"
                valor={
                  c.cadencia === "recorrente"
                    ? `${cadenciaRotulo} · ${c.num_parcelas}× ${str(c.periodicidade) ?? ""}`
                    : cadenciaRotulo
                }
              />
              <Campo
                rotulo={
                  c.cadencia === "recorrente" ? "1º vencimento" : "Vencimento"
                }
                valor={
                  str(c.primeiro_vencimento)
                    ? formatarData(str(c.primeiro_vencimento))
                    : "—"
                }
              />
              <Campo
                rotulo="Centro de custo"
                valor={detalhe.centroCusto?.nome_da_conta ?? null}
              />
              <Campo rotulo="Forma de pagamento" valor={str(c.forma_pagamento)} />
              {pagoCom && <Campo rotulo="Para onde" valor={pagoCom} />}
              <Campo rotulo="Evento" valor={str(c.evento)} />
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Descrição</dt>
                <dd className="mt-0.5 text-sm">{str(c.descricao) ?? "—"}</dd>
              </div>
              <Campo rotulo="Criado por" valor={detalhe.criadoPor} />
              <Campo rotulo="Autorizado por" valor={detalhe.autorizador} />
              <Campo
                rotulo="Autorizado em"
                valor={
                  str(c.autorizado_em)
                    ? formatarDataHora(str(c.autorizado_em))
                    : "—"
                }
              />
            </dl>
          )}
        </CardContent>
      </Card>

      {!editando && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Autorização</CardTitle>
            <CardDescription>
              Portão interno antes da alçada do Financeiro
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-start gap-3">
            {situacao === "rascunho" && podeEditar && (
              <>
                <BotaoSubmeter custeioId={id} />
                <BotaoCancelar custeioId={id} />
              </>
            )}
            {situacao === "aguardando_autorizacao" && (
              <>
                {podeAutorizar ? (
                  <>
                    <BotaoAutorizar custeioId={id} />
                    <FormReprovar custeioId={id} />
                  </>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Aguardando autorização de quem tem a permissão de autorizar.
                  </p>
                )}
                {podeEditar && <BotaoCancelar custeioId={id} />}
              </>
            )}
            {situacao === "autorizado" && (
              <div className="grid gap-3">
                <p className="text-success-fg text-sm">
                  Autorizado —{" "}
                  {c.cadencia === "recorrente"
                    ? "as parcelas nasceram autorizadas e esperam só o documento fiscal."
                    : "a ordem está no Financeiro."}{" "}
                  Precisa de mais pagamentos? Use “Gerar ordens de pagamento”, abaixo.
                </p>
                {podeEditar && podeAutorizar && (
                  <div>
                    <BotaoCancelar custeioId={id} ordensAbertas={ordensAbertas} />
                  </div>
                )}
              </div>
            )}
            {situacao === "reprovado" && (
              <div className="grid gap-3">
                <p className="text-muted-foreground text-sm">
                  Custeio reprovado. Reabra para corrigir e submeter de novo.
                </p>
                {podeEditar && (
                  <div>
                    <BotaoReabrir custeioId={id} />
                  </div>
                )}
              </div>
            )}
            {situacao === "cancelado" && (
              <p className="text-muted-foreground text-sm">
                Custeio cancelado. Crie um novo se necessário.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {!editando && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Formalização</CardTitle>
            <CardDescription>
              Convite, ofício, ata ou termo que justifica o custeio — segue com as ordens e no extrato
            </CardDescription>
          </CardHeader>
          <CardContent>
            {podeEditar ? (
              <FormalizacaoForm custeioId={id} url={urlFormalizacao} />
            ) : urlFormalizacao ? (
              <a href={urlFormalizacao} target="_blank" rel="noopener noreferrer" className="text-primary text-sm hover:underline">
                Abrir a formalização
              </a>
            ) : (
              <p className="text-muted-foreground text-sm">Nenhum documento anexado.</p>
            )}
          </CardContent>
        </Card>
      )}

      {gerar && (
        <GrupoColapsavel
          titulo="Gerar ordens de pagamento"
          descricao="Novas ordens do custeio autorizado (mensal, anual ou única)"
        >
          <GerarOrdensCusteioForm
            custeioId={id}
            valorPadrao={typeof c.valor_parcela === "number" ? c.valor_parcela : null}
            primeiroSugerido={primeiroSugerido}
            caixas={caixas}
            padrao={padraoPagamento}
            podeAutorizar={podeAutorizar}
          />
        </GrupoColapsavel>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordens de pagamento</CardTitle>
          <CardDescription>
            {detalhe.ordens.length > 0
              ? `${detalhe.ordens.length} ordem(ns) deste custeio`
              : "Geradas na autorização: as recorrentes já autorizadas, esperando o documento fiscal."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {detalhe.ordens.length === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhuma ordem gerada ainda.
            </p>
          ) : (
            <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <ResumoOrdens rotulo="Previsto" valor={resumo.previsto} />
              <ResumoOrdens rotulo="Pago" valor={resumo.pago} className="text-success-fg" />
              <ResumoOrdens rotulo="Em aberto" valor={resumo.aberto} className="text-warning-fg" />
            </div>
            {temExcluivel && (
              <div className="mb-3">
                <ExclusaoOrdensBarra
                  formId={FORM_EXCLUSAO}
                  contratoId={id}
                  acaoExcluir={excluirOrdensCusteioAction}
                  campoOrigem="custeio_id"
                  origemRotulo="custeio"
                />
              </div>
            )}
            <Table>
              <TableHeader>
                <TableRow>
                  {temExcluivel && (
                    <TableHead className="w-8">
                      <MarcarTodasOrdens formId={FORM_EXCLUSAO} />
                    </TableHead>
                  )}
                  <TableHead>Código</TableHead>
                  <TableHead>Descrição</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detalhe.ordens.map((o) => (
                  <TableRow key={o.id}>
                    {temExcluivel && (
                      <TableCell>
                        {excluivel(o) && (
                          <input
                            type="checkbox"
                            name="ordem_ids"
                            value={o.id}
                            form={FORM_EXCLUSAO}
                            aria-label={`Marcar a ordem ${o.codigo ?? ""} para excluir`}
                            className="size-4 align-middle"
                          />
                        )}
                      </TableCell>
                    )}
                    <TableCell>
                      <Link
                        href={`/painel/financeiro/ordens/${o.id}`}
                        className="text-primary whitespace-nowrap tabular-nums hover:underline"
                      >
                        {o.codigo ?? "(sem código)"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-96">
                      <span className="line-clamp-2">{o.descricao ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(o.valor_inicial_cobranca)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(o.vencimento)}
                    </TableCell>
                    <TableCell>
                      <SituacaoBadge situacao={o.situacao} />
                      {o.situacao === "Cancelada" && o.cancelamento_motivo && (
                        <p className="text-muted-foreground mt-1 max-w-64 text-xs">
                          {o.cancelamento_motivo}
                        </p>
                      )}
                      {podeEditar && o.situacao === "Aguardando documento fiscal" && (
                        <div className="mt-2">
                          <ReceberDocumentoCusteioForm custeioId={id} ordemId={o.id} valor={o.valor_inicial_cobranca} />
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function ResumoOrdens({
  rotulo,
  valor,
  className,
}: {
  rotulo: string
  valor: number
  className?: string
}) {
  return (
    <div className="border-border rounded-md border p-3">
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className={`mt-0.5 text-lg font-semibold tabular-nums ${className ?? ""}`}>
        {formatarMoeda(valor)}
      </p>
    </div>
  )
}

function Campo({ rotulo, valor }: { rotulo: string; valor: string | null }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs">{rotulo}</dt>
      <dd className="mt-0.5 text-sm">{valor ?? "—"}</dd>
    </div>
  )
}
