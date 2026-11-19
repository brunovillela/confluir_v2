import { createElement } from "react"
import { renderToBuffer } from "@react-pdf/renderer"
import QRCode from "qrcode"

import { requirePermissao } from "@/lib/auth"
import { ROTULO_MEIO, ROTULO_NIVEL } from "@/lib/congressos/mocoes"
import { obterCongresso } from "@/lib/db/congressos"
import { dadosDaMocao, ROTULO_SITUACAO_MOCAO } from "@/lib/db/congressos-mocoes"
import { obterOrganizacao } from "@/lib/db/organizacao"
import { formatarDataHora } from "@/lib/formato"
import { MocaoPDF } from "@/lib/pdf/mocao-congresso"
import { origemAtual } from "@/lib/tenant-url"

/** PDF da moção com a lista de quem assinou (substitui a folha de assinaturas). */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string; mocaoId: string }> }) {
  await requirePermissao("congressos_relatoria", ["congressos_gestao"])
  const { id, mocaoId } = await params
  const c = await obterCongresso(id)
  if (!c) return new Response("Congresso não encontrado.", { status: 404 })
  const d = await dadosDaMocao(c, mocaoId)
  if (!d) return new Response("Moção não encontrada.", { status: 404 })
  const [org, origem] = await Promise.all([obterOrganizacao().catch(() => null), origemAtual()])
  const m = d.mocao
  const verificarUrl = `${origem}/verificar/${m.codigo}`
  const atuais = d.assinaturas.filter((a) => a.versao === m.versao && !a.retiradaEm)
  const buf = await renderToBuffer(
    createElement(MocaoPDF, {
      d: {
        congresso: `${c.edicao ? `${c.edicao}º ` : ""}${c.nome}`,
        entidade: org?.nomeFantasia ?? org?.nomeRazao ?? null,
        numero: m.numero,
        tipo: m.tipo,
        titulo: m.titulo,
        destinatario: m.destinatario,
        texto: m.texto,
        versao: m.versao,
        hash: m.textoHash,
        situacao: ROTULO_SITUACAO_MOCAO[m.situacao],
        proponente: m.proponenteNome,
        base: m.unidade,
        limiar: d.limiar.alternativas.map((a) => `${a.rotulo}: ${a.atual} de ${a.exigido}${a.atingido ? " (atingido)" : ""}`),
        assinaturas: atuais.map((a) => ({
          nome: a.nome,
          papel: a.papel,
          base: a.unidade,
          meio: `${ROTULO_MEIO[a.meio]}${a.nivel ? ` · ${ROTULO_NIVEL[a.nivel]}` : a.modalidade === "distancia" ? " · a distância" : ""}`,
          quando: formatarDataHora(a.createdAt),
        })),
        verificarUrl,
        qrDataUri: await QRCode.toDataURL(verificarUrl, { margin: 1, width: 240 }),
        geradoEm: formatarDataHora(new Date().toISOString()),
      },
    }) as Parameters<typeof renderToBuffer>[0]
  )
  return new Response(new Uint8Array(buf), {
    headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="mocao-${m.numero}.pdf"` },
  })
}
