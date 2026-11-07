import "server-only"

import { sugerirOrdens, type ComprovanteLido, type Sugestao } from "@/lib/comprovantes-casamento"
import { lerEmLotes } from "@/lib/db/comum"
import { conciliarComOrdem, montarLancamento, ordensCandidatas, type Lancamento } from "@/lib/db/conciliacao"
import { ordensAPagar, resumoDaOrdem, type OrdemResumo } from "@/lib/db/comprovantes-distribuicao"
import { registrarPagamentoDaOrdem } from "@/lib/db/ordens-pagamento"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * PAGAR PELO EXTRATO (07/11/2026). A conciliação só casava débito com ordem
 * já PAGA; o Financeiro, porém, paga no banco e registra ordem por ordem
 * depois. Aqui, o débito do extrato que não tem ordem paga correspondente
 * ganha a sugestão de uma ordem ainda A pagar/Processando (mesmo casamento da
 * distribuição de comprovantes: valor, nome no histórico, CPF/CNPJ, data);
 * confirmado, a ordem é paga com a data e o valor do extrato, pelas travas do
 * pagamento da ordem, e o lançamento fica conciliado com ela.
 */

const JANELA_VENCIMENTO = 60

// Palavras do histórico bancário que não são o nome de ninguém.
const RUIDO =
  /\b(pix|enviado|enviada|envio|transf(erencia)?|ted|doc|tev|pagto|pgto|pagamento|pag|boleto|bloqueto|titulo|deb(ito)?|autorizado|agendado|qr|code|cobranca|tarifa|internet|banking|sispag|fornecedor(es)?|para|p\/)\b/gi

function nomeDoHistorico(descricao: string | null): string | null {
  const limpo = (descricao ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(RUIDO, " ")
    .replace(/[\d/.\-*]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
  return limpo.length >= 3 ? limpo : null
}

/** CPF/CNPJ que às vezes vem no histórico ou no documento. */
function documentoDoHistorico(...textos: (string | null)[]): string | null {
  for (const t of textos) {
    const m = (t ?? "").match(/\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}|\d{3}\.?\d{3}\.?\d{3}-?\d{2}/)
    if (m) return m[0]
  }
  return null
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + dias)
  return d.toISOString().slice(0, 10)
}

export type DebitoParaPagar = {
  lancamento: Pick<Lancamento, "id" | "extratoId" | "data" | "valor" | "descricao" | "tipo">
  sugestoes: Sugestao[]
}

export type PagamentosDoExtrato = {
  itens: DebitoParaPagar[]
  ordens: Record<string, OrdemResumo>
  /** Conta de débito sugerida (centro de custo da conta bancária do extrato). */
  centroSugerido: string | null
}

/** Débitos pendentes sem ordem paga correspondente e com ordem a pagar parecida. */
export async function pagamentosDoExtrato(extratoId?: string): Promise<PagamentosDoExtrato> {
  const vazio: PagamentosDoExtrato = { itens: [], ordens: {}, centroSugerido: null }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const linhas = await lerEmLotes<Record<string, unknown>>((a, b) => {
    let q = admin.from("banco_lancamentos").select("*").eq("emp_proprietaria_id", emp).eq("situacao", "pendente").lt("valor", 0)
    if (extratoId) q = q.eq("extrato_id", extratoId)
    return q.order("id").range(a, b)
  }).catch(() => [] as Record<string, unknown>[])
  if (linhas.length === 0) return vazio
  const debitos = linhas.map((l) => montarLancamento(l)).sort((a, b) => b.data.localeCompare(a.data)).slice(0, 500)

  // O que já tem ordem paga para casar fica na conciliação normal.
  const jaPagas = await ordensCandidatas(debitos)
  const semPaga = debitos.filter((l) => !jaPagas.get(l.id)?.length)
  if (semPaga.length === 0) return vazio

  const datas = semPaga.map((l) => l.data).sort()
  const candidatas = await ordensAPagar(somarDias(datas[0], -JANELA_VENCIMENTO), somarDias(datas[datas.length - 1], JANELA_VENCIMENTO))
  if (candidatas.length === 0) return vazio

  const itens: DebitoParaPagar[] = []
  const usadas = new Set<string>()
  for (const l of semPaga) {
    const lido: ComprovanteLido = {
      paginas: [],
      tipo: l.tipo,
      valor: Math.round(Math.abs(l.valor) * 100) / 100,
      data: l.data,
      favorecido: nomeDoHistorico(l.descricao),
      documento: documentoDoHistorico(l.descricao, l.documento),
      chavePix: null,
      linhaDigitavel: (l.documento ?? "").replace(/\D/g, "").length >= 44 ? l.documento : null,
    }
    const sugestoes = sugerirOrdens(lido, candidatas)
    if (sugestoes.length === 0) continue
    sugestoes.forEach((s) => usadas.add(s.ordemId))
    itens.push({
      lancamento: { id: l.id, extratoId: l.extratoId, data: l.data, valor: l.valor, descricao: l.descricao, tipo: l.tipo },
      sugestoes,
    })
  }
  const ordens: Record<string, OrdemResumo> = {}
  for (const c of candidatas) if (usadas.has(c.id)) ordens[c.id] = resumoDaOrdem(c)
  return { itens, ordens, centroSugerido: await centroDaContaDoExtrato(itens[0]?.lancamento.extratoId ?? null) }
}

/** A conta bancária cadastrada com o número da conta do extrato: o centro de custo dela. */
async function centroDaContaDoExtrato(extratoId: string | null): Promise<string | null> {
  if (!extratoId) return null
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: extrato } = await admin.from("banco_extratos").select("conta").eq("id", extratoId).maybeSingle()
  const conta = String(extrato?.conta ?? "").replace(/\D/g, "").replace(/^0+/, "")
  if (!conta) return null
  const { data: contas } = await admin
    .from("financeiro_contas_bancarias")
    .select("conta, conta_dv, centro_custo_id")
    .eq("emp_proprietaria_id", emp)
    .not("centro_custo_id", "is", null)
  const achada = (contas ?? []).find((c) => {
    const n = String(c.conta ?? "").replace(/\D/g, "").replace(/^0+/, "")
    const comDv = n + String(c.conta_dv ?? "").replace(/\D/g, "")
    return n && (conta === n || conta === comDv || conta.startsWith(n))
  })
  return achada ? String(achada.centro_custo_id) : null
}

/** Paga a ordem com a data e o valor do débito e concilia o lançamento com ela. */
export async function pagarPeloLancamento(
  lancamentoId: string,
  ordemId: string,
  { centroReceitaId, usuarioId }: { centroReceitaId: string; usuarioId: string }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("banco_lancamentos")
    .select("*")
    .eq("id", lancamentoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!data) return { erro: "lançamento não encontrado." }
  const l = montarLancamento(data as Record<string, unknown>)
  if (l.situacao !== "pendente") return { erro: "o lançamento já foi tratado." }
  if (l.valor >= 0) return { erro: "só um débito paga uma ordem." }
  const r = await registrarPagamentoDaOrdem({
    id: ordemId,
    valor: Math.round(Math.abs(l.valor) * 100) / 100,
    dataPagamento: l.data,
    centroReceitaId,
    usuarioId,
    arquivo: null,
  })
  if (r.erro) return { erro: r.erro }
  const c = await conciliarComOrdem(lancamentoId, ordemId, usuarioId)
  if (c.erro) return { erro: `paga, mas não conciliada: ${c.erro}` }
  return {}
}
