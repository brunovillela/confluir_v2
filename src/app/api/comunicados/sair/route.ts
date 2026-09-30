import { definirComunicados, lerTokenDescadastro } from "@/lib/db/comunicacao-descadastro"

export const runtime = "nodejs"

/**
 * Descadastro "um clique" (RFC 8058), o do cabeçalho List-Unsubscribe da mala
 * direta: Gmail, Outlook e Apple Mail mostram "Cancelar inscrição" e fazem um
 * POST aqui. O GET (alguém abrindo o endereço no navegador) leva à página, que
 * pede confirmação.
 */
export async function POST(req: Request): Promise<Response> {
  const titular = lerTokenDescadastro(new URL(req.url).searchParams.get("t"))
  if (!titular) return new Response("Link inválido", { status: 400 })
  const r = await definirComunicados(titular, false, "link")
  return r.erro ? new Response(r.erro, { status: 500 }) : new Response("Descadastro registrado", { status: 200 })
}

export async function GET(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const t = url.searchParams.get("t") ?? ""
  return Response.redirect(new URL(`/comunicados/sair/${encodeURIComponent(t)}`, url), 303)
}
