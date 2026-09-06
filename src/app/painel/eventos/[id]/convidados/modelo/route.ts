import { requirePermissao } from "@/lib/auth"
import { obterEvento } from "@/lib/db/eventos"
import { gerarModeloConvidados } from "@/lib/eventos-planilha"

export const runtime = "nodejs"

/** Modelo .xlsx da lista de convidados, já com o nome do evento nas instruções. */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissao("eventos_gestao")
  const { id } = await params

  const evento = await obterEvento(id)
  if (!evento) return new Response("Não encontrado", { status: 404 })

  const buffer = gerarModeloConvidados(evento.titulo)
  const arquivo = `convidados-${evento.slug || id.slice(0, 8)}.xlsx`

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${arquivo}"`,
      "Cache-Control": "no-store",
    },
  })
}
