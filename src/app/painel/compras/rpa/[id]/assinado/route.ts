import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { urlArquivoCompras } from "@/lib/db/compras"
import { buscarRpa } from "@/lib/db/compras-rpa"
import { podeAcessar } from "@/lib/permissoes"

export const runtime = "nodejs"

/**
 * Abre o RPA ASSINADO (o arquivo anexado ou o PDF com certificado da
 * assinatura pelo link) — usado na lista de RPAs. Link assinado de 1 hora,
 * gerado na hora do clique.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const permissoesCompra = ["aquisicoes_compras_edicao", "aquisicoes_comprador", "aquisicoes_compra_direta"]
  const sessao = await requirePermissao("aquisicoes_contratos", ["aquisicoes_contratos_edicao", ...permissoesCompra])
  const { id } = await params
  const rpa = await buscarRpa(id)
  if (!rpa) return new Response("RPA não encontrado.", { status: 404 })
  // Mesma regra da página do RPA: sem Contratos, só o RPA de compra.
  const veContratos = podeAcessar(sessao.permissoes, "aquisicoes_contratos", ["aquisicoes_contratos_edicao"])
  if (!veContratos && !rpa.compraId) return new Response("Sem acesso.", { status: 403 })
  const url = await urlArquivoCompras(rpa.arquivoAssinado)
  if (!url) return new Response("Este RPA ainda não tem o recibo assinado.", { status: 404 })
  redirect(url)
}
