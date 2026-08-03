import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirFiliados } from "@/lib/db/filiados"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Sugestões do seletor de filiado ao vincular um integrante da diretoria à
 * pessoa (3+ caracteres). Fica dentro da área de Diretoria para herdar o gate
 * de permissão no proxy.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "diretoria_mandatos", ["configuracoes"])
  ) {
    return Response.json({ sugestoes: [] }, { status: 403 })
  }

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const sugestoes = await sugerirFiliados(q)
  return Response.json({ sugestoes })
}
