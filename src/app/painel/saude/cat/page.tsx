import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDown,
  ArrowUp,
  CircleCheck,
  ClipboardList,
  Download,
  Filter,
  Plus,
  X,
} from "lucide-react"

import { Paginacao } from "@/components/paginacao"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { facetasCat, listarCats, type FiltrosCat } from "@/lib/db/saude"
import { formatarData } from "@/lib/formato"
import { lerPaginacao } from "@/lib/paginacao"
import { podeAcessar } from "@/lib/permissoes"
import {
  FILTROS_BOOLEANOS,
  lerDirecao,
  lerOrdem,
  ORDENS_CAT,
  OPCOES_REVISAO,
  rotuloTipoAcidente,
  TIPOS_ACIDENTE,
  type FiltroBooleano,
  type OrdemCat,
} from "@/lib/saude-constantes"

export const metadata: Metadata = { title: "CATs — Confluir" }

const CAMPO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const PADRAO_POR_PAGINA = 30

type Params = Record<string, string | undefined>

export default async function CatsPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  const sessao = await requirePermissao("saude_cat", [
    "saude_atendimento",
    "saude_gestao",
  ])
  const podeIncluir = podeAcessar(sessao.permissoes, "saude_cat", [
    "saude_gestao",
  ])

  const p = await searchParams
  const importadas = Number(p.importadas) > 0 ? Number(p.importadas) : 0
  const ignoradas = Number(p.ignoradas) > 0 ? Number(p.ignoradas) : 0
  const ordem = lerOrdem(p.ordem)
  const direcao = lerDirecao(p.dir)
  const { pagina, porPagina } = lerPaginacao(p, PADRAO_POR_PAGINA)

  // As facetas vêm antes porque o município selecionado precisa das
  // variantes de grafia do grupo para virar filtro.
  const facetas = await facetasCat()
  const grupoMunicipio = facetas.municipios.find((m) => m.chave === p.municipio)

  const filtros: FiltrosCat = {
    busca: (p.busca ?? "").trim(),
    ano: p.ano ?? "",
    tipo: p.tipo ?? "",
    uf: p.uf ?? "",
    municipio: grupoMunicipio?.chave ?? "",
    municipioVariantes: grupoMunicipio?.variantes ?? [],
    revisao: OPCOES_REVISAO.some((o) => o.valor === p.revisao)
      ? (p.revisao as string)
      : "todas",
    vinculo:
      p.vinculo === "vinculados" || p.vinculo === "sem_vinculo"
        ? p.vinculo
        : "",
    booleanos: Object.fromEntries(
      (Object.keys(FILTROS_BOOLEANOS) as FiltroBooleano[])
        .map((k) => [k, p[k] ?? ""] as const)
        .filter(([, v]) => v === "sim" || v === "nao")
    ),
  }

  const { linhas, total, disponivel } = await listarCats(
    filtros,
    ordem,
    direcao,
    pagina,
    porPagina
  )

  const totalPaginas = Math.max(1, Math.ceil(total / porPagina))
  const temFiltro =
    Boolean(
      filtros.busca ||
        filtros.ano ||
        filtros.tipo ||
        filtros.uf ||
        filtros.municipio
    ) ||
    filtros.revisao !== "todas" ||
    Boolean(filtros.vinculo) ||
    Object.keys(filtros.booleanos).length > 0

  // Preserva filtros ao trocar a coluna de ordenação. Fora: ordenação e
  // página (recalculadas) e os avisos de importação, que não devem
  // reaparecer a cada clique no cabeçalho.
  const efemeros = ["ordem", "dir", "pagina", "importadas", "ignoradas"]
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (v && !efemeros.includes(k)) qs.set(k, v)
  }
  const linkOrdem = (chave: OrdemCat) => {
    const q = new URLSearchParams(qs)
    q.set("ordem", chave)
    q.set("dir", ordem === chave && direcao === "desc" ? "asc" : "desc")
    return `/painel/saude/cat?${q}`
  }

  const qsExport = new URLSearchParams(qs)
  qsExport.set("ordem", ordem)
  qsExport.set("dir", direcao)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Comunicações de Acidente de Trabalho
          </h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {total.toLocaleString("pt-BR")}{" "}
            {total === 1 ? "registro" : "registros"}
            {temFiltro ? " com os filtros atuais" : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link href={`/painel/saude/cat/exportar?${qsExport}`}>
              <Download />
              Exportar CSV
            </Link>
          </Button>
          {podeIncluir && (
            <Button asChild>
              <Link href="/painel/saude/cat/nova">
                <Plus />
                Incluir CAT
              </Link>
            </Button>
          )}
          <Button variant="outline" asChild>
            <Link href="/painel/saude">Voltar ao módulo</Link>
          </Button>
        </div>
      </div>

      {importadas > 0 && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>
            {importadas.toLocaleString("pt-BR")}{" "}
            {importadas === 1 ? "CAT importada" : "CATs importadas"} com
            sucesso.
            {ignoradas > 0 &&
              ` ${ignoradas} ${ignoradas === 1 ? "coluna da planilha não foi reconhecida e foi ignorada" : "colunas da planilha não foram reconhecidas e foram ignoradas"}.`}
          </AlertDescription>
        </Alert>
      )}

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            A tabela de CATs ainda não está disponível — rode{" "}
            <code>supabase/saude-cat-schema.sql</code> no SQL Editor do Supabase.
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent>
          <form className="grid gap-3" action="/painel/saude/cat">
            {/* porPagina viaja junto para não voltar ao padrão ao filtrar */}
            {porPagina !== PADRAO_POR_PAGINA && (
              <input type="hidden" name="porPagina" value={porPagina} />
            )}
            <input type="hidden" name="ordem" value={ordem} />
            <input type="hidden" name="dir" value={direcao} />

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                name="busca"
                defaultValue={filtros.busca}
                placeholder="Nº da CAT, acidentado, empresa, CID, lesão, local…"
                className={`${CAMPO} w-80 max-w-full`}
              />
              <select name="ano" defaultValue={filtros.ano} className={CAMPO}>
                <option value="">Todos os anos</option>
                {facetas.anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select name="tipo" defaultValue={filtros.tipo} className={CAMPO}>
                <option value="">Todos os tipos</option>
                {TIPOS_ACIDENTE.map((t) => (
                  <option key={t.valor} value={t.valor}>
                    {t.rotulo}
                  </option>
                ))}
              </select>
              <select name="uf" defaultValue={filtros.uf} className={CAMPO}>
                <option value="">Todas as UFs</option>
                {facetas.ufs.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
              <select
                name="municipio"
                defaultValue={filtros.municipio}
                className={CAMPO}
              >
                <option value="">Todos os municípios</option>
                {facetas.municipios.map((m) => (
                  <option key={m.chave} value={m.chave}>
                    {m.rotulo}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {(Object.keys(FILTROS_BOOLEANOS) as FiltroBooleano[]).map((k) => (
                <select
                  key={k}
                  name={k}
                  defaultValue={filtros.booleanos[k] ?? ""}
                  className={CAMPO}
                >
                  <option value="">{FILTROS_BOOLEANOS[k].rotulo}: todos</option>
                  <option value="sim">
                    {FILTROS_BOOLEANOS[k].rotulo}: sim
                  </option>
                  <option value="nao">
                    {FILTROS_BOOLEANOS[k].rotulo}: não
                  </option>
                </select>
              ))}
              <select
                name="revisao"
                defaultValue={filtros.revisao}
                className={CAMPO}
              >
                {OPCOES_REVISAO.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
              <select
                name="vinculo"
                defaultValue={filtros.vinculo}
                className={CAMPO}
              >
                <option value="">Filiado: todos</option>
                <option value="vinculados">Filiado: vinculados</option>
                <option value="sem_vinculo">Filiado: sem vínculo</option>
              </select>

              <Button type="submit" variant="outline" size="sm">
                <Filter />
                Filtrar
              </Button>
              {temFiltro && (
                <Button variant="ghost" size="sm" asChild>
                  <Link href="/painel/saude/cat">
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
              <ClipboardList className="mx-auto mb-2 size-5" />
              Nenhuma CAT encontrada com estes filtros.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <Coluna chave="numero" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <Coluna chave="data" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <Coluna chave="trabalhador" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <Coluna chave="empregador" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <TableHead>Tipo</TableHead>
                      <Coluna chave="municipio" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <TableHead>Parte atingida</TableHead>
                      <TableHead>CID</TableHead>
                      <TableHead>Ocorrências</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            href={`/painel/saude/cat/${c.id}`}
                            className="text-primary font-medium whitespace-nowrap tabular-nums hover:underline"
                          >
                            {c.numero_cat ?? "(sem número)"}
                          </Link>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {formatarData(c.data_acidente)}
                        </TableCell>
                        <TableCell className="max-w-56">
                          <span className="line-clamp-1">
                            {c.trabalhador_nome ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-56">
                          <span className="line-clamp-1">
                            {c.empregador_razao_social ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {rotuloTipoAcidente(c.tipo_acidente) ?? "—"}
                        </TableCell>
                        <TableCell className="whitespace-nowrap">
                          {c.local_municipio
                            ? `${c.local_municipio}${c.local_uf ? `/${c.local_uf}` : ""}`
                            : "—"}
                        </TableCell>
                        <TableCell className="max-w-56">
                          <span className="line-clamp-1">
                            {c.parte_atingida ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          {c.cid10 ?? "—"}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            {c.houve_morte === true && (
                              <Badge variant="outline" className="border-warning/40 text-warning-fg">
                                Óbito
                              </Badge>
                            )}
                            {c.afastamento_durante_tratamento === true && (
                              <Badge variant="outline" className="whitespace-nowrap">
                                Afastamento
                              </Badge>
                            )}
                            {c.houve_internacao === true && (
                              <Badge variant="outline">Internação</Badge>
                            )}
                            {c.descricao_truncada === true && (
                              <Badge
                                variant="outline"
                                className="text-muted-foreground whitespace-nowrap"
                                title="Descrição truncada na migração, sem código oficial"
                              >
                                Revisar
                              </Badge>
                            )}
                            {c.filiado_id && (
                              <Badge
                                variant="outline"
                                className="border-success/40 text-success-fg whitespace-nowrap"
                                title="CAT vinculada a um filiado"
                              >
                                Filiado
                              </Badge>
                            )}
                          </div>
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

/** Cabeçalho clicável que alterna asc/desc e indica a ordenação vigente. */
function Coluna({
  chave,
  ordem,
  dir,
  href,
}: {
  chave: OrdemCat
  ordem: OrdemCat
  dir: "asc" | "desc"
  href: (c: OrdemCat) => string
}) {
  const ativa = ordem === chave
  return (
    <TableHead>
      <Link
        href={href(chave)}
        className="hover:text-foreground inline-flex items-center gap-1 whitespace-nowrap"
        aria-sort={ativa ? (dir === "asc" ? "ascending" : "descending") : "none"}
      >
        {ORDENS_CAT[chave].rotulo}
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
