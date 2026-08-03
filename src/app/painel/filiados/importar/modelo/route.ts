import { getSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"

/** Modelo de planilha para importação de filiados em massa por fonte. */
export async function GET() {
  const sessao = await getSessaoPainel()
  if (
    !sessao ||
    !podeAcessar(sessao.permissoes, "filiacao_filiados", [
      "filiacao_gestao",
      "filiacao_receitas",
    ])
  ) {
    return new Response("Sem acesso", { status: 403 })
  }

  const csv = [
    [
      "nome_completo",
      "cpf",
      "matricula_sindical",
      "sexo",
      "nascimento",
      "email",
      "telefone",
      "cargo",
      "lotacao",
      "matricula_fonte",
      "admissao",
      "filiacao",
      "condicao",
    ].join(";"),
    [
      "Maria da Silva",
      "111.444.777-35",
      "12345",
      "Feminino",
      "10/03/1985",
      "maria@email.com",
      "(22) 99999-9999",
      "Técnica de Operação",
      "Macaé",
      "98765",
      "01/02/2010",
      "15/06/2012",
      "Ativo",
    ].join(";"),
    [
      "José de Souza",
      "529.982.247-25",
      "",
      "Masculino",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
      "",
    ].join(";"),
  ].join("\r\n")

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-filiados.csv"',
    },
  })
}
