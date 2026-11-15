import { requirePermissao } from "@/lib/auth"
import { urlDoArquivoEnviado } from "@/lib/db/repasse-link"

/** Baixa o arquivo que o RH mandou pelo link (endereço assinado de 5 minutos). */
export async function GET(_req: Request, { params }: { params: Promise<{ empresaId: string; envioId: string }> }) {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const { envioId } = await params
  const r = await urlDoArquivoEnviado(envioId)
  if (!r.url) return new Response(r.erro ?? "Arquivo não encontrado.", { status: 404 })
  return Response.redirect(r.url, 302)
}
