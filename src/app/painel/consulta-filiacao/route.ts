import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { sugerirFiliados } from "@/lib/db/filiados"

/**
 * Consulta BÁSICA de filiação do painel: qualquer funcionário logado pode
 * saber a condição de um filiado (nome, CPF ou matrícula), sem abrir o
 * cadastro — por isso a resposta não expõe id nem CPF completo.
 */
export async function GET(request: NextRequest) {
  const sessao = await getSessaoPainel()
  if (!sessao) return Response.json({ resultados: [] }, { status: 403 })

  const q = new URL(request.url).searchParams.get("q") ?? ""
  const sugestoes = await sugerirFiliados(q, 6)

  return Response.json({
    resultados: sugestoes.map((s) => ({
      nome: s.nome_completo,
      matricula: s.matricula_sindical,
      cpfMascarado:
        s.cpf && s.cpf.length === 11
          ? `***.***.${s.cpf.slice(6, 9)}-${s.cpf.slice(9)}`
          : null,
      condicao: s.filiacao_condicao,
    })),
  })
}
