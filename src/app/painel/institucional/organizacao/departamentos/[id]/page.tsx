import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Building2, Crown } from "lucide-react"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { requirePermissao } from "@/lib/auth"
import {
  listarDepartamentosCompletos,
  pessoasParaDepartamento,
} from "@/lib/db/departamentos"

import { AbrirFormulario } from "../../abrir-formulario"
import { DepartamentoForm, ReativarDepartamento } from "../../departamento-forms"

export const metadata: Metadata = { title: "Departamento — Confluir" }

/** Um departamento: as pessoas vinculadas e, no botão, a edição e o legado. */
export default async function DepartamentoPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await requirePermissao("configuracoes")
  const { id } = await params
  const [departamentos, pessoas] = await Promise.all([
    listarDepartamentosCompletos(),
    pessoasParaDepartamento(),
  ])
  const d = departamentos.find((x) => x.id === id)
  if (!d) notFound()

  const detalhe = new Map(pessoas.filter((p) => p.usuarioId).map((p) => [p.usuarioId as string, p]))
  const membros = [...d.integrantes].sort((a, b) =>
    a.usuarioId === d.coordenadorId ? -1 : b.usuarioId === d.coordenadorId ? 1 : a.nome.localeCompare(b.nome, "pt-BR")
  )

  return (
    <>
      <RotuloTrilha valores={{ departamentos: "Departamentos", [id]: d.nome }} />
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/painel/institucional/organizacao">
            <ArrowLeft />
            Organização
          </Link>
        </Button>
      </div>
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <Building2 className="text-muted-foreground size-5" />
          <h1 className="text-2xl font-semibold tracking-tight">{d.nome}</h1>
          {d.legado && <Badge variant="outline" className="text-muted-foreground">Legado</Badge>}
        </div>
        <p className="text-muted-foreground mt-1 text-xs">
          {d.coordenadorNome ? `Coordenação: ${d.coordenadorNome}` : "Sem coordenador"} ·{" "}
          {d.integrantes.length} {d.integrantes.length === 1 ? "pessoa" : "pessoas"}
        </p>
      </div>

      {d.legado ? (
        <Alert variant="info">
          <AlertDescription>
            <span className="grid gap-2">
              <span>
                Departamento legado: fora das listas de escolha (nova compra, ofício,
                contratos…), mantido nos registros antigos.
              </span>
              <ReativarDepartamento departamentoId={d.id} />
            </span>
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardContent>
            <AbrirFormulario
              rotulo="Editar departamento"
              resumo={
                <div className="grid gap-2">
                  <p className="font-medium">Pessoas vinculadas</p>
                  {membros.length === 0 ? (
                    <p className="text-muted-foreground text-sm">
                      Ninguém vinculado. Clique em Editar departamento para marcar as pessoas.
                    </p>
                  ) : (
                    <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {membros.map((m) => {
                        const p = detalhe.get(m.usuarioId)
                        return (
                          <li key={m.usuarioId} className="rounded-md border p-3 text-sm">
                            <span className="flex items-center gap-1.5 font-medium">
                              {m.nome}
                              {m.usuarioId === d.coordenadorId && (
                                <Badge variant="outline" className="border-primary/40 text-primary gap-1 font-normal">
                                  <Crown className="size-3" />
                                  coordenação
                                </Badge>
                              )}
                            </span>
                            <span className="text-muted-foreground block text-xs">
                              {p ? `${p.origem === "diretor" ? "Diretor(a)" : "Funcionário(a)"}${p.cargo ? ` · ${p.cargo}` : ""}` : "fora do quadro atual"}
                            </span>
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </div>
              }
            >
              <DepartamentoForm departamento={d} pessoas={pessoas} />
            </AbrirFormulario>
          </CardContent>
        </Card>
      )}
    </>
  )
}
