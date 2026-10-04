import { getSessaoPainel } from "@/lib/auth"
import { obterRemessa } from "@/lib/db/remessas"
import { podeAcessar } from "@/lib/permissoes"
import { createAdminClient } from "@/lib/supabase/admin"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Baixa o arquivo CNAB 240 da remessa (ou o retorno guardado, com ?retorno=1). */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "financeiro_pagamento", ["financeiro_leitura"])) return new Response("Sem acesso", { status: 403 })
  const { id } = await params
  const r = await obterRemessa(id)
  if (!r) return new Response("Não encontrada", { status: 404 })

  if (new URL(req.url).searchParams.get("retorno") === "1") {
    const admin = await createAdminClient()
    const { data } = await admin.from("financeiro_remessas").select("retorno_conteudo, retorno_nome").eq("id", id).maybeSingle()
    if (!data?.retorno_conteudo) return new Response("Sem retorno", { status: 404 })
    return new Response(String(data.retorno_conteudo), {
      headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${String(data.retorno_nome ?? "retorno.ret")}"` },
    })
  }
  // CNAB sai em ASCII (acentos removidos na geração): um byte por caractere.
  const bytes = new Uint8Array(Array.from(r.remessa.conteudo, (ch) => ch.charCodeAt(0) & 0xff))
  return new Response(bytes, {
    headers: { "Content-Type": "text/plain; charset=windows-1252", "Content-Disposition": `attachment; filename="${r.remessa.arquivoNome}"` },
  })
}
