import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirFiliados } from "@/lib/db/filiados"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Sugestões do seletor de filiado ao cadastrar assistido (3+ caracteres).
 *
 * Fica dentro de /painel/saude/assistidos para herdar o gate da área no
 * proxy — quem não acessa Saúde não consulta a base de filiados por aqui.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "saude_atendimento", ["saude_gestao"])
  ) {
    return Response.json({ sugestoes: [] }, { status: 403 })
  }

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const sugestoes = await sugerirFiliados(q)
  return Response.json({ sugestoes })
}
