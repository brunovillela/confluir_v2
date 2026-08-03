import type { Metadata } from "next"
import Link from "next/link"
import { CircleCheck, Plus, ShieldCheck, TriangleAlert } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Paginacao } from "@/components/paginacao"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { listarReunioesCipa, resumoCipa, SITUACOES_CIPA } from "@/lib/db/cipa"
import { formatarData } from "@/lib/formato"
import { lerPaginacao, paginar } from "@/lib/paginacao"

export const metadata: Metadata = { title: "CIPA — Confluir" }

const CAMPO =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export function SituacaoBadge({ situacao }: { situacao: string }) {
  const rotulo =
    SITUACOES_CIPA.find((s) => s.valor === situacao)?.rotulo ?? situacao
  if (situacao === "compareceu") return <Badge variant="success">{rotulo}</Badge>
  if (situacao === "recusado" || situacao === "nao_compareceu") {
    return <Badge variant="warning">{rotulo}</Badge>
  }
  return <Badge variant="outline">{rotulo}</Badge>
}

export default async function CipaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("saude_cat", ["saude_atendimento", "saude_gestao"])

  const p = await searchParams
  const situacao = p.situacao ?? ""
  const de = p.de ?? ""
  const ate = p.ate ?? ""

  const [{ linhas, disponivel }, resumo] = await Promise.all([
    listarReunioesCipa({
      situacao: situacao || undefined,
      de: de || undefined,
      ate: ate || undefined,
    }),
    resumoCipa(),
  ])

  const pag = lerPaginacao(p, 30)
  const { linhas: pagina, ...info } = paginar(linhas, pag)

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">CIPA</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Reuniões nas empresas, representação e pauta
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/painel/saude/cipa/nova">
              <Plus />
              Registrar convite
            </Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/painel/saude">Voltar ao módulo</Link>
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <TriangleAlert />
          <AlertDescription>
            CIPA ainda não configurada — rode{" "}
            <code>supabase/saude-cipa.sql</code>.
          </AlertDescription>
        </Alert>
      )}

      {p.excluido && (
        <Alert variant="success">
          <CircleCheck />
          <AlertDescription>Registro excluído.</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Tile rotulo="Convites" valor={resumo.total} />
        <Tile rotulo="Comparecemos" valor={resumo.compareceu} />
        <Tile
          rotulo="Sem representação"
          valor={resumo.naoCompareceu + resumo.recusado}
        />
        <Tile rotulo="Aguardando" valor={resumo.aguardando} />
      </div>

      {resumo.porEmpresa.length > 0 && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">
              Frequência por empresa
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="w-28">Convites</TableHead>
                  <TableHead className="w-32">Comparecemos</TableHead>
                  <TableHead className="w-24">Taxa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {resumo.porEmpresa.slice(0, 10).map((e) => (
                  <TableRow key={e.empresaId}>
                    <TableCell className="font-medium">{e.nome}</TableCell>
                    <TableCell className="tabular-nums">{e.convites}</TableCell>
                    <TableCell className="tabular-nums">
                      {e.compareceu}
                    </TableCell>
                    <TableCell className="tabular-nums">
                      {Math.round((e.compareceu / e.convites) * 100)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <form className="flex flex-wrap items-end gap-2" action="/painel/saude/cipa">
        <div className="grid gap-1">
          <label htmlFor="situacao" className="text-muted-foreground text-xs">
            Situação
          </label>
          <select id="situacao" name="situacao" defaultValue={situacao} className={CAMPO}>
            <option value="">Todas</option>
            {SITUACOES_CIPA.map((s) => (
              <option key={s.valor} value={s.valor}>
                {s.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="grid gap-1">
          <label htmlFor="de" className="text-muted-foreground text-xs">
            De
          </label>
          <input id="de" type="date" name="de" defaultValue={de} className={CAMPO} />
        </div>
        <div className="grid gap-1">
          <label htmlFor="ate" className="text-muted-foreground text-xs">
            Até
          </label>
          <input id="ate" type="date" name="ate" defaultValue={ate} className={CAMPO} />
        </div>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
        {(situacao || de || ate) && (
          <Button variant="ghost" size="sm" asChild>
            <Link href="/painel/saude/cipa">Limpar</Link>
          </Button>
        )}
      </form>

      <Card>
        <CardContent>
          {pagina.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <ShieldCheck className="mx-auto mb-2 size-5" />
              Nenhuma reunião registrada.
            </p>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Data</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Unidade</TableHead>
                    <TableHead>Tipo</TableHead>
                    <TableHead>Situação</TableHead>
                    <TableHead>Representantes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pagina.map((r) => {
                    const presentes = r.representantes.filter(
                      (x) => x.compareceu
                    ).length
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="whitespace-nowrap">
                          <Link
                            href={`/painel/saude/cipa/${r.id}`}
                            className="text-primary hover:underline"
                          >
                            {formatarData(r.data_reuniao)}
                          </Link>
                        </TableCell>
                        <TableCell className="font-medium">
                          {r.empresaNome ?? "—"}
                        </TableCell>
                        <TableCell>{r.unidade ?? "—"}</TableCell>
                        <TableCell>
                          <div className="flex flex-wrap gap-1">
                            <Badge variant="outline">
                              {r.ordinaria === false
                                ? "Extraordinária"
                                : "Ordinária"}
                            </Badge>
                            {r.online && <Badge variant="outline">Online</Badge>}
                            {r.demanda_embarque && (
                              <Badge variant="outline">Embarque</Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <SituacaoBadge situacao={r.situacao} />
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {r.representantes.length === 0 ? (
                            <span className="text-muted-foreground text-xs">
                              nenhum
                            </span>
                          ) : (
                            <>
                              {presentes}/{r.representantes.length}
                              <span className="text-muted-foreground ml-1 text-xs">
                                presentes
                              </span>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
              <Paginacao {...info} porPagina={pag.porPagina} padrao={30} />
            </>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function Tile({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <Card>
      <CardContent>
        <p className="text-muted-foreground text-xs">{rotulo}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">
          {valor.toLocaleString("pt-BR")}
        </p>
      </CardContent>
    </Card>
  )
}
