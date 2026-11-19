import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { obterCongresso } from "@/lib/db/congressos"
import { dadosDoDia } from "@/lib/db/congressos-dia"

import { Telao } from "./telao"

export const metadata: Metadata = { title: "Código da sala — Confluir" }

export default async function SalaPage({ params }: { params: Promise<{ id: string; sessaoId: string }> }) {
  await requirePermissao("congressos_credenciamento", ["congressos_gestao"])
  const { id, sessaoId } = await params
  const c = await obterCongresso(id)
  if (!c) notFound()
  const d = await dadosDoDia(id)
  const sessao = d.sessoes.find((s) => s.id === sessaoId)
  if (!sessao) notFound()
  return (
    <div className="flex min-h-[80vh] flex-col items-center justify-center gap-6 py-6 text-center">
      <div>
        <div className="text-muted-foreground text-sm">
          {c.edicao ? `${c.edicao}º ` : ""}
          {c.nome}
        </div>
        <h1 className="text-3xl font-semibold tracking-tight">{sessao.titulo}</h1>
        <p className="text-muted-foreground mt-2">Abra o seu link pessoal no celular, toque em “Registrar presença na sala” e leia o código.</p>
      </div>
      <Telao congressoId={id} sessaoId={sessaoId} />
    </div>
  )
}
