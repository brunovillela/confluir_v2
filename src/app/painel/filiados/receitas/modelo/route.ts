import { getSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"

/**
 * Modelo da relação de pagamentos de uma remessa. O CPF OU a matrícula na
 * fonte fazem o vínculo com o filiado (CPF tem prioridade). O nome é opcional:
 * serve para cadastrar quem não for encontrado.
 */
export async function GET() {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "filiacao_receitas", ["filiacao_gestao"])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }

  const csv = [
    ["cpf", "matricula", "nome", "valor"].join(";"),
    ["111.444.777-35", "0046514400", "Maria da Silva Souza", "86,25"].join(";"),
    ["", "0070950700", "João Pereira Lima", "120,50"].join(";"),
    ["529.982.247-25", "", "", "45,00"].join(";"),
  ].join("\r\n")

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-contribuicoes.csv"',
    },
  })
}
