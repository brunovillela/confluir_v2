import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"

import { getSessaoPainel } from "@/lib/auth"
import { obterMinuta } from "@/lib/db/contratos-minutas"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { logoDataUri } from "@/lib/db/oficios-assinatura"
import { formatarCnpjCpf } from "@/lib/formato"
import { MinutaContratoPDF } from "@/lib/pdf/minuta-contrato"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "aquisicoes_contratos_edicao")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { id } = await ctx.params
  const [minuta, org] = await Promise.all([obterMinuta(id), obterOrganizacao()])
  if (!minuta?.texto) return new Response("Minuta não encontrada", { status: 404 })

  const elemento = createElement(MinutaContratoPDF, {
    texto: minuta.texto,
    entidade: org?.nomeRazao ?? org?.nomeFantasia ?? null,
    subtitulo: org?.cnpjCpf ? `CNPJ ${formatarCnpjCpf(org.cnpjCpf)}` : null,
    logo: await logoDataUri(org?.logoUrl ?? null),
    rodape: [
      minuta.finalizada ? null : "MINUTA",
      minuta.titulo ?? minuta.tipo ?? "Minuta",
      `versão ${minuta.versao}`,
    ]
      .filter(Boolean)
      .join(" · "),
    minuta: !minuta.finalizada,
  }) as Parameters<typeof renderToBuffer>[0]
  const pdf = await renderToBuffer(elemento)

  return new Response(new Uint8Array(pdf), {
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="minuta-v${minuta.versao}.pdf"`,
    },
  })
}
