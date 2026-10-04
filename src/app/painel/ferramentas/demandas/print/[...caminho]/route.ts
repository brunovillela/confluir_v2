import { getSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/**
 * Print anexado a um relato de problema/sugestão (lib/db/feedback.ts): o
 * arquivo fica no bucket privado `documentos`; quem cuida das demandas recebe
 * um link assinado de curta duração. Sem sessão ou permissão, 403.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ caminho: string[] }> }): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "ferramentas_demandas", ["ferramentas_tarefas"])) {
    return new Response("Sem acesso", { status: 403 })
  }
  const { caminho } = await params
  const path = caminho.join("/")
  if (!/^feedback\/[0-9a-f-]{36}\.(png|jpg|webp|gif)$/.test(path)) return new Response("Não encontrado", { status: 404 })
  const admin = await createAdminClient()
  const { data, error } = await admin.storage.from("documentos").createSignedUrl(path, 300)
  if (error || !data?.signedUrl) return new Response("Não encontrado", { status: 404 })
  return Response.redirect(data.signedUrl, 302)
}
