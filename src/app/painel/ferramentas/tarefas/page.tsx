import type { Metadata } from "next"
import Link from "next/link"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ListChecks, TriangleAlert } from "lucide-react"

import { requirePermissao } from "@/lib/auth"
import { listarPessoasAtribuiveis, listarTarefas } from "@/lib/db/nucleo"

import { AdicionarTarefa } from "./tarefa-forms"
import { TarefasLista } from "./tarefas-lista"

export const metadata: Metadata = { title: "Tarefas — Confluir" }

const SELECT_FILTRO =
  "border-input bg-background text-foreground h-9 max-w-52 truncate rounded-md border px-3 text-sm shadow-xs outline-none [color-scheme:light] dark:[color-scheme:dark]"

type Params = { busca?: string; status?: string }

export default async function TarefasPage({
  searchParams,
}: {
  searchParams: Promise<Params>
}) {
  await requirePermissao("ferramentas_tarefas", ["ferramentas_demandas"])

  const brutos = await searchParams
  const busca = (brutos.busca ?? "").trim()
  const status =
    brutos.status === "concluidas" ||
    brutos.status === "atrasadas" ||
    brutos.status === "todas"
      ? brutos.status
      : "pendentes"

  const [{ disponivel, tarefas }, pessoas] = await Promise.all([
    listarTarefas({ busca, status }),
    listarPessoasAtribuiveis(),
  ])

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Tarefas</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            Tarefas de demandas, projetos e anomalias — ou avulsas
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/ferramentas/demandas">
              <ListChecks />
              Demandas
            </Link>
          </Button>
          <Button variant="outline" size="sm" asChild>
            <Link href="/painel/ferramentas/anomalias">
              <TriangleAlert />
              Anomalias
            </Link>
          </Button>
        </div>
      </div>

      {!disponivel && (
        <Alert variant="warning">
          <AlertDescription>
            As tarefas usam colunas novas — rode{" "}
            <code>supabase/nucleo-ferramentas.sql</code> no SQL Editor do Supabase
            para habilitá-las.
          </AlertDescription>
        </Alert>
      )}

      {disponivel && (
        <Card>
          <CardContent>
            <p className="mb-3 text-sm font-medium">Nova tarefa avulsa</p>
            <AdicionarTarefa pessoas={pessoas} />
          </CardContent>
        </Card>
      )}

      <form
        className="flex flex-wrap items-center gap-2"
        action="/painel/ferramentas/tarefas"
      >
        <input
          type="search"
          name="busca"
          defaultValue={busca}
          placeholder="Descrição da tarefa"
          className={`${SELECT_FILTRO} w-64 max-w-full`}
        />
        <select name="status" defaultValue={status} className={SELECT_FILTRO}>
          <option value="pendentes">Pendentes</option>
          <option value="atrasadas">Atrasadas</option>
          <option value="concluidas">Concluídas</option>
          <option value="todas">Todas</option>
        </select>
        <Button type="submit" variant="outline" size="sm">
          Filtrar
        </Button>
      </form>

      <Card>
        <CardContent>
          <TarefasLista
            tarefas={tarefas}
            vazio="Nenhuma tarefa com estes filtros."
          />
        </CardContent>
      </Card>
    </>
  )
}
