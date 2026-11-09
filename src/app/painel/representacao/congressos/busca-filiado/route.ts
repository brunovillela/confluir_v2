import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirFiliados } from "@/lib/db/filiados"
import { podeAcessar } from "@/lib/permissoes"

/** Sugestões do seletor de filiado ao incluir participante num congresso. */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "congressos_gestao")) {
    return Response.json({ sugestoes: [] }, { status: 403 })
  }
  const q = new URL(request.url).searchParams.get("q") ?? ""
  return Response.json({ sugestoes: await sugerirFiliados(q) })
}
