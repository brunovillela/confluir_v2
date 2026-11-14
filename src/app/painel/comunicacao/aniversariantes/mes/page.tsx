import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Cake, ChevronLeft, ChevronRight } from "lucide-react"

import { TileIndicador } from "@/components/graficos/tile"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Paginacao } from "@/components/paginacao"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requirePermissao } from "@/lib/auth"
import { aniversariantesDoMes } from "@/lib/db/aniversariantes-mes"
import { hojeSP } from "@/lib/db/comum"
import { lerPaginacao, paginar } from "@/lib/paginacao"
import { semAcento } from "@/lib/texto"

export const metadata: Metadata = { title: "Aniversariantes do mês — Confluir" }

const MESES = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"]
const SEMANA = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"]
const GRUPOS = [
  { valor: "todos", rotulo: "Todos" },
  { valor: "equipe", rotulo: "Diretores, funcionários e prestadores" },
  { valor: "filiados", rotulo: "Filiados" },
] as const

/**
 * Aniversariantes do mês: o quadro da entidade (diretores, funcionários,
 * prestadores, aprendizes e estagiários) e os filiados ativos, numa lista
 * por dia. Quem é das duas coisas aparece uma vez, com os dois rótulos.
 */
export default async function AniversariantesDoMesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>
}) {
  await requirePermissao("comunicacao_mensagens")
  const sp = await searchParams
  const hoje = hojeSP()
  const [anoHoje, mesHoje, diaHoje] = hoje.split("-").map(Number)
  const m = /^(\d{4})-(\d{2})$/.exec(sp.mes ?? "")
  const ano = m ? Number(m[1]) : anoHoje
  const mes = m && Number(m[2]) >= 1 && Number(m[2]) <= 12 ? Number(m[2]) : mesHoje
  const grupo = GRUPOS.some((g) => g.valor === sp.grupo) ? (sp.grupo as (typeof GRUPOS)[number]["valor"]) : "todos"
  const busca = (sp.busca ?? "").trim()

  const todos = await aniversariantesDoMes(ano, mes)
  const doGrupo = todos.filter((p) => grupo === "todos" || (grupo === "equipe" ? p.equipe : p.filiado))
  const termo = semAcento(busca.toLowerCase())
  const filtrados = termo ? doGrupo.filter((p) => semAcento(p.nome.toLowerCase()).includes(termo)) : doGrupo
  const paginacao = lerPaginacao(sp, 50)
  const pagina = paginar(filtrados, paginacao)

  const ehEsteMes = ano === anoHoje && mes === mesHoje
  const doMesVizinho = (delta: number) => {
    const d = new Date(Date.UTC(ano, mes - 1 + delta, 1))
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
  }
  const url = (extras: Record<string, string | null>) => {
    const q = new URLSearchParams()
    const atual: Record<string, string | null> = { mes: `${ano}-${String(mes).padStart(2, "0")}`, grupo, busca: busca || null, ...extras }
    for (const [k, v] of Object.entries(atual)) if (v && !(k === "grupo" && v === "todos")) q.set(k, v)
    return `/painel/comunicacao/aniversariantes/mes?${q}`
  }
  const diaDaSemana = (dia: number) => SEMANA[new Date(Date.UTC(ano, mes - 1, dia)).getUTCDay()]
  const hojeAinda = ehEsteMes ? todos.filter((p) => p.dia >= diaHoje).length : null

  return (
    <>
      <RotuloTrilha valores={{ mes: "Do mês" }} />
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/comunicacao/aniversariantes">
            <ArrowLeft />
            Aniversariantes do dia
          </Link>
        </Button>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">
            Aniversariantes de {MESES[mes - 1]}
            {ano !== anoHoje && ` de ${ano}`}
          </h1>
          <div className="flex items-center gap-1">
            <Button asChild variant="outline" size="sm">
              <Link href={url({ mes: doMesVizinho(-1) })} aria-label="Mês anterior">
                <ChevronLeft />
                {MESES[(mes + 10) % 12]}
              </Link>
            </Button>
            {!ehEsteMes && (
              <Button asChild variant="ghost" size="sm">
                <Link href={url({ mes: null })}>Este mês</Link>
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link href={url({ mes: doMesVizinho(1) })} aria-label="Próximo mês">
                {MESES[mes % 12]}
                <ChevronRight />
              </Link>
            </Button>
          </div>
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          Diretores, funcionários, prestadores, aprendizes e estagiários (o quadro da entidade) e os filiados ativos.
          Quem é das duas coisas aparece uma vez.
        </p>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <TileIndicador rotulo="No mês" valor={todos.length.toLocaleString("pt-BR")} />
        <TileIndicador
          rotulo="Diretores, funcionários e prestadores"
          valor={todos.filter((p) => p.equipe).length.toLocaleString("pt-BR")}
        />
        <TileIndicador rotulo="Filiados ativos" valor={todos.filter((p) => p.filiado).length.toLocaleString("pt-BR")} />
        {ehEsteMes ? (
          <TileIndicador
            rotulo="Hoje"
            valor={String(todos.filter((p) => p.dia === diaHoje).length)}
            nota={`${(hojeAinda ?? 0).toLocaleString("pt-BR")} ainda neste mês, contando hoje`}
          />
        ) : (
          <TileIndicador
            rotulo="Da equipe e filiados"
            valor={String(todos.filter((p) => p.equipe && p.filiado).length)}
            nota="contados uma vez só"
          />
        )}
      </section>

      <div className="flex flex-wrap items-center gap-2">
        <nav className="flex gap-1 border-b text-sm" aria-label="Quem">
          {GRUPOS.map((g) => (
            <Link
              key={g.valor}
              scroll={false}
              href={url({ grupo: g.valor })}
              className={`-mb-px border-b-2 px-3 py-2 ${grupo === g.valor ? "border-primary font-medium" : "text-muted-foreground hover:text-foreground border-transparent"}`}
            >
              {g.rotulo}
            </Link>
          ))}
        </nav>
        <form className="ml-auto flex gap-2" action="/painel/comunicacao/aniversariantes/mes">
          <input type="hidden" name="mes" value={`${ano}-${String(mes).padStart(2, "0")}`} />
          {grupo !== "todos" && <input type="hidden" name="grupo" value={grupo} />}
          <Input name="busca" defaultValue={busca} placeholder="Buscar por nome" aria-label="Buscar por nome" className="w-56" />
          <Button type="submit" variant="secondary" size="sm" className="h-9">
            Buscar
          </Button>
        </form>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50">
              <TableHead className="w-24">Dia</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead>Quem é</TableHead>
              <TableHead className="text-right">Idade que completa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {pagina.total === 0 && (
              <TableRow>
                <TableCell colSpan={4} className="h-28">
                  <div className="text-muted-foreground flex flex-col items-center justify-center gap-2 text-center">
                    <Cake className="size-6" />
                    <p className="text-sm">Ninguém {busca ? "com esse nome " : ""}faz aniversário neste mês.</p>
                  </div>
                </TableCell>
              </TableRow>
            )}
            {pagina.linhas.map((p) => {
              const ehHoje = ehEsteMes && p.dia === diaHoje
              return (
                <TableRow key={p.chave} className={ehHoje ? "bg-success/10" : ""}>
                  <TableCell className="tabular-nums">
                    {String(p.dia).padStart(2, "0")}/{String(mes).padStart(2, "0")}
                    <span className="text-muted-foreground"> · {ehHoje ? "hoje" : diaDaSemana(p.dia)}</span>
                  </TableCell>
                  <TableCell className="font-medium">
                    {p.filiacaoId ? (
                      <Link href={`/painel/filiados/${p.filiacaoId}`} className="hover:underline">
                        {p.nome}
                      </Link>
                    ) : (
                      p.nome
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {p.quem.map((q) => (
                        <Badge key={q} variant="outline" className={q === "Filiado(a)" ? "" : "border-primary/40"}>
                          {q}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{p.idade ? `${p.idade} anos` : "—"}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
      <Paginacao total={pagina.total} pagina={pagina.pagina} totalPaginas={pagina.totalPaginas} porPagina={paginacao.porPagina} padrao={50} />
    </>
  )
}
