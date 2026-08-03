import { getSessaoPainel } from "@/lib/auth"
import { podeAcessar } from "@/lib/permissoes"
import { CAMPOS_CAT } from "@/lib/saude-campos"

/**
 * Modelo de planilha para importação de CATs.
 *
 * O cabeçalho sai como "<nº> - <rótulo>" porque é assim que o casamento de
 * colunas funciona: pela numeração do formulário oficial, que sobrevive a
 * variações de texto entre planilhas.
 */
export async function GET() {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "saude_cat", ["saude_gestao"])) {
    return new Response("Sem acesso", { status: 403 })
  }

  const cabecalho = CAMPOS_CAT.map((c) => `${c.n} - ${c.rotulo}`)

  /** Uma linha preenchida, para servir de referência de formato. */
  const exemplo: Record<number, string> = {
    1: "Empregador",
    2: "Inicial",
    3: "Empregador",
    5: "2025.001.234-5/01",
    7: "Petroleo Brasileiro S A Petrobras",
    9: "33.000.167/0001-01",
    11: "Maria da Silva Santos",
    12: "111.444.777-35",
    13: "10/03/1985",
    14: "Feminino",
    15: "Casada",
    16: "311205 - Tecnico em Petroquimica",
    19: "04/08/2025",
    20: "14:30",
    22: "Típico",
    25: "Estabelecimento da empregadora",
    26: "Plataforma P-40, convés principal",
    28: "RJ",
    29: "Macaé",
    31: "757010600 – PERNA ( DO TORNOZELO , EXCLUSIVE , AO JOELHO , EXCLUSIVE )",
    32: "302010650 – PISO DE VEICULO – SUPERFICIE UTILIZADA PARA SUSTENTAR PESSOAS",
    34: "200004600 – IMPACTO DE PESSOA CONTRA OBJETO EM MOVIMENTO",
    36: "Não",
    39: "05/08/2025",
    40: "04/08/2025",
    42: "Não",
    43: "15",
    44: "Sim",
    45: "104000000 – DISTENSAO, TORCAO",
    46: "Entorse de tornozelo",
    47: "S93.4",
    49: "Ana Paula Viana 52707074",
  }

  const escapar = (v: string) =>
    /[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v

  const csv = [
    cabecalho.map(escapar).join(";"),
    CAMPOS_CAT.map((c) => escapar(exemplo[c.n] ?? "")).join(";"),
  ].join("\r\n")

  return new Response(`﻿${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="modelo-cat.csv"',
    },
  })
}
