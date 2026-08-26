import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { buscarFiliadosParaCusteio } from "@/lib/db/custeio"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Autocomplete de filiado no seletor de beneficiário do custeio (2+ chars).
 * Fica dentro da área de Custeio para herdar o gate de permissão no proxy.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "custeio_institucional", [
      "custeio_institucional_edicao",
    ])
  ) {
    return Response.json({ resultados: [] }, { status: 403 })
  }

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const resultados = await buscarFiliadosParaCusteio(q)
  return Response.json({ resultados })
}
