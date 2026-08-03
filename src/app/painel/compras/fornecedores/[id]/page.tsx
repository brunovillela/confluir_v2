import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, FileText, Pencil, Plus } from "lucide-react"

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

import {
  BotaoAcaoFornecedor,
  ContaForm,
  EnderecoForm,
  FornecedorForm,
} from "../fornecedor-forms"

export const metadata: Metadata = { title: "Fornecedor — Confluir" }

function linhaEndereco(campos: (string | null)[]): string {
  return campos.filter((v) => v && v.trim()).join(", ")
}

function normalizarArquivo(caminho: string | null): string | null {
  if (!caminho) return null
  return caminho.startsWith("//") ? `https:${caminho}` : caminho
}

function ListaContratos({ contratos }: { contratos: ContratoFornecedor[] }) {
  return (
    <ul className="grid gap-2">
      {contratos.map((c) => (
        <li
          key={c.id}
          className="border-border flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm"
        >
          <div className="min-w-0">
            <p className="font-medium">
              <Link
                href={`/painel/compras/contratos/${c.id}`}
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
          <div className="flex items-center gap-2">
            {c.vigente ? (
              <Badge variant="success">Vigente</Badge>
            ) : (
              <Badge variant="outline">Encerrado</Badge>
            )}
            {normalizarArquivo(c.arquivo_contrato) && (
              <Button variant="ghost" size="sm" asChild>
                <a
                  href={normalizarArquivo(c.arquivo_contrato)!}
                  target="_blank"
                  rel="noreferrer"
                >
                  <FileText />
                  Contrato
                </a>
              </Button>
            )}
          </div>
        </li>
      ))}
    </ul>
  )
}

