import "server-only"

import { esquemaAusente, lerEmLotes } from "@/lib/db/comum"
import { criarComprovacaoEConciliar } from "@/lib/db/conciliacao"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { quadroRepasse, regrasRepasse, tiposControlados, unidadesDeRepasse, invalidarAvisosRepasse } from "@/lib/db/repasse"
import { prazoDaCompetencia, type TipoContribuicao } from "@/lib/repasse"
import { sugerirDepositos, type CreditoExtrato, type RelacaoSemDeposito, type Sugestao } from "@/lib/repasse-extrato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Depósitos das fontes pagadoras achados no extrato (15/11/2026). Junta as
 * relações lançadas sem depósito do controle de envio com os créditos ainda
 * pendentes da conciliação bancária (banco_lancamentos) e sugere o par;
 * confirmar cria a comprovação da fonte na remessa e concilia o crédito
 * (lib/db/conciliacao.ts criarComprovacaoEConciliar), como na tela de
 * Conciliação do Financeiro.
 */

/** Dias depois do prazo do depósito em que um crédito ainda é procurado. */
const DIAS_APOS_PRAZO = 120

export type SugestaoDeposito = Sugestao & {
  tipo: TipoContribuicao
  remessaId: string
  /** Fonte da comprovação (no grupo centralizado, a pagadora). */
  fonteId: string
}

export type DepositosNoExtrato = {
  disponivel: boolean
  sugestoes: SugestaoDeposito[]
  /** Fim do período do extrato mais recente importado (AAAA-MM-DD); null = nenhum. */
  ultimoExtrato: string | null
}

const somarDias = (iso: string, dias: number) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export async function depositosNoExtrato(empresaId?: string): Promise<DepositosNoExtrato> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: ult, error: erroExtrato } = await admin
    .from("banco_extratos")
    .select("periodo_ate, created_at")
    .eq("emp_proprietaria_id", emp)
    .order("periodo_ate", { ascending: false, nullsFirst: false })
    .limit(1)
  if (erroExtrato) {
    if (esquemaAusente(erroExtrato)) return { disponivel: false, sugestoes: [], ultimoExtrato: null }
    throw new Error(`Falha ao ler os extratos: ${erroExtrato.message}`)
  }
  const ultimoExtrato = ult?.[0] ? String(ult[0].periodo_ate ?? ult[0].created_at).slice(0, 10) : null
  if (!ultimoExtrato) return { disponivel: true, sugestoes: [], ultimoExtrato: null }

  const regras = await regrasRepasse()
  if (!regras.disponivel) return { disponivel: false, sugestoes: [], ultimoExtrato }
  const [{ unidades }, fontes] = await Promise.all([unidadesDeRepasse(), listarFontesPagadoras()])
  const porFonte = new Map(fontes.map((f) => [f.id, f]))
  const unidade = new Map(unidades.map((u) => [u.id, u]))

  // Relações lançadas sem depósito, em todos os tipos controlados.
  const relacoes: (RelacaoSemDeposito & { tipo: TipoContribuicao; remessaId: string })[] = []
  for (const tipo of tiposControlados(regras)) {
    const q = await quadroRepasse({ tipo, empresaId })
    for (const l of q.linhas) {
      const u = unidade.get(l.id)
      const membros = (u?.fontes ?? [l.id]).map((id) => porFonte.get(id)).filter((f) => !!f)
      for (const c of l.celulas) {
        if (c.lancamentos === 0 || c.deposito !== null || !c.remessaId) continue
        relacoes.push({
          chave: `${l.id}|${c.competencia}|${tipo}`,
          empresaId: l.id,
          nome: l.nome,
          cnpjs: membros.flatMap((f) => (f!.cnpj_cpf ? [f!.cnpj_cpf] : [])),
          nomes: membros.flatMap((f) => [f!.nome_fantasia, f!.nome_razao].filter((n): n is string => !!n)),
          competencia: c.competencia,
          valorRelacao: c.valor,
          // A folha da competência sai no fim do mês: depósito antes do dia 20 dela é improvável.
          inicio: `${Math.floor(c.competencia / 100)}-${String(c.competencia % 100).padStart(2, "0")}-20`,
          fim: somarDias(prazoDaCompetencia(c.competencia, l.regra.diaDeposito), DIAS_APOS_PRAZO),
          prazo: prazoDaCompetencia(c.competencia, l.regra.diaDeposito),
          tipo,
          remessaId: c.remessaId,
        })
      }
    }
  }
  if (relacoes.length === 0) return { disponivel: true, sugestoes: [], ultimoExtrato }

  const desde = relacoes.reduce((m, r) => (r.inicio < m ? r.inicio : m), relacoes[0].inicio)
  const creditos = await lerEmLotes<{ id: string; data: string; valor: number | string; descricao: string | null; documento: string | null }>((a, b) =>
    admin
      .from("banco_lancamentos")
      .select("id, data, valor, descricao, documento")
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", "pendente")
      .gt("valor", 0)
      .gte("data", desde)
      .order("data")
      .order("id")
      .range(a, b)
  )
  const lista: CreditoExtrato[] = creditos.map((c) => ({
    id: c.id,
    data: String(c.data).slice(0, 10),
    valor: Number(c.valor),
    descricao: c.descricao,
    documento: c.documento,
  }))
  const extra = new Map(relacoes.map((r) => [r.chave, r]))
  const sugestoes = sugerirDepositos(lista, relacoes).map((s) => {
    const r = extra.get(s.relacao.chave)!
    return { ...s, tipo: r.tipo, remessaId: r.remessaId, fonteId: r.empresaId }
  })
  return { disponivel: true, sugestoes, ultimoExtrato }
}

