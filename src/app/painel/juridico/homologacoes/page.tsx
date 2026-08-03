import type { Metadata } from "next"
import Link from "next/link"
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CircleCheck,
  Download,
  FileSignature,
  Filter,
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
import { listarHomologacoes, type FiltrosHomologacao } from "@/lib/db/juridico"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { formatarCnpjCpf, formatarData } from "@/lib/formato"
import { formatarCpf } from "@/lib/cpf"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import {
  FILTROS_FILIACAO,
  filtroFiliacaoValido,
  lerDirecao,
  lerOrdem,
  MOTIVOS_RESCISAO,
  motivoValido,
  ORDENS,
  type Direcao,
  type Ordem,
} from "@/lib/juridico-constantes"

import { NovaHomologacaoForm } from "./homologacao-forms"

export const metadata: Metadata = { title: "Homologações — Confluir" }

const CAMPO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

const PADRAO_POR_PAGINA = 30

type Params = Record<string, string | undefined>

export default async function HomologacoesPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("juridico_geral", [
    "juridico_gestao",
    "juridico_homologacoes",
  ])

  const p = await searchParams
  const salvas = Number(p.salvas) > 0 ? Number(p.salvas) : 0
  const ordem = lerOrdem(p.ordem)
  const direcao = lerDirecao(p.dir)
  const { pagina, porPagina } = lerPaginacao(p, PADRAO_POR_PAGINA)

  const filiacaoBruta = p.filiacao ?? ""
  const filtros: FiltrosHomologacao = {
    busca: (p.busca ?? "").trim(),
    ano: /^\d{4}$/.test(p.ano ?? "") ? p.ano : "",
    motivo: motivoValido(p.motivo ?? "") ? p.motivo : "",
    filiacao: filtroFiliacaoValido(filiacaoBruta) ? filiacaoBruta : "todos",
    fonteId: p.fonte ?? "",
  }

  const [{ linhas: linhasTodas, disponivel }, fontes] = await Promise.all([
    listarHomologacoes({ filtros, ordem, dir: direcao, limite: 1000 }),
    listarFontesPagadoras(),
  ])

  const { linhas, total, totalPaginas } = paginar(linhasTodas, {
    pagina,
    porPagina,
  })

  const anos = anosDisponiveis(linhasTodas.map((l) => l.data))
  const fonteSelecionada = fontes.find((f) => f.id === filtros.fonteId)

  const temFiltro =
    Boolean(filtros.busca || filtros.ano || filtros.motivo || filtros.fonteId) ||
    filtros.filiacao !== "todos"

  // Preserva filtros ao ordenar; ordem/dir/página são recalculados.
  const efemeros = ["ordem", "dir", "pagina", "salvas"]
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(p)) {
    if (v && !efemeros.includes(k)) qs.set(k, v)
  }
  const linkOrdem = (chave: Ordem) => {
    const q = new URLSearchParams(qs)
    q.set("ordem", chave)
    q.set("dir", ordem === chave && direcao === "desc" ? "asc" : "desc")
    return `/painel/juridico/homologacoes?${q}`
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
            <h1 className="text-2xl font-semibold tracking-tight">
              Homologações
            </h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {total.toLocaleString("pt-BR")}{" "}
              {total === 1 ? "rescisão homologada" : "rescisões homologadas"}
              {temFiltro ? " com os filtros atuais" : ""}
            </p>
          </div>
          <Button variant="outline" asChild>
            <Link href={`/painel/juridico/homologacoes/exportar?${qsExport}`}>
              <Download />
              Exportar CSV
            </Link>
          </Button>
        </div>
      </div>

      {salvas > 0 && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>Homologação salva com sucesso.</AlertDescription>
        </Alert>
      )}

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            As colunas do módulo Jurídico ainda não estão disponíveis — rode{" "}
            <code>supabase/juridico.sql</code> no SQL Editor do Supabase para
            liberar a listagem, a inclusão e o parecer.
          </AlertDescription>
        </Alert>
      )}

      <GrupoColapsavel
        titulo="Nova homologação"
        descricao="Registre uma rescisão homologada — de filiado ou não-filiado"
      >
        <NovaHomologacaoForm
          buscaFiliadoEndpoint="/painel/juridico/homologacoes/busca-filiado"
          fontes={fontes.map((f) => ({
            id: f.id,
            rotulo: nomeFonte(f),
          }))}
        />
      </GrupoColapsavel>

      <Card>
        <CardContent>
          <form className="grid gap-3" action="/painel/juridico/homologacoes">
            {porPagina !== PADRAO_POR_PAGINA && (
              <input type="hidden" name="porPagina" value={porPagina} />
            )}
            <input type="hidden" name="ordem" value={ordem} />
            <input type="hidden" name="dir" value={direcao} />
            {/* Fonte só é escolhida via link do hub — preservada em hidden. */}
            {filtros.fonteId && (
              <input type="hidden" name="fonte" value={filtros.fonteId} />
            )}

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="search"
                name="busca"
                defaultValue={filtros.busca}
                placeholder="Trabalhador, CPF, empregador ou motivo…"
                className={`${CAMPO} w-80 max-w-full`}
              />
              <select name="ano" defaultValue={filtros.ano} className={CAMPO}>
                <option value="">Todos os anos</option>
                {anos.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <select
                name="motivo"
                defaultValue={filtros.motivo}
                className={CAMPO}
              >
                <option value="">Todos os motivos</option>
                {MOTIVOS_RESCISAO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
              <select
                name="filiacao"
                defaultValue={filtros.filiacao}
                className={CAMPO}
              >
                {FILTROS_FILIACAO.map((f) => (
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
                  <Link href="/painel/juridico/homologacoes">
                    <X />
                    Limpar
                  </Link>
                </Button>
              )}
            </div>

            {fonteSelecionada && (
              <p className="text-muted-foreground text-xs">
                Filtrando pelo empregador{" "}
                <strong>{nomeFonte(fonteSelecionada)}</strong>.{" "}
                <Link
                  href="/painel/juridico/homologacoes"
                  className="underline"
                >
                  Remover
                </Link>
              </p>
            )}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          {linhas.length === 0 ? (
            <p className="text-muted-foreground py-10 text-center text-sm">
              <FileSignature className="mx-auto mb-2 size-5" />
              Nenhuma homologação encontrada com estes filtros.
            </p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <Coluna chave="data" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <Coluna chave="trabalhador" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <TableHead>CPF</TableHead>
                      <Coluna chave="empregador" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <Coluna chave="motivo" ordem={ordem} dir={direcao} href={linkOrdem} />
                      <TableHead>Vínculo</TableHead>
                      <TableHead>Parecer</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {linhas.map((h) => (
                      <TableRow key={h.id}>
                        <TableCell className="whitespace-nowrap tabular-nums">
                          <Link
                            href={`/painel/juridico/homologacoes/${h.id}`}
                            className="text-primary font-medium hover:underline"
                          >
                            {formatarData(h.data)}
                          </Link>
                        </TableCell>
                        <TableCell className="max-w-56">
                          <span className="line-clamp-1">
                            {h.trabalhador ?? (
                              <span className="text-muted-foreground italic">
                                não informado
                              </span>
                            )}
                          </span>
                        </TableCell>
                        <TableCell className="whitespace-nowrap font-mono text-xs">
                          {h.cpf ? formatarCpf(h.cpf) : "—"}
                        </TableCell>
                        <TableCell className="max-w-56">
                          <span className="line-clamp-1">
                            {h.empregador ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell className="max-w-52">
                          <span className="line-clamp-1 text-sm">
                            {h.motivo ?? "—"}
                          </span>
                        </TableCell>
                        <TableCell>
                          {h.filiado ? (
                            <Badge variant="secondary">Filiado</Badge>
                          ) : (
                            <Badge variant="outline">Não-filiado</Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {h.parecer_url ? (
                            <Badge variant="secondary">Sim</Badge>
                          ) : (
                            <span className="text-muted-foreground text-xs">
                              —
                            </span>
                          )}
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

/** Anos presentes nos dados, mais recentes primeiro. */
function anosDisponiveis(datas: (string | null)[]): string[] {
  const anos = new Set<string>()
  for (const d of datas) {
    const m = /^(\d{4})-/.exec(d ?? "")
    if (m) anos.add(m[1])
  }
  return [...anos].sort((a, b) => b.localeCompare(a))
}

function nomeFonte(f: {
  nome_fantasia: string | null
  nome_razao: string | null
  cnpj_cpf: string | null
}): string {
  const nome = f.nome_fantasia ?? f.nome_razao ?? "(sem nome)"
  return f.cnpj_cpf ? `${nome} — ${formatarCnpjCpf(f.cnpj_cpf)}` : nome
}

function Coluna({
  chave,
  ordem,
  dir,
  href,
}: {
  chave: Ordem
  ordem: Ordem
  dir: Direcao
  href: (c: Ordem) => string
}) {
  const ativa = ordem === chave
  const rotulo = ORDENS.find((o) => o.valor === chave)?.rotulo ?? chave
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
