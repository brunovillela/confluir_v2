import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CircleCheck,
  Download,
  Filter,
  Gavel,
  X,
} from "lucide-react"

import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { GrupoColapsavel } from "@/components/grupo-colapsavel"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarFornecedores } from "@/lib/db/compras"
import { listarProcessos, type FiltrosProcesso } from "@/lib/db/juridico"
import { listarUsuariosAtivos } from "@/lib/db/veiculos"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import {
  FILTROS_ANDAMENTO,
  FILTROS_NATUREZA,
  filtroAndamentoValido,
  filtroNaturezaValido,
  lerDirecao,
  lerOrdemProcesso,
  ORDENS_PROCESSO,
  STATUS_PROCESSO,
  statusProcessoValido,
  TIPOS_PROCESSO,
  tipoProcessoValido,
  type Direcao,
  type OrdemProcesso,
} from "@/lib/juridico-constantes"

import { NovoProcessoForm } from "./processo-forms"

export const metadata: Metadata = { title: "Processos — Confluir" }

const CAMPO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const PADRAO_POR_PAGINA = 30

type Params = Record<string, string | undefined>

export default async function ProcessosPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("juridico_geral", [
    "juridico_gestao",
    "juridico_homologacoes",
  ])

  const p = await searchParams
  const salvos = Number(p.salvos) > 0 ? Number(p.salvos) : 0
  const ordem = lerOrdemProcesso(p.ordem)
  const direcao = lerDirecao(p.dir)
  const { pagina, porPagina } = lerPaginacao(p, PADRAO_POR_PAGINA)

  const andamentoBruto = p.andamento ?? ""
  const naturezaBruta = p.natureza ?? ""
  const filtros: FiltrosProcesso = {
    busca: (p.busca ?? "").trim(),
    tipo: tipoProcessoValido(p.tipo ?? "") ? p.tipo : "",
    status: statusProcessoValido(p.status ?? "") ? p.status : "",
    andamento: filtroAndamentoValido(andamentoBruto) ? andamentoBruto : "todos",
    natureza: filtroNaturezaValido(naturezaBruta) ? naturezaBruta : "todas",
    filiadoId: p.filiado ?? "",
  }

  const [{ linhas: todos, disponivel }, responsaveis, fornecedores] =
    await Promise.all([
      listarProcessos({ filtros, ordem, dir: direcao, limite: 1000 }),
      listarUsuariosAtivos(),
      listarFornecedores(),
    ])
  const escritorios = fornecedores.map((f) => ({
    id: f.id,
    nome: f.nome,
    cnpj_cpf: f.cnpj_cpf,
    bloqueado: f.bloqueado,
  }))

  const { linhas, total, totalPaginas } = paginar(todos, { pagina, porPagina })

  const temFiltro =
    Boolean(filtros.busca || filtros.tipo || filtros.status || filtros.filiadoId) ||
    filtros.andamento !== "todos" ||
    filtros.natureza !== "todas"

  const efemeros = ["ordem", "dir", "pagina", "salvos"]
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (v && !efemeros.includes(k)) qs.set(k, v)
  }
  const linkOrdem = (chave: OrdemProcesso) => {
    const q = new URLSearchParams(qs)
    q.set("ordem", chave)
    q.set("dir", ordem === chave && direcao === "desc" ? "asc" : "desc")
    return `/painel/juridico/processos?${q}`
  }
  const qsExport = new URLSearchParams(qs)
  qsExport.set("ordem", ordem)
  qsExport.set("dir", direcao)

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
          <Link href="/painel/juridico">
            <ArrowLeft />
            Jurídico
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Processos</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {total.toLocaleString("pt-BR")}{" "}
              {total === 1 ? "processo" : "processos"}
              {temFiltro ? " com os filtros atuais" : ""}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/painel/juridico/processos/exportar?${qsExport}`}>
              <Download />
              Exportar CSV
            </Link>
          </Button>
        </div>
      </div>

      {salvos > 0 && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>Processo salvo com sucesso.</AlertDescription>
        </Alert>
      )}

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            As colunas de Processos ainda não estão disponíveis — rode{" "}
            <code>supabase/juridico-processos.sql</code> no SQL Editor do
            Supabase para liberar a listagem e o cadastro.
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Novo processo"
        descricao="Cadastre uma ação judicial acompanhada pelo sindicato"
      >
        <NovoProcessoForm
          buscaFiliadoEndpoint="/painel/juridico/processos/busca-filiado"
          responsaveis={responsaveis.map((u) => ({ id: u.id, nome: u.nome }))}
          escritorios={escritorios}
        />
      </GrupoColapsavel>

      <Card>
        <CardContent>
          <form className="grid gap-3" action="/painel/juridico/processos">
            {porPagina !== PADRAO_POR_PAGINA && (
              <input type="hidden" name="porPagina" value={porPagina} />
            )}
            <input type="hidden" name="ordem" value={ordem} />
            <input type="hidden" name="dir" value={direcao} />
            {filtros.filiadoId && (
              <input type="hidden" name="filiado" value={filtros.filiadoId} />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                name="busca"
                defaultValue={filtros.busca}
                placeholder="Número, filiado, parte, responsável…"
                className={`${CAMPO} w-80 max-w-full`}
              />
              <select name="tipo" defaultValue={filtros.tipo} className={CAMPO}>
                <option value="">Todas as áreas</option>
                {TIPOS_PROCESSO.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select name="status" defaultValue={filtros.status} className={CAMPO}>
                <option value="">Todos os status</option>
                {STATUS_PROCESSO.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                name="andamento"
                defaultValue={filtros.andamento}
                className={CAMPO}
              >
                {FILTROS_ANDAMENTO.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </option>
                ))}
              </select>
              <select
                name="natureza"
                defaultValue={filtros.natureza}
                className={CAMPO}
              >
                {FILTROS_NATUREZA.map((f) => (
                  <option key={f.valor} value={f.valor}>
                    {f.rotulo}
                  </option>
                ))}
              </select>

              <Button type="submit" variant="outline" size="sm">
                <Filter />
                Filtrar
              </Button>
              {temFiltro && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/painel/juridico/processos">
                    <X />
                    Limpar
                  </Link>
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              <Gavel className="mx-auto mb-2 size-5" />
              Nenhum processo encontrado com estes filtros.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <Coluna chave="numero" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <Coluna chave="data" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <Coluna chave="tipo" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <TableHead>Natureza</TableHead>
                      <TableHead>Filiados</TableHead>
                      <TableHead>Responsável</TableHead>
                      <Coluna chave="status" ordem={ordem} dir={direcao} href={linkOrdem} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((pr) => (
                      <TableRow key={pr.id}>
                        <TableCell className="max-w-52">
                          <Link
                            href={`/painel/juridico/processos/${pr.id}`}
                            className="text-primary font-medium tabular-nums hover:underline"
                          >
                            <span className="line-clamp-1">
                              {pr.numero_processo ?? "(sem número)"}
                            </span>
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatarData(pr.data_abertura)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm">
                          {pr.tipo ?? "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant={pr.coletivo ? "secondary" : "outline"}>
                            {pr.coletivo ? "Coletivo" : "Individual"}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-56">
                          {pr.filiados.length === 0 ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            <span className="line-clamp-1 text-sm">
                              {pr.filiados[0].nome ?? "(sem nome)"}
                              {pr.filiados.length > 1 && (
                                <span className="text-muted-foreground">
                                  {" "}
                                  +{pr.filiados.length - 1}
                                </span>
                              )}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-40">
                          <span className="line-clamp-1 text-sm">
                            {pr.responsavel ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={pr.finalizado ? "outline" : "secondary"}
                          >
                            {pr.status_processo ??
                              (pr.finalizado ? "Finalizado" : "Em andamento")}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              <Paginacao
                total={total}
                pagina={pagina}
                totalPaginas={totalPaginas}
                porPagina={porPagina}
                padrao={PADRAO_POR_PAGINA}
              />
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Coluna({
  chave,
  ordem,
  dir,
  href,
}: {
  chave: OrdemProcesso
  ordem: OrdemProcesso
  dir: Direcao
  href: (c: OrdemProcesso) => string
}) {
  const ativa = ordem === chave
  const rotulo = ORDENS_PROCESSO.find((o) => o.valor === chave)?.rotulo ?? chave
  return (
    <TableHead>
      <Link
        href={href(chave)}
        className="hover:text-foreground inline-flex items-center gap-1 whitespace-nowrap"
        aria-sort={ativa ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {rotulo}
        {ativa &&
          (dir === "asc" ? (
            <ArrowUp className="size-3.5" />
          ) : (
            <ArrowDown className="size-3.5" />
          ))}
      </Link>
    </TableHead>
  )
}
