import { requirePermissao } from "@/lib/auth"
import { respostaPdfExtratoOrdem } from "@/lib/pdf/extrato-ordem-resposta"

export const runtime = "nodejs"

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  await requirePermissao("financeiro_pagamento", ["financeiro_leitura", "aquisicoes_avaliacoes"])
  const { id } = await params
  return respostaPdfExtratoOrdem(id, req)
}
