import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { MonitorUp } from "lucide-react"

import { RotuloTrilha } from "@/components/layout/trilha-rotulos"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { requirePermissao } from "@/lib/auth"
import { valor } from "@/lib/congressos/config"
import { obterCongresso, TIPOS_SESSAO } from "@/lib/db/congressos"
import { dadosDoDia, presencasDaSessao, sessaoAtual } from "@/lib/db/congressos-dia"
import { formatarDataHora } from "@/lib/formato"

import { Porta, type LinhaPorta } from "./porta"

export const metadata: Metadata = { title: "Presença na sessão — Confluir" }

export default async function PortaPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ sessao?: string }>
}) {
  await requirePermissao("congressos_credenciamento", ["congressos_gestao"])
  const { id } = await params
  const sp = await searchParams
  const c = await obterCongresso(id)
  if (!c) notFound()
  const d = await dadosDoDia(id)
  const base = `/painel/representacao/congressos/${id}`
  const sessao = d.sessoes.find((s) => s.id === sp.sessao) ?? sessaoAtual(d.sessoes)

  if (!sessao) {
    return (
      <>
        <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, porta: "Presença" }} />
        <h1 className="text-2xl font-semibold tracking-tight">Presença na sessão</h1>
        <p className="text-muted-foreground text-sm">
          Cadastre as sessões do programa primeiro.{" "}
          <Link href={`${base}?aba=programa`} className="underline underline-offset-2">
            Programa e grupos
          </Link>
        </p>
      </>
    )
  }

  const presencas = await presencasDaSessao(c, sessao.id)
  const doGrupo = sessao.tipo === "grupo" && sessao.grupoId
  const linhas: LinhaPorta[] = d.participantes
    .filter((p) => p.credenciadoEm && p.modalidade === "presencial" && p.situacao !== "cancelado")
    // Na sessão de um grupo, os membros do grupo vêm primeiro; os demais seguem abaixo.
    .sort((a, b) => {
      if (doGrupo) {
        const ga = a.grupoId === sessao.grupoId ? 0 : 1
        const gb = b.grupoId === sessao.grupoId ? 0 : 1
        if (ga !== gb) return ga - gb
      }
      return (a.nomeSocial ?? a.nome).localeCompare(b.nomeSocial ?? b.nome, "pt-BR")
    })
    .map((p) => {
      const papel = p.papelId ? d.papelPorId.get(p.papelId) : undefined
      const pr = presencas.get(p.id)
      return {
        id: p.id,
        nome: p.nomeSocial ?? p.nome,
        papel: papel?.nome ?? null,
        cor: papel?.cor ?? null,
        base: p.unidadeId ? (d.unidades.find((u) => u.id === p.unidadeId)?.nome ?? null) : null,
        entrada: pr?.entrada ?? null,
        saida: pr?.saida ?? null,
      }
    })

  return (
    <>
      <RotuloTrilha valores={{ congressos: "Congressos", [id]: c.nome, porta: "Presença" }} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{sessao.titulo}</h1>
          <p className="text-muted-foreground mt-1 text-xs">
            {TIPOS_SESSAO.find((t) => t.valor === sessao.tipo)?.rotulo}
            {sessao.inicio ? ` · ${formatarDataHora(sessao.inicio)}` : ""}
            {sessao.local ? ` · ${sessao.local}` : ""}
          </p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`${base}/sala/${sessao.id}`} target="_blank">
            <MonitorUp />
            Código da sala no telão
          </Link>
        </Button>
      </div>
      <nav className="flex flex-wrap gap-1 text-sm" aria-label="Sessões">
        {d.sessoes.map((s) => (
          <Link
            key={s.id}
            href={`${base}/porta?sessao=${s.id}`}
            className={`rounded-md border px-2 py-1 ${s.id === sessao.id ? "border-primary bg-primary/5 font-medium" : "text-muted-foreground hover:text-foreground"}`}
          >
            {s.titulo}
          </Link>
        ))}
      </nav>
      <Card className="max-w-3xl">
        <CardHeader>
          <CardTitle>Entrada</CardTitle>
          <CardDescription>
            Leia o crachá na entrada, ou marque pela lista. Quem tem o link pessoal também pode registrar sozinho lendo o
            código da sala no telão.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Porta congressoId={id} sessaoId={sessao.id} linhas={linhas} registraSaida={valor(c.config, "presenca.saida") === true} />
        </CardContent>
      </Card>
    </>
  )
}
