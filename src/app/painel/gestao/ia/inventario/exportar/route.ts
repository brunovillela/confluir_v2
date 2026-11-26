import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { obterConfigIA } from "@/lib/db/ia-config"
import { obterInventarioIA } from "@/lib/db/ia-inventario"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarData } from "@/lib/formato"
import type { OperacaoInventario } from "@/lib/ia-inventario"
import { podeAcessar } from "@/lib/permissoes"
import { planilhaXlsx, respostaXlsx, type ColunaXlsx } from "@/lib/xlsx"

import { intervaloInventario, PERIODOS_INVENTARIO } from "../periodos"

type Linha = OperacaoInventario & { modulo: string }

function arred(n: number | null, casas: number): number | null {
  return n === null ? null : Number(n.toFixed(casas))
}

/** Inventário da IA em planilha: uma linha por operação, com o módulo. */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "gestao_sistema")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = new URL(request.url).searchParams
  const periodo = PERIODOS_INVENTARIO.find((p) => p.valor === sp.get("periodo"))?.valor ?? "tudo"
  const { de, ate } = intervaloInventario(periodo)
  const [config, { inventario }] = await Promise.all([obterConfigIA(), obterInventarioIA(de, ate)])
  const cot = config.cotacaoUsdBrl

  const linhas: Linha[] = inventario.modulos.flatMap((m) => m.operacoes.map((o) => ({ ...o, modulo: m.titulo })))
  const colunas: ColunaXlsx<Linha>[] = [
    { titulo: "Módulo", valor: (l) => l.modulo, largura: 22 },
    { titulo: "Operação", valor: (l) => l.titulo, largura: 48 },
    { titulo: "Sem a IA, a pessoa teria de", valor: (l) => l.semIA, largura: 48 },
    { titulo: "Feitas", valor: (l) => l.sucessos, largura: 9 },
    { titulo: "Falhas", valor: (l) => l.falhas, largura: 8 },
    { titulo: "Barradas pela Gestão", valor: (l) => l.bloqueadas, largura: 11 },
    { titulo: "Custo médio por operação (US$)", valor: (l) => arred(l.custoMedio, 6), largura: 14 },
    ...(cot ? [{ titulo: "Custo médio por operação (R$)", valor: (l: Linha) => arred(l.custoMedio === null ? null : l.custoMedio * cot, 4), largura: 14 }] : []),
    { titulo: "Chamadas sem preço (fora da média)", valor: (l) => l.semPreco, largura: 12 },
    { titulo: "Custo total (US$)", valor: (l) => arred(l.custo, 4), largura: 12 },
    { titulo: "Tokens por operação", valor: (l) => l.tokensMedios, largura: 12 },
    { titulo: "Pessoa levaria (min)", valor: (l) => l.minutos, largura: 11 },
    { titulo: "Tempo ajustado pela Gestão", valor: (l) => (l.minutosAjustados ? "sim" : "não"), largura: 11 },
    { titulo: "Tempo poupado (h)", valor: (l) => arred(l.economiaMin / 60, 1), largura: 11 },
    { titulo: "Custo por hora poupada (US$)", valor: (l) => arred(l.custoPorHora, 4), largura: 13 },
    { titulo: "Resposta da IA (s)", valor: (l) => l.duracaoMediaS, largura: 10 },
    { titulo: "Modelos", valor: (l) => l.modelos.join(", ") || null, largura: 18 },
    { titulo: "Último uso", valor: (l) => (l.ultima ? formatarData(l.ultima) : null), largura: 12 },
  ]

  await registrarExportacao(request, { usuarioId: sessao.usuario.id, recurso: "ia_uso", formato: "xlsx", quantidade: linhas.length })
  return respostaXlsx(`inventario-ia-${periodo.replace("_", "-")}`, planilhaXlsx("Inventário da IA", colunas, linhas))
}
