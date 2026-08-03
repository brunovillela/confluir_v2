import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirFiliados } from "@/lib/db/filiados"
import { podeAcessar } from "@/lib/permissoes"

/** Sugestões da busca rápida do módulo Filiados (3+ caracteres). */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "filiacao_filiados", [
      "filiacao_gestao",
      "filiacao_receitas",
    ])
  ) {
    return Response.json({ sugestoes: [] }, { status: 403 })
  }

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const sugestoes = await sugerirFiliados(q)
  return Response.json({ sugestoes })
}
