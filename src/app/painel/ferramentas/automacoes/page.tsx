import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Zap } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarDemandas, listarPessoasAtribuiveis } from "@/lib/db/nucleo"
import { listarRegras } from "@/lib/db/regras"
import { listarEtiquetas } from "@/lib/db/tarefa-extras"
import { formatarDataHora } from "@/lib/formato"

import { AcoesRegra, NovaRegra } from "./regras-forms"

export const metadata: Metadata = { title: "Automações — Confluir" }

/**
 * Automações das tarefas (Onda 3): regras "quando… então…" de uma lista
 * fechada. Uma regra age uma vez por tarefa e ocasião, e não dispara outra.
 */
export default async function AutomacoesPage() {
  await requirePermissao("ferramentas_demandas")
  const [regras, demandas, pessoas, etiquetas] = await Promise.all([
    listarRegras(),
    listarDemandas({ situacao: "abertas" }),
    listarPessoasAtribuiveis(),
    listarEtiquetas(),
  ])

  return (
    <>
      <Button variant="ghost" size="sm" asChild className="self-start">
        <Link href="/painel/ferramentas">
          <ArrowLeft />
          Ferramentas
        </Link>
      </Button>
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
          <Zap className="text-muted-foreground size-5" />
          Automações
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Regras que fazem sozinhas o trabalho repetido das tarefas. Cada uma age uma vez por tarefa e ocasião, e uma regra não
          dispara outra.
        </p>
      </div>

      <Card>
        <CardContent className="grid gap-3">
          <p className="text-sm font-medium">Nova automação</p>
          <NovaRegra
            demandas={demandas.map((d) => ({ id: d.id, nome: d.nome ?? "(sem nome)" }))}
            pessoas={pessoas}
            etiquetas={etiquetas.map((e) => ({ id: e.id, nome: e.nome }))}
          />
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <p className="mb-3 text-sm font-medium">
            Automações <span className="text-muted-foreground font-normal">({regras.length})</span>
          </p>
          {regras.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">
              Nenhuma automação ainda. Exemplo: &quot;Quando uma tarefa atrasar, mudar a prioridade para Alta&quot;.
            </p>
          ) : (
            <ul className="grid divide-y">
              {regras.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="grid min-w-0 gap-0.5">
                    <span className={r.ativa ? "text-sm" : "text-muted-foreground text-sm line-through"}>{r.frase}</span>
                    <span className="text-muted-foreground text-xs">
                      {r.execucoes
                        ? `Agiu ${r.execucoes} ${r.execucoes === 1 ? "vez" : "vezes"}; a última em ${formatarDataHora(r.ultimaEm)}`
                        : "Ainda não agiu"}
                      {r.ativa ? "" : " · desligada"}
                    </span>
                  </div>
                  <AcoesRegra id={r.id} ativa={r.ativa} frase={r.frase} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
