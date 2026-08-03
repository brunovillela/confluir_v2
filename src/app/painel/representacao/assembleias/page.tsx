import type { Metadata } from "next"
import Link from "next/link"
import { Plus, Vote } from "lucide-react"

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
import { listarCampanhas, resumoAssembleias } from "@/lib/db/assembleias"
import { formatarData } from "@/lib/formato"

export const metadata: Metadata = { title: "Assembleias — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = {
  busca?: string
  situacao?: string
  pagina?: string
}

export default async function AssembleiasPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("assembleias")

  const brutos = await searchParams
  const situacao =
    brutos.situacao === "abertas" || brutos.situacao === "finalizadas"
      ? brutos.situacao
      : "todas"
  const busca = (brutos.busca ?? "").trim()
  const pagina = Number(brutos.pagina) > 0 ? Number(brutos.pagina) : 1

  const [resumo, lista] = await Promise.all([
    resumoAssembleias(),
    listarCampanhas({ busca, situacao, pagina }),
  ])

  const filtrosQuery = (mudancas: Record<string, string>) => {
    const q = new URLSearchParams()
    const estado: Record<string, string> = { busca, situacao, ...mudancas }
    for (const [chave, valor] of Object.entries(estado)) {
      if (valor && valor !== "todas") q.set(chave, valor)
    }
    const s = q.toString()
    return s ? `?${s}` : ""
  }

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Assembleias</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Campanhas de votação, rodadas de assembleias e apuração
          </p>
        </div>
        <Button asChild>
          <Link href="/painel/representacao/assembleias/campanhas/nova">
            <Plus />
            Nova campanha
          </Link>
        </Button>
      </div>

      {!resumo.esquemaPronto && (
        <Alert variant="warning">
          <AlertDescription>
            Assembleias ainda não configuradas por completo — rode{" "}
            <code>supabase/assembleias.sql</code> no SQL Editor do Supabase
            para habilitar o vínculo com fontes pagadoras, o vínculo
            assembleia→rodada e os índices de votação.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <CardResumo rotulo="Campanhas" valor={resumo.campanhas} />
        <CardResumo
          rotulo="Campanhas abertas"
          valor={resumo.campanhasAbertas}
          href={filtrosQuery({ situacao: "abertas", pagina: "" })}
        />
        <CardResumo rotulo="Rodadas em andamento" valor={resumo.rodadasAbertas} />
        <CardResumo rotulo="Votos online (total)" valor={resumo.votosOnline} />
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/representacao/assembleias"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Tema da campanha"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="situacao" defaultValue={situacao} className={SELECT_FILTRO}>
          <option value="todas">Abertas e finalizadas</option>
          <option value="abertas">Abertas</option>
          <option value="finalizadas">Finalizadas</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          {lista.linhas.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">
              <Vote className="mx-auto mb-2 size-5" />
              Nenhuma campanha encontrada com estes filtros.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tema</TableHead>
                  <TableHead>Fontes pagadoras</TableHead>
                  <TableHead className="text-right">Rodadas</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Registro</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lista.linhas.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="max-w-96">
                      <Link
                        href={`/painel/representacao/assembleias/campanhas/${c.id}`}
                        className="text-primary line-clamp-2 font-medium hover:underline"
                      >
                        {c.tema ?? "(sem tema)"}
                      </Link>
                    </TableCell>
                    <TableCell className="max-w-72">
                      {c.fontes.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span className="line-clamp-2">
                          {c.fontes.join(", ")}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {c.rodadas}
                    </TableCell>
                    <TableCell>
                      <Badge variant={c.finalizado ? "secondary" : "info"}>
                        {c.finalizado ? "Finalizada" : "Aberta"}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {formatarData(c.created_at)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          {lista.totalPaginas > 1 && (
            <div className="text-muted-foreground mt-4 flex flex-wrap items-center justify-between gap-3 text-sm">
              <span className="tabular-nums">
                Página {lista.pagina} de {lista.totalPaginas} ·{" "}
                {lista.total.toLocaleString("pt-BR")} campanhas
              </span>
              <div className="flex gap-2">
                {lista.pagina > 1 && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={filtrosQuery({ pagina: String(lista.pagina - 1) })}>
                      Anterior
                    </Link>
                  </Button>
                )}
                {lista.pagina < lista.totalPaginas && (
                  <Button variant="outline" size="sm" asChild>
                    <Link href={filtrosQuery({ pagina: String(lista.pagina + 1) })}>
                      Próxima
                    </Link>
                  </Button>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}

function CardResumo({
  rotulo,
  valor,
  href,
}: {
  rotulo: string
  valor: number
  href?: string
}) {
  const conteudo = (
    <CardContent>
      <p className="text-muted-foreground text-xs">{rotulo}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">
        {valor.toLocaleString("pt-BR")}
      </p>
    </CardContent>
  )
  if (!href) return <Card>{conteudo}</Card>
  return (
    <Link href={href} className="group">
      <Card className="group-hover:border-primary/40 transition-colors">
        {conteudo}
      </Card>
    </Link>
  )
}
