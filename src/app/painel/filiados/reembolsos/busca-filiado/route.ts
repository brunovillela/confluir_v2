import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirFiliados } from "@/lib/db/filiados"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Sugestões do seletor de filiado ao lançar um reembolso (3+ letras).
 * Fica dentro de /painel/filiados/reembolsos para herdar o gate da área.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "filiacao_reembolsos", ["filiacao_gestao"])) {
    return Response.json({ sugestoes: [] }, { status: 403 })
  }
  const q = new URL(request.url).searchParams.get("q") ?? ""
  const sugestoes = await sugerirFiliados(q)
  return Response.json({ sugestoes })
}
