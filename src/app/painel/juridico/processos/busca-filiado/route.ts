import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirFiliados } from "@/lib/db/filiados"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Sugestões do seletor de filiados ao vincular um processo (3+ caracteres).
 * Fica dentro da área do Jurídico para herdar o gate no proxy.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "juridico_geral", [
      "juridico_gestao",
      "juridico_homologacoes",
    ])
  ) {
    return Response.json({ sugestoes: [] }, { status: 403 })
  }

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const sugestoes = await sugerirFiliados(q)
  return Response.json({ sugestoes })
}
