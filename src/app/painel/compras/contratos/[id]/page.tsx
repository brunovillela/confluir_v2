import { contasAbertasParaCompras } from "@/lib/db/caixa"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FilePen, FileText, LinkIcon, Pencil, Plus, ReceiptText } from "lucide-react"

import {
  TiposContratoBadges,
  VigenciaContratoBadge,
} from "@/components/compras"
import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  buscarContrato,
  carregarOpcoesContrato,
  type ContratoLista,
} from "@/lib/db/contratos"
import { hojeLocalISO } from "@/lib/compras-constantes"
import { contratoDoRpa, listarRpas } from "@/lib/db/compras-rpa"
import { listarMinutas } from "@/lib/db/contratos-minutas"
import {
  SITUACAO_AGUARDANDO_DOCUMENTO,
  SITUACOES_NAO_AUTORIZADAS,
} from "@/lib/db/ordens-ciclo"
import { TIPO_ORDEM_RPA } from "@/lib/rpa-calculo"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

import { BotaoExcluirContrato, ContratoForm } from "../contrato-forms"
import { GerarOrdensForm } from "../gerar-ordens-form"
import {
  ExclusaoOrdensBarra,
  MarcarTodasOrdens,
  ReceberDocumentoForm,
} from "./ordens-contrato"

export const metadata: Metadata = { title: "Contrato — Confluir" }

function ListaAditivos({ aditivos }: { aditivos: ContratoLista[] }) {
  return (
    <ul className="grid gap-2">
      {aditivos.map((a) => (
        <li
          key={a.id}
          className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
        >
          <div className="min-w-0">
            <Link
              href={`/painel/compras/contratos/${a.id}`}
              className="text-primary font-medium tabular-nums hover:underline"
            >
              {a.codigo ?? "(sem código)"}
            </Link>
            {a.objeto && (
              <span className="text-muted-foreground"> — {a.objeto}</span>
            )}
            <p className="text-muted-foreground mt-0.5 text-xs">
              Vigência {formatarData(a.vigencia_inicio)} –{" "}
              {a.vigencia_termino ? formatarData(a.vigencia_termino) : "sem termo"}
            </p>
          </div>
          <VigenciaContratoBadge vigencia={a.vigencia} />
        </li>
      ))}
    </ul>
  )
}

