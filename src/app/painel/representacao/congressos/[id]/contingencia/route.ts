import { createElement } from "react"
import { NextResponse } from "next/server"
import { renderToBuffer } from "@react-pdf/renderer"

import { getSessaoPainel } from "@/lib/auth"
import { cpfParcial } from "@/lib/congressos/credenciamento"
import { obterCongresso } from "@/lib/db/congressos"
import { dadosDoDia } from "@/lib/db/congressos-dia"
import { ContingenciaPDF } from "@/lib/pdf/contingencia-congresso"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"
export const maxDuration = 30

/** Lista de contingência em PDF: confirmados e lista de espera, por base. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "congressos_credenciamento", ["congressos_gestao"])) {
    return new NextResponse("Sem acesso.", { status: 403 })
  }
  const { id } = await params
  const c = await obterCongresso(id)
  if (!c) return new NextResponse("Congresso não encontrado.", { status: 404 })
  const d = await dadosDoDia(id)
  const pessoas = d.participantes.filter((p) => p.situacao === "confirmado" || p.situacao === "lista_espera")
  const grupos = new Map<string, typeof pessoas>()
  for (const p of pessoas) {
    const base = p.unidadeId ? (d.unidades.find((u) => u.id === p.unidadeId)?.nome ?? "Sem base") : "Sem base"
    grupos.set(base, [...(grupos.get(base) ?? []), p])
  }
  const ordenados = [...grupos.entries()]
    .sort(([a], [b]) => (a === "Sem base" ? 1 : b === "Sem base" ? -1 : a.localeCompare(b, "pt-BR")))
    .map(([base, lista]) => ({
      base,
      linhas: lista
        .sort((a, b) => (a.nomeSocial ?? a.nome).localeCompare(b.nomeSocial ?? b.nome, "pt-BR"))
        .map((p) => ({
          nome: p.nomeSocial ?? p.nome,
          papel: p.papelId ? (d.papelPorId.get(p.papelId)?.nome ?? null) : null,
          cpf: cpfParcial(p.cpf),
          situacao: p.situacao,
        })),
    }))
  const geradoEm = new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date())
  const buf = await renderToBuffer(
    createElement(ContingenciaPDF, {
      congresso: `${c.edicao ? `${c.edicao}º ` : ""}${c.nome}`,
      sessao: null,
      grupos: ordenados,
      geradoEm,
    }) as Parameters<typeof renderToBuffer>[0]
  )
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="contingencia-${id.slice(0, 8)}.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
