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
  listarConvidados,
  listarDiretoresParaCusteio,
  listarFinalidades,
  pagoComDoCusteio,
  urlFormalizacaoCusteio,
} from "@/lib/db/custeio"
import { contasAbertasParaCompras } from "@/lib/db/caixa"
import { listarCentrosCusto } from "@/lib/db/financeiro"
import {
  CADENCIAS,
  ROTULO_TIPO_BENEFICIARIO,
} from "@/lib/custeio-constantes"
import { formatarData, formatarDataHora, formatarMoeda } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { SituacaoCusteioBadge } from "../custeio-badges"
import { CusteioForm, type CusteioInicial } from "../custeio-form"
import {
  BotaoAutorizar,
  BotaoCancelar,
  BotaoSubmeter,
  FormReprovar,
} from "./custeio-acoes"
import { ExtraordinarioForm, FormalizacaoForm, ReceberDocumentoCusteioForm } from "./custeio-pagamentos"

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
    extraordinario?: string
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
      {brutos.extraordinario === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Pagamento extraordinário registrado — a ordem passa pela autorização pontual no Financeiro.</AlertDescription>
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
              aoCancelarHref={aqui}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Campo rotulo="Beneficiário" valor={str(c.beneficiario_nome)} />
              <Campo rotulo="CPF" valor={str(c.beneficiario_cpf)} />
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
                  Pagamento extraordinário passa pela autorização pontual.
                </p>
                {podeEditar && <ExtraordinarioForm custeioId={id} boleto={str(c.forma_pagamento) === "Boleto"} />}
              </div>
            )}
            {(situacao === "reprovado" || situacao === "cancelado") && (
              <p className="text-muted-foreground text-sm">
                Custeio {situacao}. Crie um novo se necessário.
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
            <Table>
              <TableHeader>
                <TableRow>
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
          )}
        </CardContent>
      </Card>
    </>
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
