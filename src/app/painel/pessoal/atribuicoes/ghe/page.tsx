import type { Metadata } from "next"
import Link from "next/link"
import { ArrowLeft, Lightbulb, Users } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { listarGhes, sugerirGhes } from "@/lib/db/pessoal-sst"

import { CriarGheDaSugestao, GheForm } from "./ghe-clientes"

export const metadata: Metadata = {
  title: "Grupos Homogêneos de Exposição — Confluir",
}

export default async function GhePage({
  searchParams,
}: {
  searchParams: Promise<{ excluido?: string }>
}) {
  await requirePermissao("pessoal_gestao")
  const { excluido } = await searchParams
  const [ghes, sugestoes] = await Promise.all([listarGhes(), sugerirGhes()])

  return (
    <>
      <div>
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-3">
          <Link href="/painel/pessoal/atribuicoes">
            <ArrowLeft />
            Atribuições
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          Grupos Homogêneos de Exposição (GHE)
        </h1>
        <p className="text-muted-foreground mt-1 text-xs">
          Trabalhadores com exposição semelhante aos mesmos perigos (mesmas
          tarefas, tempos comparáveis) avaliados em grupo. Quem tem mais tempo
          numa tarefa tem mais probabilidade de sofrer com os perigos dela.
        </p>
      </div>

      {excluido === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>GHE excluído.</AlertDescription>
        </Alert>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">GHEs cadastrados</CardTitle>
            <CardDescription>
              {ghes.length} grupo{ghes.length === 1 ? "" : "s"} — abra um para
              gerenciar membros e ver o perfil de exposição.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ghes.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                Nenhum GHE ainda. Crie manualmente ao lado ou aproveite as
                sugestões abaixo.
              </p>
            ) : (
              <ul className="divide-y rounded-lg border">
                {ghes.map((g) => (
                  <li key={g.id}>
                    <Link
                      href={`/painel/pessoal/atribuicoes/ghe/${g.id}`}
                      className="hover:bg-muted/50 flex items-center gap-2 px-3 py-2 text-sm"
                    >
                      <Users className="text-muted-foreground size-4" />
                      <span className="flex-1 font-medium hover:underline">
                        {g.nome ?? "(sem nome)"}
                      </span>
                      <span className="text-muted-foreground text-xs">
                        {g.membros} membro{g.membros === 1 ? "" : "s"}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Novo GHE</CardTitle>
            <CardDescription>
              Crie o grupo e depois adicione os funcionários na página do GHE.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <GheForm />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            <Lightbulb className="mr-1 inline size-4 align-[-3px]" />
            Sugestões de agrupamento
          </CardTitle>
          <CardDescription>
            Funcionários com o MESMO conjunto de tarefas executadas — candidatos
            naturais a um GHE. Revise antes de criar: exposição homogênea também
            depende dos tempos serem comparáveis.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          {sugestoes.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              Nenhuma sugestão no momento — surgem quando 2+ funcionários (ainda
              não agrupados juntos) compartilham exatamente as mesmas tarefas.
            </p>
          ) : (
            sugestoes.map((s, i) => (
              <div key={i} className="rounded-lg border p-3">
                <p className="text-sm font-medium">
                  {s.funcionarios
                    .map((f) => f.nome ?? "(sem nome)")
                    .join(", ")}
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  Tarefas em comum: {s.tarefas.join(", ")}
                </p>
                <div className="mt-2">
                  <CriarGheDaSugestao
                    nomeSugerido={`GHE — ${s.tarefas[0] ?? "grupo"}`}
                    descricao={`Grupo sugerido pelas tarefas em comum: ${s.tarefas.join(", ")}.`}
                    membros={s.funcionarios.map((f) => f.funcionarioId)}
                  />
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>
    </>
  )
}
