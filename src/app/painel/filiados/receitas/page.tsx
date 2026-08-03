import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Banknote, ListChecks, Pencil, Plus, Receipt, TrendingUp } from "lucide-react"

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
import { requirePermissao } from "@/lib/auth"
import { indicadoresAnuais, listarRemessas } from "@/lib/db/receitas"
import { formatarMoeda } from "@/lib/formato"

export const metadata: Metadata = { title: "Receitas — Confluir" }

const SELECT =
  "border-input bg-background text-foreground h-9 rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

export default async function ReceitasPage({
  searchParams,
}: {
  searchParams: Promise<{ excluida?: string; ano?: string }>
}) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const { excluida, ano } = await searchParams
  const remessas = await listarRemessas()

  const anoDe = (r: (typeof remessas)[number]) =>
    r.ordem ? String(Math.floor(r.ordem / 100)) : (r.ano ?? "—")
  const anos = [...new Set(remessas.map(anoDe))]
    .filter((a) => a !== "—")
    .sort((a, b) => b.localeCompare(a))
  const anoSel =
    ano === "todos" ? "todos" : anos.includes(ano ?? "") ? ano! : (anos[0] ?? "todos")

  const indic = await indicadoresAnuais(anoSel === "todos" ? undefined : anoSel)

  const visiveis =
    anoSel === "todos" ? remessas : remessas.filter((r) => anoDe(r) === anoSel)

  // Agrupa por ano (ordem = AAAAMM, já vem decrescente)
  const porAno = new Map<string, typeof remessas>()
  for (const r of visiveis) {
    const a = anoDe(r)
    if (!porAno.has(a)) porAno.set(a, [])
    porAno.get(a)!.push(r)
  }

  const cards = [
    { rotulo: "Total recebido", valor: formatarMoeda(indic.totalRecebido), icone: Banknote },
    { rotulo: "Contribuições", valor: indic.contribuicoes.toLocaleString("pt-BR"), icone: ListChecks },
    { rotulo: "Remessas", valor: indic.remessas.toLocaleString("pt-BR"), icone: Receipt },
    { rotulo: "Média por contribuição", valor: formatarMoeda(indic.media), icone: TrendingUp },
  ]

  return (
    <>
      <div>
        <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
          <Link href="/painel/filiados">
            <ArrowLeft />
            Filiados
          </Link>
        </Button>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Receitas</h1>
            <p className="text-muted-foreground mt-1 text-xs">
              {remessas.length} remessa{remessas.length === 1 ? "" : "s"} de
              recebimento de contribuições — clique para ver os pagamentos
              informados por fonte pagadora
            </p>
          </div>
          <Button asChild>
            <Link href="/painel/filiados/receitas/nova">
              <Plus />
              Nova remessa
            </Link>
          </Button>
        </div>
      </div>

      {excluida === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Remessa excluída.</AlertDescription>
        </Alert>
      )}

      <form className="flex flex-wrap items-center gap-2">
        <label htmlFor="ano" className="text-muted-foreground text-sm">
          Indicadores de
        </label>
        <select id="ano" name="ano" defaultValue={anoSel} className={SELECT}>
          <option value="todos">Todos os anos</option>
          {anos.map((a) => (
            <option key={a} value={a}>
              {a}
            </option>
          ))}
        </select>
        <Button type="submit" variant="outline" size="sm">
          Aplicar
        </Button>
      </form>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Card key={c.rotulo}>
            <CardContent className="flex items-center justify-between gap-2 py-4">
              <div className="min-w-0">
                <p className="text-muted-foreground text-xs">{c.rotulo}</p>
                <p className="mt-1 truncate text-xl font-semibold tabular-nums">
                  {c.valor}
                </p>
              </div>
              <c.icone className="text-muted-foreground size-5 shrink-0" />
            </CardContent>
          </Card>
        ))}
      </div>

      {[...porAno.entries()].map(([ano, lista]) => (
        <Card key={ano}>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-base">{ano}</CardTitle>
                <CardDescription>
                  {lista.length} remessa{lista.length === 1 ? "" : "s"}
                </CardDescription>
              </div>
              <Receipt className="text-muted-foreground size-4" />
            </div>
          </CardHeader>
          <CardContent className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
            {lista.map((r) => (
              <div
                key={r.id}
                className="hover:bg-muted/60 flex items-center justify-between gap-2 rounded-md border px-3 py-1.5 text-sm transition-colors"
              >
                <Link
                  href={`/painel/filiados/receitas/${r.id}`}
                  className="flex min-w-0 flex-1 items-center justify-between gap-2 py-0.5"
                >
                  <span className="block truncate font-medium">
                    {r.rotulo} {r.tipo ?? ""}
                  </span>
                  {r.aberto === true ? (
                    <Badge
                      variant="outline"
                      className="shrink-0 border-warning/40 text-warning-fg"
                    >
                      Aberta
                    </Badge>
                  ) : (
                    <Badge
                      variant="outline"
                      className="text-muted-foreground shrink-0"
                    >
                      Fechada
                    </Badge>
                  )}
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  asChild
                  className="size-7 shrink-0"
                >
                  <Link
                    href={`/painel/filiados/receitas/${r.id}/editar`}
                    aria-label={`Editar remessa ${r.rotulo} ${r.tipo ?? ""}`}
                  >
                    <Pencil className="size-3.5" />
                  </Link>
                </Button>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </>
  )
}
