import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, CalendarDays, ExternalLink, Pencil } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterEvento, sedesParaAgenda } from "@/lib/db/agenda"
import { listarDepartamentos } from "@/lib/db/compras"
import { formatarData, formatarDataHora, paraCampoDataHora } from "@/lib/formato"
import { podeAcessar } from "@/lib/permissoes"

import { CompromissoForm, ExcluirCompromissoBotao } from "../agenda-forms"

export const metadata: Metadata = { title: "Evento — Confluir" }

export default async function EventoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ editar?: string; salvo?: string }>
}) {
  const sessao = await requirePermissao("ferramentas_agendas", ["ferramentas_agendas_edicao"])
  const { id } = await params
  const { editar, salvo } = await searchParams

  const e = await obterEvento(id)
  if (!e) notFound()

  // Só o compromisso AVULSO é editado aqui; espelhos de Eventos e Votações
  // mudam na área de origem (senão a próxima sincronização desfaria a edição).
  const podeEditar =
    podeAcessar(sessao.permissoes, "ferramentas_agendas_edicao") && e.origem === "avulso"
  const editando = editar === "1" && podeEditar

  const quando = !e.inicio
    ? "—"
    : e.diaTodo
      ? `${formatarData(e.inicio)}${e.termino ? ` a ${formatarData(e.termino)}` : ""} (dia todo)`
      : `${formatarDataHora(e.inicio)}${e.termino ? ` – ${formatarDataHora(e.termino)}` : ""}`

  const campos: { rotulo: string; valor: string | null }[] = [
    { rotulo: "Quando", valor: quando },
    { rotulo: "Local", valor: e.local },
    { rotulo: "Sede", valor: e.sedeNome },
    { rotulo: "Departamento", valor: e.departamentoNome },
  ]

  if (editando) {
    const [sedes, departamentos] = await Promise.all([sedesParaAgenda(), listarDepartamentos()])
    return (
      <>
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-3">
            <Link href={`/painel/ferramentas/agenda/${id}`}>
              <ArrowLeft />
              Compromisso
            </Link>
          </Button>
          <h1 className="text-2xl font-semibold tracking-tight">Editar compromisso</h1>
        </div>
        <CompromissoForm
          sedes={sedes}
          departamentos={departamentos}
          compromisso={{
            id: e.id,
            atividade: e.atividade,
            tipo: e.tipo,
            inicio: paraCampoDataHora(e.inicio),
            termino: paraCampoDataHora(e.termino),
            diaTodo: e.diaTodo,
            local: e.local,
            sedeId: e.sedeId,
            departamentoId: e.departamentoId,
            informacoesGerais: e.informacoesGerais,
            eventoInterno: e.eventoInterno,
            aplicativo: e.aplicativo,
          }}
        />
      </>
    )
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/ferramentas/agenda">
            <ArrowLeft />
            Agenda
          </Link>
        </Button>
      </div>

      {salvo === "1" && (
        <Alert className="border-success/40 text-success-fg">
          <AlertDescription>Compromisso salvo.</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <CalendarDays className="text-muted-foreground size-5" />
            <h1 className="text-2xl font-semibold tracking-tight">
              {e.atividade ?? "(sem título)"}
            </h1>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {e.tipo && <Badge variant="outline">{e.tipo}</Badge>}
            {e.eventoInterno && <Badge variant="secondary">Interno</Badge>}
            {e.aplicativo && <Badge variant="secondary">No portal do filiado</Badge>}
          </div>
        </div>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <ExcluirCompromissoBotao id={e.id} />
            <Button variant="outline" asChild>
              <Link href={`/painel/ferramentas/agenda/${e.id}?editar=1`}>
                <Pencil />
                Editar
              </Link>
            </Button>
          </div>
        )}
      </div>

      {e.origem !== "avulso" && (
        <Alert>
          <AlertDescription className="flex flex-wrap items-center gap-x-2">
            {e.origem === "evento"
              ? "Este compromisso vem do módulo Eventos e acompanha o evento — altere-o por lá."
              : "Este compromisso vem de uma votação (assembleia) e acompanha suas datas — altere-o em Votações."}
            <Link
              href={
                e.origem === "evento" && e.eventoId
                  ? `/painel/eventos/${e.eventoId}`
                  : "/painel/representacao/votacoes"
              }
              className="text-primary inline-flex items-center gap-1 hover:underline"
            >
              Abrir
              <ExternalLink className="size-3.5" />
            </Link>
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
          {campos.map((c) => (
            <div key={c.rotulo}>
              <p className="text-muted-foreground text-xs">{c.rotulo}</p>
              <p className="mt-0.5">{c.valor ?? "—"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {e.informacoesGerais && (
        <Card>
          <CardContent>
            <p className="text-muted-foreground mb-2 text-xs">
              Informações gerais
            </p>
            <p className="text-sm whitespace-pre-wrap">{e.informacoesGerais}</p>
          </CardContent>
        </Card>
      )}
    </>
  )
}
