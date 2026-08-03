import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirFiliados } from "@/lib/db/filiados"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Sugestões do seletor de filiado ao vincular uma CAT a um filiado (3+ letras).
 *
 * Fica dentro de /painel/saude/cat para herdar o gate da área no proxy. Usa o
 * mesmo nível de leitura da CAT (quem consulta a CAT pode buscar), enquanto a
 * gravação do vínculo exige o nível de edição (saude_gestao).
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "saude_cat", [
      "saude_atendimento",
      "saude_gestao",
    ])
  ) {
    return Response.json({ sugestoes: [] }, { status: 403 })
  }

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const sugestoes = await sugerirFiliados(q)
  return Response.json({ sugestoes })
}
