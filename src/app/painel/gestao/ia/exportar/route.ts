import type { NextRequest } from "next/server"

import { getSessaoPainel } from "@/lib/auth"
import { listarChamadasIA, resumoUsoIA, rotuloOrigem, type ChamadaIA, type LinhaUso } from "@/lib/db/ia-uso"
import { registrarExportacao } from "@/lib/exportacoes"
import { formatarDataHora } from "@/lib/formato"
import { processoIA, tituloModuloIA } from "@/lib/ia-processos"
import { podeAcessar } from "@/lib/permissoes"
import { dataXlsx, planilhaXlsxAbas, respostaXlsx, type AbaXlsx, type ColunaXlsx } from "@/lib/xlsx"

import { intervalo, PERIODOS_PLANILHA } from "../periodos"

const LOTE = 1000
const MAX_LOTES = 100

/** "AAAA-MM-DD" da chamada no fuso de Brasília. */
function diaBR(iso: string): string {
  return new Date(new Date(iso).getTime() - 3 * 3600_000).toISOString().slice(0, 10)
}

type Rateio = {
  mes: string
  departamento: string
  chamadas: number
  falhas: number
  entrada: number
  saida: number
  custo: number | null
}

function usd(n: number | null, casas = 4): number | null {
  return n === null ? null : Number(n.toFixed(casas))
}

function colunasResumo(titulo: string, detalhe?: string): ColunaXlsx<LinhaUso>[] {
  return [
    { titulo, valor: (l) => l.rotulo, largura: 44 },
    ...(detalhe ? [{ titulo: detalhe, valor: (l: LinhaUso) => l.detalhe, largura: 22 }] : []),
    { titulo: "Chamadas", valor: (l) => l.chamadas, largura: 11 },
    { titulo: "Falhas", valor: (l) => l.falhas, largura: 9 },
    { titulo: "Barradas pela Gestão", valor: (l) => l.bloqueadas, largura: 12 },
    { titulo: "Tokens de entrada", valor: (l) => l.tokensEntrada, largura: 16 },
    { titulo: "Dos quais em cache", valor: (l) => l.tokensEntradaCache, largura: 16 },
    { titulo: "Tokens de saída", valor: (l) => l.tokensSaida, largura: 16 },
    { titulo: "Custo estimado (US$)", valor: (l) => usd(l.custo), largura: 16 },
    { titulo: "Última chamada", valor: (l) => (l.ultima ? formatarDataHora(l.ultima) : null), largura: 18 },
  ]
}

function aba<T>(nome: string, colunas: ColunaXlsx<T>[], linhas: T[]): AbaXlsx<unknown> {
  return { aba: nome, colunas: colunas as ColunaXlsx<unknown>[], linhas }
}

