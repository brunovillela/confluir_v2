import type { Metadata } from "next"
import Link from "next/link"
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  CircleDollarSign,
  Hourglass,
  List,
  Merge,
  Plus,
  Search,
  Sparkles,
  Truck,
} from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Input } from "@/components/ui/input"
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
  indicadoresGerais,
  panoramaFornecedores,
  ROTULO_PROBLEMA,
  type CodigoProblema,
} from "@/lib/db/fornecedores-indicadores"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { formatarCnpjCpf } from "@/lib/mascaras"
import { podeEditarFornecedores, podeVerFinanceiroFornecedores } from "@/lib/fornecedores-acesso"

export const metadata: Metadata = { title: "Fornecedores — Confluir" }

const LISTA = "/painel/compras/fornecedores/lista"

export default async function FornecedoresPage() {
  const sessao = await requirePermissao("aquisicoes_fornecedores", [
    "aquisicoes_fornecedores_edicao",
    "aquisicoes_compras_edicao",
  ])
  const podeEditar = podeEditarFornecedores(sessao.permissoes)
  const verFinanceiro = podeVerFinanceiroFornecedores(sessao.permissoes)
  const linhas = await panoramaFornecedores()
  const ind = indicadoresGerais(linhas)
  const maiorValor = ind.maiores12m[0]?.pago12m ?? 0

  const todosCartoes = [
    {
      titulo: "Fornecedores ativos",
      valor: ind.ativos.toLocaleString("pt-BR"),
      detalhe: `${ind.pessoasJuridicas.toLocaleString("pt-BR")} PJ · ${ind.pessoasFisicas.toLocaleString("pt-BR")} PF · ${ind.apoiadas.toLocaleString("pt-BR")} entidades apoiadas`,
      icone: Truck,
      href: LISTA,
    },
    {
      titulo: "Com problema no cadastro",
      valor: ind.comProblema.toLocaleString("pt-BR"),
      detalhe: `${ind.ativos ? Math.round((ind.comProblema / ind.ativos) * 100) : 0}% dos ativos · ${ind.travamPagamento.length} em uso com CPF/CNPJ que trava pagamento`,
      icone: AlertTriangle,
      href: `${LISTA}?problema=com&ordem=problemas&dir=desc`,
      alerta: ind.comProblema > 0,
    },
    {
      titulo: "Pago nos últimos 12 meses",
      valor: formatarMoeda(ind.pago12m),
      detalhe: `a ${ind.fornecedoresPagos12m.toLocaleString("pt-BR")} fornecedor(es)`,
      icone: CircleDollarSign,
      href: `${LISTA}?ordem=pago12m&dir=desc`,
      financeiro: true,
    },
    {
      titulo: "Em aberto",
      valor: formatarMoeda(ind.emAberto),
      detalhe: "ordens ainda não pagas",
      icone: Hourglass,
      financeiro: true,
    },
    {
      titulo: "Cadastrados nos últimos 30 dias",
      valor: ind.novos30d.toLocaleString("pt-BR"),
      detalhe: "fornecedor novo é o ponto de atenção clássico da auditoria",
      icone: Sparkles,
      href: `${LISTA}?ordem=cadastro&dir=desc`,
    },
    {
      titulo: "Bloqueados",
      valor: ind.bloqueados.toLocaleString("pt-BR"),
      detalhe: `${ind.inativos.toLocaleString("pt-BR")} cadastro(s) inativo(s)`,
      icone: Ban,
      href: `${LISTA}?situacao=bloqueados`,
    },
  ]
  // Valores pagos e em aberto: só para quem tem permissão do Financeiro.
  const cartoes = todosCartoes.filter((c) => verFinanceiro || !("financeiro" in c))
  const duplicados = ind.porProblema.documento_duplicado

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/compras">
            <ArrowLeft />
            Aquisição
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Fornecedores</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              Quem fornece para a entidade, quanto recebe e como está o cadastro
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={LISTA}>
                <List />
                Lista completa
              </Link>
            </Button>
            {podeEditar && (
              <Button asChild>
                <Link href="/painel/compras/fornecedores/novo">
                  <Plus />
                  Novo fornecedor
                </Link>
              </Button>
            )}
          </div>
        </div>
      </div>

      <form method="GET" action={LISTA} className="flex gap-2">
        <div className="relative min-w-0 flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input name="busca" placeholder="Nome, razão social ou CPF/CNPJ" className="pl-8" aria-label="Buscar fornecedor" />
        </div>
        <Button type="submit" variant="secondary">Buscar</Button>
      </form>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cartoes.map((c) => {
          const corpo = (
            <Card className={c.alerta ? "border-warning/50" : undefined}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardDescription>{c.titulo}</CardDescription>
                  <c.icone className={c.alerta ? "text-warning-fg size-4" : "text-muted-foreground size-4"} />
                </div>
                <CardTitle className="text-2xl tabular-nums">{c.valor}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground text-xs">{c.detalhe}</p>
              </CardContent>
            </Card>
          )
          return c.href ? (
            <Link key={c.titulo} href={c.href} className="rounded-xl transition-shadow hover:shadow-md">
              {corpo}
            </Link>
          ) : (
            <div key={c.titulo}>{corpo}</div>
          )
        })}
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Problemas no cadastro</CardTitle>
            <CardDescription>
              Fornecedores ativos por problema. Os de CPF/CNPJ podem travar pagamentos,
              conforme as regras de Auditoria das ordens. Conta e endereço em falta são
              pendências de preenchimento e não entram na contagem de problemas.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-border grid divide-y">
              {(Object.entries(ROTULO_PROBLEMA) as [CodigoProblema, string][]).map(([codigo, rotulo]) => (
                <li key={codigo} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <span className="flex flex-wrap items-center gap-x-3">
                    <Link href={`${LISTA}?problema=${codigo}`} className="hover:underline">
                      {rotulo}
                    </Link>
                    {codigo === "documento_duplicado" && duplicados > 0 && (
                      <Link
                        href="/painel/compras/fornecedores/duplicados"
                        className="text-primary inline-flex items-center gap-1 text-xs font-medium hover:underline"
                      >
                        <Merge className="size-3.5" />
                        {podeEditar ? "Mesclar duplicados" : "Ver duplicados"}
                      </Link>
                    )}
                  </span>
                  <Badge
                    variant="outline"
                    className={
                      ind.porProblema[codigo] === 0
                        ? "text-muted-foreground"
                        : codigo === "sem_documento" || codigo === "documento_invalido"
                          ? "border-destructive/50 text-destructive"
                          : codigo === "sem_pagamento" || codigo === "sem_endereco"
                            ? "text-muted-foreground"
                            : "border-warning/50 text-warning-fg"
                    }
                  >
                    {ind.porProblema[codigo].toLocaleString("pt-BR")}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        {verFinanceiro && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Maiores fornecedores — 12 meses</CardTitle>
            <CardDescription>Quanto cada um recebeu em ordens pagas</CardDescription>
          </CardHeader>
          <CardContent>
            {ind.maiores12m.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nenhum pagamento nos últimos 12 meses.</p>
            ) : (
              <ol className="grid gap-2">
                {ind.maiores12m.map((l) => (
                  <li key={l.id} className="grid gap-1 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <Link href={`/painel/compras/fornecedores/${l.id}`} className="min-w-0 truncate hover:underline">
                        {l.nome}
                      </Link>
                      <span className="shrink-0 tabular-nums">{formatarMoeda(l.pago12m)}</span>
                    </div>
                    <div className="bg-muted h-1.5 overflow-hidden rounded-full" aria-hidden>
                      <div className="bg-primary h-full rounded-full" style={{ width: `${maiorValor ? Math.max(2, (l.pago12m / maiorValor) * 100) : 0}%` }} />
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
        )}
      </div>

      {ind.travamPagamento.length > 0 && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <AlertTriangle className="text-destructive size-4" />
              Em uso, com CPF/CNPJ que trava pagamento ({ind.travamPagamento.length})
            </CardTitle>
            <CardDescription>
              Receberam ordens no último ano e estão sem CPF/CNPJ ou com um inválido. Com a
              regra &quot;CPF/CNPJ do favorecido&quot; em Bloquear, novas ordens para eles
              são recusadas até a correção do cadastro.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Fornecedor</TableHead>
                  <TableHead>CPF/CNPJ no cadastro</TableHead>
                  {verFinanceiro && <TableHead className="text-right">Pago em 12 meses</TableHead>}
                  {verFinanceiro && <TableHead className="hidden text-right md:table-cell">Em aberto</TableHead>}
                  <TableHead className="hidden md:table-cell">Última ordem</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ind.travamPagamento.slice(0, 20).map((l) => (
                  <TableRow key={l.id}>
                    <TableCell>
                      <Link href={`/painel/compras/fornecedores/${l.id}${podeEditar ? "?editar=1" : ""}`} className="text-primary hover:underline">
                        {l.nome}
                      </Link>
                    </TableCell>
                    <TableCell className="text-destructive tabular-nums">
                      {l.cnpj_cpf ? formatarCnpjCpf(l.cnpj_cpf) : "sem documento"}
                    </TableCell>
                    {verFinanceiro && <TableCell className="text-right tabular-nums">{l.pago12m ? formatarMoeda(l.pago12m) : "—"}</TableCell>}
                    {verFinanceiro && <TableCell className="hidden text-right tabular-nums md:table-cell">{l.emAberto ? formatarMoeda(l.emAberto) : "—"}</TableCell>}
                    <TableCell className="hidden md:table-cell">{l.ultimaOrdem ? formatarData(l.ultimaOrdem) : "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {ind.travamPagamento.length > 20 && (
              <Button variant="link" asChild className="mt-2 px-0">
                <Link href={`${LISTA}?problema=trava`}>Ver todos os {ind.travamPagamento.length}</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </>
  )
}