export default async function ContratoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    salvo?: string
    editar?: string
    geradas?: string
    puladas?: string
    rpaExcluido?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  const sessao = await requirePermissao("aquisicoes_contratos", [
    "aquisicoes_contratos_edicao",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")

  const { id } = await params
  const brutos = await searchParams

  const detalhe = await buscarContrato(id, podeEditar)
  // Ajudas institucionais vivem no módulo Institucional, não em Aquisição.
  if (!detalhe || detalhe.contrato.apoio_institucional) notFound()
  const { contrato: c } = detalhe

  const editando = brutos.editar === "1" && podeEditar
  const aqui = `/painel/compras/contratos/${c.id}`

  const opcoes = editando ? await carregarOpcoesContrato() : null
  // Minutas ficam com quem edita contratos (podem citar dados de categoria sigilosa).
  const minutas = podeEditar ? (await listarMinutas({ contratoId: c.id })).minutas : []
  // O RPA é a forma de pagamento do contrato com autônomo (fornecedor pessoa física).
  const [{ ativo: rpaAtivo, linhas: rpas }, paraRpa] = await Promise.all([
    listarRpas({ contratoId: c.id }),
    contratoDoRpa(c.id),
  ])
  const aceitaRpa = Boolean(paraRpa?.fornecedorId && !paraRpa.fornecedorPessoaJuridica)
  const mostrarRpa = aceitaRpa || rpas.length > 0

  const paginacao = lerPaginacao(brutos, 10)
  const pagOrdens = paginar(detalhe.ordens, paginacao)
  // Parcelas recorrentes que esperam a nota da competência (ficam no contrato).
  const aguardandoDocumento = detalhe.ordens
    .filter((o) => o.situacao === SITUACAO_AGUARDANDO_DOCUMENTO)
    .sort((a, b) => (a.vencimento ?? "").localeCompare(b.vencimento ?? ""))
  // Exclusão em massa: só o que ainda não foi autorizado e é do próprio
  // contrato (RPA e compra têm dono próprio).
  const excluivel = (o: (typeof detalhe.ordens)[number]) =>
    podeEditar &&
    SITUACOES_NAO_AUTORIZADAS.includes(o.situacao ?? "") &&
    o.tipo !== TIPO_ORDEM_RPA &&
    !o.processo_compra_id &&
    !o.data_pagamento
  const temExcluivel = pagOrdens.linhas.some(excluivel)
  const FORM_EXCLUSAO = "excluir-ordens-contrato"
  const totalOrdens = detalhe.ordens.reduce((s, o) => s + (o.valor ?? 0), 0)

  // Contas de caixa abertas: opção da forma "Dinheiro" ao gerar ordens.
  const caixas = podeEditar ? await contasAbertasParaCompras() : []

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos">
            <ArrowLeft />
            Contratos
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight tabular-nums">
              {c.codigo ?? "(sem código)"}
            </h1>
            <VigenciaContratoBadge vigencia={c.vigencia} />
            <TiposContratoBadges
              aditivo={c.aditivo}
              sob_demanda={c.sob_demanda}
              apoio_institucional={c.apoio_institucional}
            />
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <BotaoExcluirContrato contratoId={c.id} />
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {detalhe.fornecedorNome ?? "Sem fornecedor"}
          {c.created_at && <> · cadastrado em {formatarData(c.created_at)}</>}
        </p>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Alteração salva.</AlertDescription>
        </Alert>
      )}

      {brutos.geradas !== undefined && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>
            {Number(brutos.geradas) > 0
              ? `${brutos.geradas} ordem(ns) gerada(s) — Em autorização.`
              : "Nenhuma ordem nova gerada."}
            {Number(brutos.puladas) > 0 &&
              ` ${brutos.puladas} vencimento(s) já tinham ordem e foram pulados.`}
          </AlertDescription>
        </Alert>
      )}

      {brutos.rpaExcluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>RPA excluído, junto com a ordem de pagamento dele.</AlertDescription>
        </Alert>
      )}

      {detalhe.aditivoOrfao && (
        <Alert variant="warning">
          <AlertDescription>
            Marcado como aditivo, mas sem contrato principal vinculado — vínculo
            não migrou do Bubble. Trata-se como contrato comum até a re-ligação
            na virada.
          </AlertDescription>
        </Alert>
      )}

      {detalhe.principal && (
        <Alert className="border-info/40 text-info-fg">
          <AlertDescription className="flex items-center gap-1.5">
            <LinkIcon className="size-3.5" />
            Aditivo do contrato{" "}
            <Link
              href={`/painel/compras/contratos/${detalhe.principal.id}`}
              className="font-medium tabular-nums underline"
            >
              {detalhe.principal.codigo ?? "(sem código)"}
            </Link>
            {detalhe.principal.objeto && ` — ${detalhe.principal.objeto}`}.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados do contrato</CardTitle>
            {!editando && podeEditar && (
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
          {editando && opcoes ? (
            <ContratoForm
              contrato={c}
              fornecedores={opcoes.fornecedores}
              departamentos={opcoes.departamentos}
              centrosCusto={opcoes.centrosCusto}
              usuarios={opcoes.usuarios}
              categorias={opcoes.categorias}
              aoCancelarHref={aqui}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Objeto</dt>
                <dd className="mt-0.5 text-sm">{c.objeto ?? "—"}</dd>
              </div>
              <Campo rotulo="Fornecedor" valor={detalhe.fornecedorNome} />
              <Campo rotulo="Valor" valor={formatarMoeda(c.valor)} />
              <Campo
                rotulo="Vigência"
                valor={`${formatarData(c.vigencia_inicio)} – ${
                  c.vigencia_termino ? formatarData(c.vigencia_termino) : "sem termo"
                }`}
              />
              <Campo rotulo="Departamento" valor={detalhe.departamentoNome} />
              <Campo rotulo="Centro de custo" valor={detalhe.centroCustoNome} />
              <Campo rotulo="Responsável" valor={detalhe.responsavelNome} />
              <div>
                <dt className="text-muted-foreground text-xs">Categoria</dt>
                <dd className="mt-0.5 flex items-center gap-2 text-sm">
                  {detalhe.categoriaNome ?? "—"}
                  {detalhe.categoriaSigiloso && (
                    <Badge
                      variant="outline"
                      className="border-warning/40 text-warning-fg"
                    >
                      Sigilosa
                    </Badge>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Arquivo</dt>
                <dd className="mt-0.5 text-sm">
                  {detalhe.arquivoUrl ? (
                    <Button variant="ghost" size="sm" asChild className="-ml-2">
                      <a
                        href={detalhe.arquivoUrl}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <FileText />
                        Abrir PDF
                      </a>
                    </Button>
                  ) : (
                    "—"
                  )}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      {podeEditar && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">Minuta — o instrumento do contrato</CardTitle>
                <CardDescription>
                  O texto do contrato, redigido com a IA, revisado e assinado pelas partes
                </CardDescription>
              </div>
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/compras/contratos/minutas/nova?contrato=${c.id}`}>
                  <FilePen />
                  Redigir minuta
                </Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {minutas.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhuma minuta ainda. <strong>Redigir minuta</strong> já traz o objeto, o valor, a
                vigência e o fornecedor deste contrato.
              </p>
            ) : (
              <ul className="grid gap-1.5 text-sm">
                {minutas.map((m) => (
                  <li key={m.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/painel/compras/contratos/minutas/${m.id}`} className="font-medium hover:underline">
                      {m.titulo ?? m.tipo ?? "Minuta"}
                    </Link>
                    <span className="text-muted-foreground text-xs">
                      {m.finalizada ? "finalizada" : `rascunho · v${m.versao}`}
                      {m.pendencias > 0 ? ` · ${m.pendencias} a preencher` : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      {mostrarRpa && (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <CardTitle className="text-base">RPA — pagamento a autônomo</CardTitle>
                <CardDescription>
                  Recibos do prestador deste contrato; cada um gera a ordem de pagamento do líquido
                </CardDescription>
              </div>
              {podeEditar && aceitaRpa && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/painel/compras/contratos/rpa/novo?contrato=${c.id}`}>
                    <ReceiptText />
                    Emitir RPA
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {!rpaAtivo ? (
              <p className="text-warning-fg text-sm">
                Rode supabase/contratos-rpa.sql para ligar os RPAs aos contratos.
              </p>
            ) : rpas.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum RPA emitido para este contrato.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Nº</TableHead>
                    <TableHead>Serviço em</TableHead>
                    <TableHead className="text-right">Bruto</TableHead>
                    <TableHead className="text-right">Líquido</TableHead>
                    <TableHead>Ordem</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rpas.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="tabular-nums">
                        <Link
                          href={`/painel/compras/contratos/rpa/${r.id}`}
                          className="text-primary font-medium hover:underline"
                        >
                          {r.numero ?? "—"}
                        </Link>
                      </TableCell>
                      <TableCell className="whitespace-nowrap">
                        {r.data_servico ? formatarData(r.data_servico) : "—"}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_bruto)}
                      </TableCell>
                      <TableCell className="text-right whitespace-nowrap tabular-nums">
                        {formatarMoeda(r.valor_liquido)}
                      </TableCell>
                      <TableCell>
                        {r.ordemId ? <SituacaoBadge situacao={r.ordemSituacao} /> : "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Aditivos</CardTitle>
              <CardDescription>
                {detalhe.aditivos.length} aditivo(s) vinculado(s)
              </CardDescription>
            </div>
            {podeEditar && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/painel/compras/contratos/novo?principal=${c.id}`}>
                  <Plus />
                  Adicionar aditivo
                </Link>
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {detalhe.aditivos.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum aditivo vinculado a este contrato.
            </p>
          ) : (
            <ListaAditivos aditivos={detalhe.aditivos} />
          )}
        </CardContent>
      </Card>

      {podeEditar && (
        <GrupoColapsavel
          titulo="Gerar ordens de pagamento"
          descricao="Cria ordens a partir do contrato (mensal, anual ou única)"
        >
          <GerarOrdensForm
            contratoId={c.id}
            valorPadrao={c.valor}
            vigenciaInicio={c.vigencia_inicio}
            vigenciaTermino={c.vigencia_termino}
            hoje={hojeLocalISO()}
            temFornecedor={Boolean(c.fornecedor_id)}
            fornecedorId={c.fornecedor_id}
            caixas={caixas}
          />
        </GrupoColapsavel>
      )}

      {aguardandoDocumento.length > 0 && (
        <Card className="border-warning/40">
          <CardHeader>
            <CardTitle className="text-base">
              Aguardando documento fiscal
              <span className="text-muted-foreground ml-2 text-sm font-normal">
                {aguardandoDocumento.length}
              </span>
            </CardTitle>
            <CardDescription>
              Parcelas recorrentes ficam aqui, no contrato, até a nota da competência chegar.
              Com a nota, seguem para autorização — ou direto para pagamento, quando são a parcela
              fixa do contrato. Se a nota veio com outro valor, corrija antes de enviar.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Parcela</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  {podeEditar && <TableHead>Nota fiscal</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {aguardandoDocumento.map((o) => (
                  <TableRow key={o.id}>
                    <TableCell className="whitespace-nowrap">{formatarData(o.vencimento)}</TableCell>
                    <TableCell className="max-w-72">
                      <Link
                        href={`/painel/financeiro/ordens/${o.id}`}
                        className="text-primary tabular-nums hover:underline"
                      >
                        {o.codigo ?? "(sem código)"}
                      </Link>
                      <span className="text-muted-foreground line-clamp-1 text-xs">{o.descricao}</span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(o.valor)}
                    </TableCell>
                    {podeEditar && (
                      <TableCell>
                        <ReceberDocumentoForm contratoId={c.id} ordemId={o.id} valor={o.valor} />
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordens de pagamento</CardTitle>
          <CardDescription>
            {pagOrdens.total > 0 ? (
              <>
                {pagOrdens.total} ordem(ns) deste contrato · total{" "}
                {formatarMoeda(totalOrdens)}
              </>
            ) : (
              "Ordens geradas a partir deste contrato."
            )}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pagOrdens.total === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhuma ordem gerada ainda. Use “Gerar ordens de pagamento” acima.
            </p>
          ) : (
            <>
            <div className="mb-4 grid grid-cols-3 gap-3">
              <ResumoOrdens rotulo="Previsto" valor={detalhe.ordensResumo.previsto} />
              <ResumoOrdens
                rotulo="Pago"
                valor={detalhe.ordensResumo.pago}
                className="text-success-fg"
              />
              <ResumoOrdens
                rotulo="Em aberto"
                valor={detalhe.ordensResumo.aberto}
                className="text-warning-fg"
              />
            </div>
            {temExcluivel && (
              <div className="mb-3">
                <ExclusaoOrdensBarra formId={FORM_EXCLUSAO} contratoId={c.id} />
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
                  <TableHead>Descrição / compra</TableHead>
                  <TableHead className="text-right">Valor</TableHead>
                  <TableHead>Vencimento</TableHead>
                  <TableHead>Situação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagOrdens.linhas.map((o) => (
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
                      {o.processo_compra_id ? (
                        <Link
                          href={`/painel/compras/${o.processo_compra_id}`}
                          className="text-primary hover:underline"
                        >
                          <span className="tabular-nums">
                            {o.processoCodigo ?? "(processo)"}
                          </span>
                        </Link>
                      ) : (
                        <span className="line-clamp-2">{o.descricao ?? "—"}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(o.valor)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {o.data_pagamento
                        ? `paga em ${formatarData(o.data_pagamento)}`
                        : formatarData(o.vencimento)}
                    </TableCell>
                    <TableCell>
                      <SituacaoBadge situacao={o.situacao} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            </>
          )}
          <div className="mt-4">
            <Paginacao
              total={pagOrdens.total}
              pagina={pagOrdens.pagina}
              totalPaginas={pagOrdens.totalPaginas}
              porPagina={paginacao.porPagina}
              padrao={10}
            />
          </div>
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