/** Confirma o crédito do extrato como depósito da empresa na remessa. */
export async function confirmarDeposito(dados: {
  lancamentoId: string
  remessaId: string
  fonteId: string
  usuarioId: string
}): Promise<{ erro?: string }> {
  const r = await criarComprovacaoEConciliar(dados.lancamentoId, dados.remessaId, dados.fonteId, dados.usuarioId)
  if (!r.erro) invalidarAvisosRepasse()
  return r
}

/** Forma enxuta para o componente de cliente (sem CNPJs e nomes alternativos). */
export function sugestoesParaTela(lista: SugestaoDeposito[]) {
  return lista.map((s) => ({
    chave: s.relacao.chave,
    empresaNome: s.relacao.nome,
    tipo: s.tipo,
    competencia: s.relacao.competencia,
    valorRelacao: s.relacao.valorRelacao,
    remessaId: s.remessaId,
    fonteId: s.fonteId,
    seguro: s.seguro,
    candidatos: s.candidatos.map((c) => ({
      lancamentoId: c.credito.id,
      data: c.credito.data,
      valor: c.credito.valor,
      descricao: c.credito.descricao,
      confianca: c.confianca,
      motivos: c.motivos,
    })),
  }))
}

export type SugestaoDoCredito = {
  remessaId: string
  fonteId: string
  empresaNome: string
  tipo: TipoContribuicao
  competencia: number
  valorRelacao: number
  confianca: "alta" | "media" | "baixa"
  motivos: string[]
}

/**
 * O mesmo casamento visto pelo lado do extrato (tela de Conciliação): para
 * cada crédito pendente, as relações sem depósito de que ele pode ser o
 * depósito, a mais provável primeiro.
 */
export async function sugestoesPorCredito(): Promise<Map<string, SugestaoDoCredito[]>> {
  const { sugestoes } = await depositosNoExtrato()
  const porCredito = new Map<string, (SugestaoDoCredito & { pontos: number })[]>()
  for (const s of sugestoes) {
    for (const c of s.candidatos) {
      const lista = porCredito.get(c.credito.id) ?? []
      lista.push({
        remessaId: s.remessaId,
        fonteId: s.fonteId,
        empresaNome: s.relacao.nome,
        tipo: s.tipo,
        competencia: s.relacao.competencia,
        valorRelacao: s.relacao.valorRelacao,
        confianca: c.confianca,
        motivos: c.motivos,
        pontos: c.pontos,
      })
      porCredito.set(c.credito.id, lista)
    }
  }
  const saida = new Map<string, SugestaoDoCredito[]>()
  for (const [id, lista] of porCredito) {
    saida.set(
      id,
      lista
        .sort((a, b) => b.pontos - a.pontos || b.competencia - a.competencia)
        .slice(0, 3)
        .map((x) => ({
          remessaId: x.remessaId,
          fonteId: x.fonteId,
          empresaNome: x.empresaNome,
          tipo: x.tipo,
          competencia: x.competencia,
          valorRelacao: x.valorRelacao,
          confianca: x.confianca,
          motivos: x.motivos,
        }))
    )
  }
  return saida
}