/**
 * Uso da IA em planilha (Gestão › Inteligência Artificial), para a prestação
 * de contas e o rateio do custo: mês × departamento, os resumos por
 * departamento, pessoa, processo, módulo e modelo, e todas as chamadas do
 * período. Não há texto de pedido nem de resposta — o registro não os guarda.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const sessao = await getSessaoPainel()
  if (!sessao || !podeAcessar(sessao.permissoes, "gestao_sistema")) {
    return new Response("Sem acesso", { status: 403 })
  }
  const sp = new URL(request.url).searchParams
  const periodo = PERIODOS_PLANILHA.find((p) => p.valor === sp.get("periodo"))?.valor ?? "mes"
  const { de, ate } = intervalo(periodo)

  const [resumo, chamadas] = await Promise.all([
    resumoUsoIA(de, ate),
    (async () => {
      const todas: ChamadaIA[] = []
      for (let i = 0; i < MAX_LOTES; i++) {
        const lote = await listarChamadasIA({ de, ate }, LOTE, i * LOTE)
        todas.push(...lote.chamadas)
        if (lote.chamadas.length < LOTE) break
      }
      return todas
    })(),
  ])
  if (!resumo.disponivel) return new Response("O registro de uso da IA não está disponível.", { status: 503 })

  // Rateio: mês × departamento, somado a partir das chamadas.
  const rateio = new Map<string, Rateio>()
  for (const c of chamadas) {
    const mes = diaBR(c.criadoEm).slice(0, 7)
    const departamento = c.departamento ?? "Sem departamento"
    const k = `${mes}|${departamento}`
    const r = rateio.get(k) ?? { mes, departamento, chamadas: 0, falhas: 0, entrada: 0, saida: 0, custo: null }
    r.chamadas++
    if (!c.sucesso) r.falhas++
    r.entrada += c.tokensEntrada
    r.saida += c.tokensSaida
    if (c.custo !== null) r.custo = (r.custo ?? 0) + c.custo
    rateio.set(k, r)
  }
  const linhasRateio = [...rateio.values()].sort(
    (a, b) => a.mes.localeCompare(b.mes) || a.departamento.localeCompare(b.departamento, "pt-BR")
  )

  const abas: AbaXlsx<unknown>[] = [
    aba<Rateio>(
      "Mês x departamento",
      [
        { titulo: "Mês", valor: (r) => r.mes.split("-").reverse().join("/"), largura: 10 },
        { titulo: "Departamento", valor: (r) => r.departamento, largura: 36 },
        { titulo: "Chamadas", valor: (r) => r.chamadas, largura: 11 },
        { titulo: "Falhas", valor: (r) => r.falhas, largura: 9 },
        { titulo: "Tokens de entrada", valor: (r) => r.entrada, largura: 16 },
        { titulo: "Tokens de saída", valor: (r) => r.saida, largura: 16 },
        { titulo: "Custo estimado (US$)", valor: (r) => usd(r.custo), largura: 16 },
      ],
      linhasRateio
    ),
    aba("Por departamento", colunasResumo("Departamento"), resumo.por.departamento),
    aba("Por pessoa", colunasResumo("Pessoa"), resumo.por.usuario),
    aba("Por processo", colunasResumo("Processo", "Módulo"), resumo.por.processo),
    aba("Por módulo", colunasResumo("Módulo"), resumo.por.modulo),
    aba("Por modelo", colunasResumo("Modelo"), resumo.por.modelo),
    aba<ChamadaIA>(
      "Chamadas",
      [
        { titulo: "Data", valor: (c) => dataXlsx(diaBR(c.criadoEm)), largura: 11 },
        { titulo: "Data e hora", valor: (c) => formatarDataHora(c.criadoEm), largura: 17 },
        { titulo: "Pessoa", valor: (c) => c.pessoa ?? "Sem pessoa (bot, tarefa agendada)", largura: 32 },
        { titulo: "Departamento", valor: (c) => c.departamento, largura: 26 },
        { titulo: "Módulo", valor: (c) => tituloModuloIA(c.modulo), largura: 18 },
        { titulo: "Processo", valor: (c) => processoIA(c.processo).titulo, largura: 44 },
        { titulo: "Modelo", valor: (c) => c.modelo, largura: 16 },
        { titulo: "Conta", valor: (c) => rotuloOrigem(c.origem), largura: 22 },
        { titulo: "Tokens de entrada", valor: (c) => c.tokensEntrada, largura: 14 },
        { titulo: "Dos quais em cache", valor: (c) => c.tokensEntradaCache, largura: 14 },
        { titulo: "Tokens de saída", valor: (c) => c.tokensSaida, largura: 14 },
        { titulo: "Custo estimado (US$)", valor: (c) => usd(c.custo, 6), largura: 14 },
        { titulo: "Duração (s)", valor: (c) => (c.duracaoMs === null ? null : Math.round(c.duracaoMs / 100) / 10), largura: 10 },
        { titulo: "Resultado", valor: (c) => (c.sucesso ? "ok" : c.origem === "bloqueada" ? "barrada" : "falhou"), largura: 10 },
        { titulo: "Erro", valor: (c) => c.erro, largura: 50 },
      ],
      chamadas
    ),
  ]

  await registrarExportacao(request, { usuarioId: sessao.usuario.id, recurso: "ia_uso", formato: "xlsx", quantidade: chamadas.length })
  return respostaXlsx(`uso-ia-${periodo.replace("_", "-")}`, planilhaXlsxAbas(abas))
}