export default async function FornecedorPage({
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
  await requirePermissao("aquisicoes_fornecedores", [
    "aquisicoes_compras_edicao",
  ])
  const { id } = await params
  const brutos = await searchParams

  const detalhe = await buscarFornecedor(id)
  if (!detalhe) notFound()
  const { fornecedor: f, enderecos, contas, ordens } = detalhe

  const editando = brutos.editar === "1"
  const enderecoParam = brutos.endereco ?? ""
  const contaParam = brutos.conta ?? ""
  const aqui = `/painel/compras/fornecedores/${f.id}`

  const paginacao = lerPaginacao(brutos, 10)
  const pagOrdens = paginar(ordens, paginacao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras/fornecedores">
            <ArrowLeft />
            Fornecedores
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{f.nome}</h1>
            <Badge variant="outline">
              {f.pessoa_juridica ? "Pessoa jurídica" : "Pessoa física"}
            </Badge>
            {f.fornecedor_bloqueado && (
              <Badge variant="warning">Bloqueado para fornecimento</Badge>
            )}
            {f.inativa && <Badge variant="outline">Inativo</Badge>}
          </div>
          <div className="flex flex-wrap gap-2">
            <BotaoAcaoFornecedor
              acao="inativar"
              campos={{ fornecedor_id: f.id, inativa: f.inativa ? "0" : "1" }}
              confirmacao={
                f.inativa
                  ? "Reativar este fornecedor?"
                  : "Inativar este fornecedor? Ele sai das buscas de cotação e compra."
              }
            >
              {f.inativa ? "Reativar" : "Inativar"}
            </BotaoAcaoFornecedor>
            <BotaoAcaoFornecedor
              acao="excluirFornecedor"
              campos={{ fornecedor_id: f.id }}
              confirmacao="Excluir este fornecedor? Só é possível sem registros vinculados."
              variant="destructive"
            >
              Excluir
            </BotaoAcaoFornecedor>
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {f.cnpj_cpf ? formatarCnpjCpf(f.cnpj_cpf) : "CNPJ/CPF não informado"}
          {f.created_at && <> · cadastrado em {formatarData(f.created_at)}</>}
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
            {!editando && (
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
            <FornecedorForm fornecedor={f} aoCancelarHref={aqui} />
          ) : (
            <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-muted-foreground text-xs">Nome fantasia</dt>
                <dd className="mt-0.5 text-sm">{f.nome_fantasia ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Razão social</dt>
                <dd className="mt-0.5 text-sm">{f.nome_razao ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">CNPJ/CPF</dt>
                <dd className="mt-0.5 text-sm tabular-nums">
                  {f.cnpj_cpf ? formatarCnpjCpf(f.cnpj_cpf) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground text-xs">Situação</dt>
                <dd className="mt-0.5 text-sm">
                  {f.inativa
                    ? `Inativo${f.inativa_data ? ` desde ${formatarData(f.inativa_data)}` : ""}`
                    : f.fornecedor_bloqueado
                      ? "Ativo, bloqueado para fornecimento"
                      : "Ativo"}
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
              {enderecos !== null && enderecoParam !== "novo" && (
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
              enderecos.map((e) =>
                enderecoParam === e.id ? (
                  <EnderecoForm
                    key={e.id}
                    fornecedorId={f.id}
                    endereco={e}
                    aoCancelarHref={aqui}
                  />
                ) : (
                  <div
                    key={e.id}
                    className="border-border flex flex-wrap items-start justify-between gap-2 rounded-md border p-3 text-sm"
                  >
                    <div className="min-w-0">
                      {e.nome_endereco && (
                        <p className="font-medium">{e.nome_endereco}</p>
                      )}
                      <p>
                        {linhaEndereco([e.logradouro, e.numero, e.complemento]) ||
                          "—"}
                      </p>
                      <p className="text-muted-foreground text-xs">
                        {linhaEndereco([e.bairro, e.cidade, e.estado])}
                        {e.cep && ` · CEP ${e.cep}`}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" asChild>
                        <Link href={`${aqui}?endereco=${e.id}`}>Editar</Link>
                      </Button>
                      <BotaoAcaoFornecedor
                        acao="excluirEndereco"
                        campos={{ fornecedor_id: f.id, endereco_id: e.id }}
                        confirmacao="Excluir este endereço?"
                        variant="ghost"
                      >
                        Excluir
                      </BotaoAcaoFornecedor>
                    </div>
                  </div>
                )
              )
            )}
            {enderecos !== null && enderecoParam === "novo" && (
              <EnderecoForm fornecedorId={f.id} aoCancelarHref={aqui} />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle className="text-base">Dados bancários</CardTitle>
              {contaParam !== "novo" && (
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
                  fornecedorId={f.id}
                  conta={c}
                  aoCancelarHref={aqui}
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
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" asChild>
                      <Link href={`${aqui}?conta=${c.id}`}>Editar</Link>
                    </Button>
                    <BotaoAcaoFornecedor
                      acao="excluirConta"
                      campos={{ fornecedor_id: f.id, conta_id: c.id }}
                      confirmacao="Excluir esta conta?"
                      variant="ghost"
                    >
                      Excluir
                    </BotaoAcaoFornecedor>
                  </div>
                </div>
              )
            )}
            {contaParam === "novo" && (
              <ContaForm fornecedorId={f.id} aoCancelarHref={aqui} />
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Contratos</CardTitle>
          <CardDescription>
            {detalhe.contratosVigentes.length} vigente(s) ·{" "}
            {detalhe.contratosTerminados.length} encerrado(s)
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          {detalhe.contratosVigentes.length === 0 &&
          detalhe.contratosTerminados.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhum contrato com este fornecedor.
            </p>
          ) : (
            <>
              {detalhe.contratosVigentes.length > 0 && (
                <ListaContratos contratos={detalhe.contratosVigentes} />
              )}
              {detalhe.contratosTerminados.length > 0 && (
                <details>
                  <summary className="text-muted-foreground cursor-pointer text-sm">
                    Encerrados ({detalhe.contratosTerminados.length})
                  </summary>
                  <div className="mt-3">
                    <ListaContratos contratos={detalhe.contratosTerminados} />
                  </div>
                </details>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ordens de pagamento</CardTitle>
          <CardDescription>
            Ordens em que este fornecedor é o favorecido. As migradas do Bubble
            vieram sem esse vínculo — aparecem as geradas pelo Confluir.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {pagOrdens.total === 0 ? (
            <p className="text-muted-foreground py-4 text-center text-sm">
              Nenhuma ordem vinculada a este fornecedor.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Código</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Descrição / compra</TableHead>
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
                      {o.processo_compra_id ? (
                        <Link
                          href={`/painel/compras/${o.processo_compra_id}`}
                          className="text-primary hover:underline"
                        >
                          <span className="tabular-nums">
                            {o.processoCodigo ?? "(processo)"}
                          </span>
                          {o.processoProduto && (
                            <span className="text-foreground">
                              {" "}
                              — {o.processoProduto}
                            </span>
                          )}
                        </Link>
                      ) : (
                        <span className="line-clamp-2">{o.descricao ?? "—"}</span>
                      )}
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
