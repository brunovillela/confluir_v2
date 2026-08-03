import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Pencil, Plus } from "lucide-react"

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
import { SituacaoBadge } from "@/app/painel/financeiro/situacao-badge"
import { requirePermissao } from "@/lib/auth"
import { buscarFornecedor, type ContratoFornecedor } from "@/lib/db/fornecedores"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { formatarCnpjCpf } from "@/lib/mascaras"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"

import {
  BotaoAcaoFornecedor,
  ContaForm,
  EnderecoForm,
  FornecedorForm,
} from "../../../../compras/fornecedores/fornecedor-forms"
import {
  atualizarEntidadeAction,
  criarEntidadeAction,
  definirInativaEntidadeAction,
  excluirContaEntidadeAction,
  excluirEnderecoEntidadeAction,
  excluirEntidadeAction,
  salvarContaEntidadeAction,
  salvarEnderecoEntidadeAction,
} from "../actions"

export const metadata: Metadata = { title: "Entidade apoiada — Confluir" }

// Ações simples da BotaoAcaoFornecedor, mapeadas para as da entidade.
const ACOES_ENTIDADE = {
  inativar: definirInativaEntidadeAction,
  excluirFornecedor: excluirEntidadeAction,
  excluirEndereco: excluirEnderecoEntidadeAction,
  excluirConta: excluirContaEntidadeAction,
}

function linhaEndereco(campos: (string | null)[]): string {
  return campos.filter((v) => v && v.trim()).join(", ")
}

function ListaAjudas({ ajudas }: { ajudas: ContratoFornecedor[] }) {
  return (
    <ul className="grid gap-2">
      {ajudas.map((c) => (
        <li
          key={c.id}
          className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium">
              <Link
                href={`/painel/institucional/ajudas/${c.id}`}
                className="text-primary tabular-nums hover:underline"
              >
                {c.codigo ?? "(sem código)"}
              </Link>
              {c.objeto && (
                <span className="text-muted-foreground font-normal">
                  {" "}
                  — {c.objeto}
                </span>
              )}
            </p>
            <p className="text-muted-foreground mt-0.5 text-xs">
              Vigência {formatarData(c.vigencia_inicio)} –{" "}
              {c.vigencia_termino ? formatarData(c.vigencia_termino) : "sem termo"}
            </p>
          </div>
          {c.vigente ? (
            <Badge variant="success">Vigente</Badge>
          ) : (
            <Badge variant="outline">Encerrada</Badge>
          )}
        </li>
      ))}
    </ul>
  )
}

