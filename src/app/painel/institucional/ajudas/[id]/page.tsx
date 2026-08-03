import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText, LinkIcon, Pencil, Plus } from "lucide-react"

import {
  TiposContratoBadges,
  VigenciaContratoBadge,
} from "@/components/compras"
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
import { Paginacao } from "@/components/paginacao"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import { requirePermissao } from "@/lib/auth"
import {
  buscarContrato,
  carregarOpcoesAjuda,
  type ContratoLista,
} from "@/lib/db/contratos"
import { hojeLocalISO } from "@/lib/compras-constantes"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

import {
  BotaoExcluirContrato,
  ContratoForm,
} from "../../../compras/contratos/contrato-forms"
import { GerarOrdensForm } from "../../../compras/contratos/gerar-ordens-form"
import {
  atualizarAjudaAction,
  criarAjudaAction,
  excluirAjudaAction,
  gerarOrdensAjudaAction,
} from "../actions"

export const metadata: Metadata = { title: "Ajuda institucional — Confluir" }

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
              href={`/painel/institucional/ajudas/${a.id}`}
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

export default async function AjudaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    salvo?: string
    editar?: string
    geradas?: string
    puladas?: string
    pagina?: string
    porPagina?: string
  }>
}) {
  const sessao = await requirePermissao("apoio_institucional", [
    "apoio_institucional_edicao",
  ])
  const podeEditar = podeAcessar(sessao.permissoes, "apoio_institucional_edicao")

  const { id } = await params
  const brutos = await searchParams

  const detalhe = await buscarContrato(id)
  // Só ajudas vivem aqui; contratos comuns são do módulo Compras.
  if (!detalhe || !detalhe.contrato.apoio_institucional) notFound()
  const { contrato: c } = detalhe

  const editando = brutos.editar === "1" && podeEditar
  const aqui = `/painel/institucional/ajudas/${c.id}`

  const opcoes = editando ? await carregarOpcoesAjuda() : null

  const paginacao = lerPaginacao(brutos, 10)
  const pagOrdens = paginar(detalhe.ordens, paginacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/ajudas">
            <ArrowLeft />
            Ajudas institucionais
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
              apoio_institucional={false}
            />
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <BotaoExcluirContrato
                contratoId={c.id}
                acao={excluirAjudaAction}
                confirmacao="Excluir esta ajuda? Ela sai das listagens."
              />
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {detalhe.fornecedorNome ?? "Sem entidade apoiada"}
          {c.created_at && <> · cadastrada em {formatarData(c.created_at)}</>}
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

      {detalhe.aditivoOrfao && (
        <Alert variant="warning">
          <AlertDescription>
            Marcada como aditivo, mas sem ajuda principal vinculada.
          </AlertDescription>
        </Alert>
      )}

      {detalhe.principal && (
        <Alert className="border-info/40 text-info-fg">
          <AlertDescription className="flex items-center gap-1.5">
            <LinkIcon className="size-3.5" />
            Aditivo da ajuda{" "}
            <Link
              href={`/painel/institucional/ajudas/${detalhe.principal.id}`}
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
            <CardTitle className="text-base">Dados da ajuda</CardTitle>
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
              acaoCriar={criarAjudaAction}
              acaoAtualizar={atualizarAjudaAction}
              beneficiarioRotulo="Entidade apoiada"
              mostrarCategoria={false}
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="sm:col-span-2 lg:col-span-3">
                <dt className="text-muted-foreground text-xs">Objeto</dt>
                <dd className="mt-0.5 text-sm">{c.objeto ?? "—"}</dd>
              </div>
              <Campo rotulo="Entidade apoiada" valor={detalhe.fornecedorNome} />
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
                <Link href={`/painel/institucional/ajudas/novo?principal=${c.id}`}>
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
              Nenhum aditivo vinculado a esta ajuda.
            </p>
          ) : (
            <ListaAditivos aditivos={detalhe.aditivos} />
          )}
        </CardContent>
      </Card>

      {podeEditar && (
        <GrupoColapsavel
          titulo="Gerar ordens de pagamento"
          descricao="Cria ordens a partir da ajuda (mensal, anual ou única)"
        >
          <GerarOrdensForm
            contratoId={c.id}
            valorPadrao={c.valor}
            vigenciaInicio={c.vigencia_inicio}
            vigenciaTermino={c.vigencia_termino}
            hoje={hojeLocalISO()}
            temFornecedor={Boolean(c.fornecedor_id)}
            acao={gerarOrdensAjudaAction}
            beneficiarioRotulo="entidade apoiada"
          />
        </GrupoColapsavel>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordens de pagamento</CardTitle>
          <CardDescription>
            {pagOrdens.total > 0
              ? `${pagOrdens.total} ordem(ns) desta ajuda`
              : "Ordens geradas a partir desta ajuda."}
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
                <ResumoOrdens
                  rotulo="Previsto"
                  valor={detalhe.ordensResumo.previsto}
                />
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
                  {pagOrdens.linhas.map((o) => (
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
