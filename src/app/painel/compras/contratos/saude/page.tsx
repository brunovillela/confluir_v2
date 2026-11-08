import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, FileWarning, Search, X } from "lucide-react"

import { faixaDaSaude, MedidorSaudeCadastros, percentualSaude } from "@/components/medidor-saude-cadastros"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Paginacao } from "@/components/paginacao"
import { requirePermissao } from "@/lib/auth"
import {
  DICA_PROBLEMA_CONTRATO,
  ROTULO_PROBLEMA_CONTRATO,
  saudeContratos,
  TIPOS_APONTAMENTO_CONTRATO,
  TIPOS_PENDENCIA_CONTRATO,
  type ApontamentoContrato,
  type PendenciaContrato,
} from "@/lib/db/contratos-saude"
import { formatarData } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"
import { semAcento } from "@/lib/texto"

export const metadata: Metadata = { title: "Saúde dos contratos — Confluir" }

const POR_PAGINA = 50

type Filtro = PendenciaContrato | ApontamentoContrato | "apontamento"

/** Contratos em uso com algum problema no cadastro, como a saúde dos cadastros da filiação. */
export default async function SaudeContratosPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; pagina?: string; tipo?: string }>
}) {
  const sessao = await requirePermissao("aquisicoes_contratos", ["aquisicoes_contratos_edicao"])
  const podeEditar = podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")
  const { busca = "", pagina: paginaTexto, tipo: tipoBruto } = await searchParams
  const pagina = Math.max(1, Number(paginaTexto) || 1)
  const todos: readonly string[] = [...TIPOS_PENDENCIA_CONTRATO, ...TIPOS_APONTAMENTO_CONTRATO, "apontamento"]
  const tipo = todos.includes(tipoBruto ?? "") ? (tipoBruto as Filtro) : null

  const dados = await saudeContratos({ verSigilosos: podeEditar })
  const semPendencia = dados.emUso - dados.comPendencia
  const percentual = percentualSaude(semPendencia, dados.emUso)
  const faixa = faixaDaSaude(percentual)

  const termo = semAcento(busca.trim())
  const filtrados = dados.linhas.filter((c) => {
    // Sem filtro: só os com pendência (apontamento não derruba a saúde).
    if (tipo === "apontamento") {
      if (!c.apontamentos.length) return false
    } else if (tipo) {
      if (!(c.pendencias as string[]).includes(tipo) && !(c.apontamentos as string[]).includes(tipo)) return false
    } else if (!c.pendencias.length) return false
    if (!termo) return true
    return [c.codigo, c.objeto, c.fornecedorNome].some((v) => semAcento(v ?? "").includes(termo))
  })
  const total = filtrados.length
  const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA))
  const daPagina = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA)
  const titulo =
    tipo === "apontamento" ? "Apontamentos" : tipo ? ROTULO_PROBLEMA_CONTRATO[tipo] : "Todos com pendência"

  const urlTipo = (t: Filtro | null) => {
    const q = new URLSearchParams()
    if (t) q.set("tipo", t)
    if (busca) q.set("busca", busca)
    const s = q.toString()
    return `/painel/compras/contratos/saude${s ? `?${s}` : ""}`
  }

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/compras/contratos">
            <ArrowLeft />
            Contratos
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">Saúde dos contratos</h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Contratos em uso — não vencidos, fora as ajudas institucionais e os marcados como inativos — com algum
          problema no cadastro. A pendência derruba a saúde; o apontamento só avisa.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contratos sem pendência</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-3xl font-semibold tabular-nums">{percentual.toLocaleString("pt-BR")}%</span>
              <Badge variant="outline" className={faixa.classeBadge}>
                {faixa.rotulo}
              </Badge>
            </div>
            <MedidorSaudeCadastros percentual={percentual} />
            <p className="text-muted-foreground text-center text-xs">
              <span className="tabular-nums">{semPendencia.toLocaleString("pt-BR")}</span> de{" "}
              <span className="tabular-nums">{dados.emUso.toLocaleString("pt-BR")}</span> contratos em uso
            </p>
          </CardContent>
        </Card>

        <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <Link href={urlTipo(null)} className="group">
            <Card className={!tipo ? "border-primary/50" : "group-hover:border-primary/40"}>
              <CardContent className="grid gap-1">
                <span className="text-muted-foreground text-xs">Com pendência</span>
                <span className="text-2xl font-semibold tabular-nums">{dados.comPendencia.toLocaleString("pt-BR")}</span>
              </CardContent>
            </Card>
          </Link>
          <Link href={urlTipo("apontamento")} className="group">
            <Card className={tipo === "apontamento" ? "border-primary/50" : "group-hover:border-primary/40"}>
              <CardContent className="grid gap-1">
                <span className="text-muted-foreground text-xs">Com apontamento</span>
                <span className="text-2xl font-semibold tabular-nums">{dados.comApontamento.toLocaleString("pt-BR")}</span>
                <span className="text-muted-foreground text-xs">não derruba a saúde</span>
              </CardContent>
            </Card>
          </Link>
          {[...TIPOS_PENDENCIA_CONTRATO, ...TIPOS_APONTAMENTO_CONTRATO].map((t) => (
            <Link key={t} href={urlTipo(t)} className="group">
              <Card className={tipo === t ? "border-primary/50" : "group-hover:border-primary/40"}>
                <CardContent className="grid gap-1">
                  <span className="text-muted-foreground text-xs">{ROTULO_PROBLEMA_CONTRATO[t]}</span>
                  <span className="text-2xl font-semibold tabular-nums">{dados.totais[t].toLocaleString("pt-BR")}</span>
                  {(TIPOS_APONTAMENTO_CONTRATO as readonly string[]).includes(t) && (
                    <span className="text-muted-foreground text-xs">apontamento</span>
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <CardTitle>{titulo}</CardTitle>
              <CardDescription>
                {total === 0
                  ? "Nenhum contrato em uso com este problema."
                  : `${total.toLocaleString("pt-BR")} contrato(s)${busca ? " na busca" : ""}.`}
                {tipo && tipo !== "apontamento" ? ` ${DICA_PROBLEMA_CONTRATO[tipo]}` : ""}
              </CardDescription>
            </div>
            <form className="flex gap-2">
              {tipo && <input type="hidden" name="tipo" value={tipo} />}
              <Input name="busca" defaultValue={busca} placeholder="Código, objeto ou fornecedor" className="w-full sm:w-64" />
              <Button type="submit" variant="outline" size="icon" aria-label="Buscar">
                <Search />
              </Button>
              {(busca || tipo) && (
                <Button asChild variant="ghost" size="icon" title="Limpar">
                  <Link href="/painel/compras/contratos/saude">
                    <X />
                  </Link>
                </Button>
              )}
            </form>
          </div>
        </CardHeader>
        <CardContent>
          {daPagina.length === 0 ? (
            <div className="text-muted-foreground flex flex-col items-center gap-2 py-10 text-center">
              <FileWarning className="size-6" />
              <p className="text-sm">{busca ? "Nenhum contrato encontrado com essa busca." : "Nada a corrigir aqui."}</p>
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Contrato</TableHead>
                      <TableHead className="hidden md:table-cell">Fornecedor</TableHead>
                      <TableHead className="hidden lg:table-cell">Término</TableHead>
                      <TableHead>Problemas</TableHead>
                      <TableHead className="w-32" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {daPagina.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="max-w-72">
                          <span className="block font-medium tabular-nums">{c.codigo ?? "(sem código)"}</span>
                          <span className="text-muted-foreground block truncate text-xs">{c.objeto ?? "—"}</span>
                        </TableCell>
                        <TableCell className="hidden max-w-56 truncate md:table-cell">{c.fornecedorNome ?? "—"}</TableCell>
                        <TableCell className="text-muted-foreground hidden whitespace-nowrap lg:table-cell">
                          {c.vigenciaTermino ? formatarData(c.vigenciaTermino) : "—"}
                        </TableCell>
                        <TableCell>
                          <span className="flex flex-wrap gap-1">
                            {c.pendencias.map((p) => (
                              <Badge key={p} variant="warning" title={DICA_PROBLEMA_CONTRATO[p]}>
                                {ROTULO_PROBLEMA_CONTRATO[p]}
                              </Badge>
                            ))}
                            {c.apontamentos.map((a) => (
                              <Badge
                                key={a}
                                variant="outline"
                                className="text-muted-foreground border-dashed"
                                title={`Apontamento: não derruba a saúde. ${DICA_PROBLEMA_CONTRATO[a]}`}
                              >
                                {ROTULO_PROBLEMA_CONTRATO[a]}
                              </Badge>
                            ))}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm">
                            <Link href={`/painel/compras/contratos/${c.id}`}>Abrir contrato</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              <div className="mt-4">
                <Paginacao total={total} pagina={pagina} totalPaginas={totalPaginas} porPagina={POR_PAGINA} padrao={POR_PAGINA} />
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}
