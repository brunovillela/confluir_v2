import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"
import { dadosDoGrupo, opcoesDeFuncao, ROTULO_FUNCAO } from "@/lib/db/congressos-relatoria"
import { formatarDataHora } from "@/lib/formato"

import { FuncoesGrupo, ReabrirRelatorio } from "../../../relatoria-componentes"
import { RelatoriaGrupo } from "../../../relatoria-grupo"

export const metadata: Metadata = { title: "Relatoria do grupo — Confluir" }

export default async function GrupoRelatoriaPage({ params }: { params: Promise<{ id: string; grupoId: string }> }) {
  await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const { id, grupoId } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const [d, pessoas] = await Promise.all([dadosDoGrupo(c, grupoId), opcoesDeFuncao(id)])
  if (!d) notFound()
  const base = `/painel/representacao/congressos/${id}`

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, grupos: "Relatoria", [grupoId]: d.grupo.nome }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{d.grupo.nome}</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {d.eixo ? `Eixo: ${d.eixo.nome}` : "Sem eixo"}
            {d.grupo.sala ? ` · ${d.grupo.sala}` : ""}
            {d.grupo.relatorioEntregueEm ? ` · relatório entregue em ${formatarDataHora(d.grupo.relatorioEntregueEm)}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {d.grupo.relatorioEntregueEm && <ReabrirRelatorio congressoId={id} grupoId={grupoId} />}
          <Button asChild variant="outline" size="sm">
            <Link href={`${base}?aba=relatoria`}>Todos os grupos</Link>
          </Button>
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <div className="min-w-0">
          <RelatoriaGrupo acesso={{ congressoId: id }} d={d} />
        </div>
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Coordenação e relatoria</CardTitle>
            <CardDescription>
              Quem tem função opera esta tela pelo próprio link pessoal, no celular, sem criar conta.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FuncoesGrupo
              congressoId={id}
              grupoId={grupoId}
              funcoes={d.funcoes.map((f) => ({ id: f.id, nome: f.nome, funcao: f.funcao, rotulo: ROTULO_FUNCAO[f.funcao], escolha: f.escolha }))}
              pessoas={pessoas.map((p) => ({ id: p.id, nome: p.nome, doGrupo: p.grupoId === grupoId }))}
              escolhaPadrao={d.regras.funcoesGrupo === "indicadas" ? "indicada" : "eleita"}
            />
          </CardContent>
        </Card>
      </div>
    </>
  )
}
