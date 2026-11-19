import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirUsuarios } from "@/lib/db/acessos"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Sugestões do seletor de usuário ao conceder acesso ao painel (3+ caracteres).
 * Dentro da área de Usuários e Permissões para herdar o gate no proxy.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "permissoes", ["configuracoes"])
  ) {
    return Response.json({ sugestoes: [] }, { status: 403 })
  }

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const sugestoes = await sugerirUsuarios(q)
  return Response.json({ sugestoes })
}
