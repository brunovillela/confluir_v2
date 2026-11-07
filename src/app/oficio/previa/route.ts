import { lerDados, texto } from "@/app/painel/ferramentas/oficios/ler-formulario"
import { requirePermissao } from "@/lib/auth"
import { dadosImpressaoDe, obterOficio, oficioDaPrevia } from "@/lib/db/oficios"
import { podeVerOficio } from "@/lib/db/oficios-acesso"
import { renderizarPdfOficio } from "@/lib/db/oficios-assinatura"

export const runtime = "nodejs"

/**
 * Prévia em PDF do formulário do ofício, sem salvar: o botão "Ver como fica"
 * manda os campos da tela e recebe o PDF com a tarja "PRÉVIA". Só rascunho —
 * depois do envio o conteúdo está travado e o PDF de verdade está em
 * /oficio/[id]/pdf.
 */
export async function POST(req: Request) {
  await requirePermissao("ferramentas_oficios")
  const formData = await req.formData()
  const id = texto(formData, "oficio_id")

  let base = null
  if (id) {
    if (!(await podeVerOficio(id))) return new Response("Não encontrado", { status: 404 })
    base = await obterOficio(id)
    if (!base) return new Response("Não encontrado", { status: 404 })
    if (base.situacao !== "Rascunho")
      return new Response("O ofício já saiu do rascunho: use Baixar PDF.", { status: 409 })
  }

  const oficio = await oficioDaPrevia(base, lerDados(formData))
  const buffer = await renderizarPdfOficio(await dadosImpressaoDe(oficio), [], { previa: true })
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="oficio-previa.pdf"`,
      "Cache-Control": "no-store",
    },
  })
}
