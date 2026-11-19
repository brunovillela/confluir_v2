import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { requirePermissao } from "@/lib/auth"
import { obterEvento } from "@/lib/db/eventos"
import { relacaoDeConfirmados } from "@/lib/db/eventos-relacao"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { obterOrganizacao, urlLogo } from "@/lib/db/organizacao"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarDataHora } from "@/lib/formato"
import { RelacaoConfirmadosPDF } from "@/lib/pdf/relacao-confirmados"

export const runtime = "nodejs"
// Evento grande (centenas de confirmados, dezenas de páginas).
export const maxDuration = 120

/**
 * Relação de confirmados do evento em PDF (19/11/2026). `?assinatura=1` troca
 * o telefone por uma coluna de assinatura: vira lista de presença em papel.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await requirePermissao("eventos_gestao")
  const { id } = await params
  const evento = await obterEvento(id)
  if (!evento) return new Response("Não encontrado", { status: 404 })

  const assinatura = new URL(request.url).searchParams.get("assinatura") === "1"
  const [{ linhas }, org] = await Promise.all([relacaoDeConfirmados(id), obterOrganizacao().catch(() => null)])
  const logo = await logoDataUri(urlLogo(org?.logomarca ?? null))
  await registrarExportacao(request, {
    usuarioId: sessao.usuario.id,
    recurso: "eventos_confirmados",
    formato: "pdf",
    quantidade: linhas.length,
    filtros: { evento: evento.titulo ?? id, assinatura },
  })

  const quando = [
    evento.inicio ? formatarDataHora(evento.inicio) : null,
    evento.local,
  ]
    .filter(Boolean)
    .join(" · ")

  const elemento = createElement(RelacaoConfirmadosPDF, {
    entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null,
    logoDataUri: logo,
    evento: evento.titulo ?? "(sem título)",
    quando,
    assinatura,
    linhas: linhas.map((l) => ({
      nome: l.nome,
      cpf: l.cpf,
      telefone: l.telefone,
      filiado: !!l.filiacao_id,
      convidado: !!l.reservada_por,
    })),
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)
  const arquivo = `${assinatura ? "lista-presenca" : "confirmados"}-${evento.slug || id.slice(0, 8)}.pdf`
  return new Response(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${arquivo}"`,
      "Cache-Control": "no-store",
    },
  })
}