export default async function EntidadeApoiadaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{
    salvo?: string
    editar?: string
    endereco?: string
    conta?: string
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

  const detalhe = await buscarFornecedor(id)
  if (!detalhe) notFound()
  const { fornecedor: e, enderecos, contas, ordens } = detalhe

  const editando = brutos.editar === "1" && podeEditar
  const enderecoParam = brutos.endereco ?? ""
  const contaParam = brutos.conta ?? ""
  const aqui = `/painel/institucional/ajudas/entidades/${e.id}`

  const paginacao = lerPaginacao(brutos, 10)
  const pagOrdens = paginar(ordens, paginacao)
  const ajudas = [...detalhe.contratosVigentes, ...detalhe.contratosTerminados]

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/institucional/ajudas/entidades">
            <ArrowLeft />
            Entidades apoiadas
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{e.nome}</h1>
            <Badge variant="outline">
              {e.pessoa_juridica ? "Pessoa jurídica" : "Pessoa física"}
            </Badge>
            {e.fornecedor_bloqueado && (
              <Badge variant="warning">Bloqueada para ajuda</Badge>
            )}
            {e.inativa && <Badge variant="outline">Inativa</Badge>}
          </div>
          {podeEditar && (
            <div className="flex flex-wrap gap-2">
              <BotaoAcaoFornecedor
                acao="inativar"
                acoes={ACOES_ENTIDADE}
                campos={{ fornecedor_id: e.id, inativa: e.inativa ? "0" : "1" }}
                confirmacao={
                  e.inativa
                    ? "Reativar esta entidade?"
                    : "Inativar esta entidade? Ela sai das buscas de ajuda."
                }
              >
                {e.inativa ? "Reativar" : "Inativar"}
              </BotaoAcaoFornecedor>
              <BotaoAcaoFornecedor
                acao="excluirFornecedor"
                acoes={ACOES_ENTIDADE}
                campos={{ fornecedor_id: e.id }}
                confirmacao="Excluir esta entidade? Só é possível se não houver ajuda cadastrada."
                variant="destructive"
              >
                Excluir
              </BotaoAcaoFornecedor>
            </div>
          )}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {e.cnpj_cpf ? formatarCnpjCpf(e.cnpj_cpf) : "CNPJ/CPF não informado"}
          {e.created_at && <> · cadastrada em {formatarData(e.created_at)}</>}
        </p>
      </div>

      {brutos.salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Alteração salva.</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="text-base">Dados básicos</CardTitle>
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
          {editando ? (
            <FornecedorForm
              fornecedor={e}
              aoCancelarHref={aqui}
              acaoCriar={criarEntidadeAction}
              acaoAtualizar={atualizarEntidadeAction}
              rotuloEntidade="entidade apoiada"
              rotuloBloqueio="Bloqueada para ajuda"
            />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs">Nome fantasia</dt>
                <dd className="mt-0.5 text-sm">{e.nome_fantasia ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Razão social</dt>
                <dd className="mt-0.5 text-sm">{e.nome_razao ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">CNPJ/CPF</dt>
                <dd className="mt-0.5 text-sm tabular-nums">
                  {e.cnpj_cpf ? formatarCnpjCpf(e.cnpj_cpf) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Situação</dt>
                <dd className="mt-0.5 text-sm">
                  {e.inativa
                    ? `Inativa${e.inativa_data ? ` desde ${formatarData(e.inativa_data)}` : ""}`
                    : e.fornecedor_bloqueado
                      ? "Ativa, bloqueada para ajuda"
                      : "Ativa"}
                </dd>
              </div>
            </dl>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Endereços</CardTitle>
              {podeEditar && enderecos !== null && enderecoParam !== "novo" && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${aqui}?endereco=novo`}>
                    <Plus />
                    Adicionar
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {enderecos === null ? (
              <Alert variant="warning">
                <AlertDescription>
                  Rode <code>supabase/fornecedores.sql</code> para habilitar os
                  endereços.
                </AlertDescription>
              </Alert>
            ) : enderecos.length === 0 && enderecoParam !== "novo" ? (
              <p className="text-muted-foreground text-sm">
                Nenhum endereço cadastrado.
              </p>
            ) : (
              enderecos.map((end) =>
                enderecoParam === end.id ? (
                  <EnderecoForm
                    key={end.id}
                    fornecedorId={e.id}
                    endereco={end}
                    aoCancelarHref={aqui}
                    acao={salvarEnderecoEntidadeAction}
                  />
                ) : (
                  <div
                    key={end.id}
                    className="border-border flex flex-wrap items-start justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <div className="min-w-0">
                      {end.nome_endereco && (
                        <p className="font-medium">{end.nome_endereco}</p>
                      )}
                      <p>
                        {linhaEndereco([
                          end.logradouro,
                          end.numero,
                          end.complemento,
                        ]) || "—"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {linhaEndereco([end.bairro, end.cidade, end.estado])}
                        {end.cep && ` · CEP ${end.cep}`}
                      </p>
                    </div>
                    {podeEditar && (
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" asChild>
                          <Link href={`${aqui}?endereco=${end.id}`}>Editar</Link>
                        </Button>
                        <BotaoAcaoFornecedor
                          acao="excluirEndereco"
                          acoes={ACOES_ENTIDADE}
                          campos={{ fornecedor_id: e.id, endereco_id: end.id }}
                          confirmacao="Excluir este endereço?"
                          variant="ghost"
                        >
                          Excluir
                        </BotaoAcaoFornecedor>
                      </div>
                    )}
                  </div>
                )
              )
            )}
            {podeEditar && enderecos !== null && enderecoParam === "novo" && (
              <EnderecoForm
                fornecedorId={e.id}
                aoCancelarHref={aqui}
                acao={salvarEnderecoEntidadeAction}
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Dados bancários</CardTitle>
              {podeEditar && contaParam !== "novo" && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`${aqui}?conta=novo`}>
                    <Plus />
                    Adicionar
                  </Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent className="grid gap-3">
            {contas.length === 0 && contaParam !== "novo" && (
              <p className="text-muted-foreground text-sm">
                Nenhuma conta cadastrada.
              </p>
            )}
            {contas.map((c) =>
              contaParam === c.id ? (
                <ContaForm
                  key={c.id}
                  fornecedorId={e.id}
                  conta={c}
                  aoCancelarHref={aqui}
                  acao={salvarContaEntidadeAction}
                />
              ) : (
                <div
                  key={c.id}
                  className="border-border flex flex-wrap items-start justify-between gap-2 rounded-md border p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-medium">
                      {c.banco ?? (c.pix ? "Pix" : "(sem banco)")}
                      {c.tipo_conta && (
                        <span className="text-muted-foreground font-normal">
                          {" "}
                          · {c.tipo_conta}
                        </span>
                      )}
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {[
                        c.agencia && `ag. ${c.agencia}`,
                        c.conta && `conta ${c.conta}`,
                        c.pix && `Pix ${c.pix}`,
                        c.favorecido && `favorecido ${c.favorecido}`,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </p>
                  </div>
                  {podeEditar && (
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`${aqui}?conta=${c.id}`}>Editar</Link>
                      </Button>
                      <BotaoAcaoFornecedor
                        acao="excluirConta"
                        acoes={ACOES_ENTIDADE}
                        campos={{ fornecedor_id: e.id, conta_id: c.id }}
                        confirmacao="Excluir esta conta?"
                        variant="ghost"
                      >
                        Excluir
                      </BotaoAcaoFornecedor>
                    </div>
                  )}
                </div>
              )
            )}
            {podeEditar && contaParam === "novo" && (
              <ContaForm
                fornecedorId={e.id}
                aoCancelarHref={aqui}
                acao={salvarContaEntidadeAction}
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ajudas</CardTitle>
          <CardDescription>
            {ajudas.length} ajuda(s) para esta entidade
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ajudas.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma ajuda registrada para esta entidade.
            </p>
          ) : (
            <ListaAjudas ajudas={ajudas} />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordens de pagamento</CardTitle>
          <CardDescription>
            Ordens em que esta entidade é a favorecida.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pagOrdens.total === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhuma ordem vinculada a esta entidade.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
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
                    <TableCell className="whitespace-nowrap">
                      {o.tipo ?? "—"}
                    </TableCell>
                    <TableCell className="max-w-96">
                      <span className="line-clamp-2">{o.descricao ?? "—"}</span>
                    </TableCell>
                    <TableCell className="text-right whitespace-nowrap tabular-nums">
                      {formatarMoeda(o.valor_pago ?? o.valor_inicial_cobranca)}
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
