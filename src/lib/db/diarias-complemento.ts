import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { buscarSolicitacaoDiaria, type SolicitacaoDiaria } from "@/lib/db/diarias"
import { adicionarDespesaDiaria, removerDespesaDiaria } from "@/lib/db/diarias-despesas"
import { garantirRemessaAberta, recalcularRemessa } from "@/lib/db/diarias-remessas"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * DESPESAS DEPOIS DA VIAGEM (16/10/2026). Quem já recebeu a diária (aprovada)
 * lança, em até PRAZO_DIAS após o fim dela, as despesas extras com
 * comprovante. Elas entram num COMPLEMENTO da diária original — solicitação
 * de valor zero, com `complemento_de`, que só carrega as despesas — na
 * remessa em preparação da pessoa, e seguem o fluxo de sempre (enviar,
 * avaliar, ordem rateada). A diária original e a ordem dela não mudam.
 * Tabela: supabase/diarias-despesa-posterior.sql.
 */

export const PRAZO_DIAS = 30

/** Último dia (AAAA-MM-DD) para lançar despesa depois da viagem; null sem data. */
export function prazoDespesaPosterior(s: Pick<SolicitacaoDiaria, "data_inicio" | "data_termino">): string | null {
  const fim = (s.data_termino ?? s.data_inicio)?.slice(0, 10)
  if (!fim) return null
  const d = new Date(`${fim}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + PRAZO_DIAS)
  return d.toISOString().slice(0, 10)
}

function hojeSP(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date())
}

/** A diária aceita despesa posterior agora? (aprovada, não é complemento, dentro do prazo). */
export function aceitaDespesaPosterior(s: SolicitacaoDiaria): boolean {
  if (s.situacao !== "aprovada" || s.complementoDe) return false
  const limite = prazoDespesaPosterior(s)
  return Boolean(limite && hojeSP() <= limite)
}

/** Complementos de uma diária (qualquer situação), mais antigos primeiro. */
export async function complementosDe(origemId: string): Promise<SolicitacaoDiaria[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_solicitacoes")
    .select("id")
    .eq("complemento_de", origemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: true })
  if (error) return []
  const lista = await Promise.all(((data ?? []) as { id: string }[]).map((c) => buscarSolicitacaoDiaria(c.id)))
  return lista.filter((c): c is SolicitacaoDiaria => Boolean(c))
}

/** O complemento ainda editável (aguardando, remessa em preparação ou devolvida). */
export async function complementoAberto(origemId: string): Promise<SolicitacaoDiaria | null> {
  const todos = await complementosDe(origemId)
  return (
    todos.find(
      (c) =>
        c.situacao === "aguardando" &&
        !c.remessaEnviada &&
        (c.remessaSituacao === "preparacao" || c.remessaSituacao === "devolvida")
    ) ?? null
  )
}

/**
 * Lança uma despesa depois da viagem na diária `origemId`. Cria (ou reusa) o
 * complemento na remessa em preparação do beneficiário. `usuarioId` é quem
 * lança; a permissão (beneficiário, quem lançou a diária ou a gestão da
 * porta) é conferida pela action.
 */
export async function lancarDespesaPosterior(dados: {
  origemId: string
  usuarioId: string
  tipoId: string | null
  descricao: string | null
  valor: number
  arquivo: File | null
}): Promise<{ erro?: string }> {
  const origem = await buscarSolicitacaoDiaria(dados.origemId)
  if (!origem || !origem.funcionario_id) return { erro: "Diária não encontrada." }
  if (origem.complementoDe) return { erro: "Lance a despesa na diária original." }
  if (origem.situacao !== "aprovada") {
    return { erro: "Só diária já recebida (aprovada) aceita despesa depois da viagem." }
  }
  const limite = prazoDespesaPosterior(origem)
  if (!limite || hojeSP() > limite) {
    return {
      erro: `O prazo para lançar despesa depois da viagem é de ${PRAZO_DIAS} dias após o fim da diária${limite ? ` — terminou em ${limite.split("-").reverse().join("/")}` : ""}.`,
    }
  }

  let complemento = await complementoAberto(origem.id)
  if (!complemento) {
    const remessaId = await garantirRemessaAberta(origem.funcionario_id, origem.beneficiarioTipo, origem.departamentoId)
    if (!remessaId) return { erro: "Não foi possível abrir a remessa — rode supabase/diarias-remessa-preparacao.sql." }
    const admin = await createAdminClient()
    const { data, error } = await admin
      .from("pessoal_diarias_solicitacoes")
      .insert({
        funcionario_id: origem.funcionario_id,
        diaria_id: origem.diaria_id,
        quantidade: 1,
        motivo: `Despesas depois da viagem — ${origem.motivo ?? "diária"}`.slice(0, 500),
        data_inicio: origem.data_inicio,
        data_termino: origem.data_termino,
        situacao: "aguardando",
        valor_unitario: 0,
        valor_total: 0,
        beneficiario_tipo: origem.beneficiarioTipo,
        departamento_id: origem.departamentoId,
        solicitante_id: dados.usuarioId,
        remessa_id: remessaId,
        complemento_de: origem.id,
        emp_proprietaria_id: await tenantAtual(),
      })
      .select("id")
      .single()
    if (error) {
      if (esquemaAusente(error) || error.code === "PGRST204" || /complemento_de/.test(error.message)) {
        return { erro: "Rode supabase/diarias-despesa-posterior.sql antes de lançar despesa depois da viagem." }
      }
      return { erro: `Não foi possível lançar: ${error.message}` }
    }
    complemento = await buscarSolicitacaoDiaria(String(data.id))
    if (!complemento) return { erro: "Não foi possível lançar a despesa." }
  }

  const r = await adicionarDespesaDiaria({
    solicitacaoId: complemento.id,
    tipoId: dados.tipoId,
    descricao: dados.descricao,
    valor: dados.valor,
    arquivo: dados.arquivo,
  })
  if (r.erro) return r
  if (complemento.remessaId) await recalcularRemessa(complemento.remessaId)
  return {}
}

/**
 * Exclui uma despesa do complemento; sem despesa nenhuma, o complemento é
 * cancelado (não sobra solicitação de valor zero na remessa).
 */
export async function removerDespesaPosterior(despesaId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: d } = await admin
    .from("pessoal_diarias_solicitacao_despesas")
    .select("solicitacao_id")
    .eq("id", despesaId)
    .maybeSingle()
  const solicitacaoId = d?.solicitacao_id ? String(d.solicitacao_id) : null
  const r = await removerDespesaDiaria(despesaId)
  if (r.erro || !solicitacaoId) return r
  const complemento = await buscarSolicitacaoDiaria(solicitacaoId)
  if (complemento?.complementoDe && complemento.despesas.length === 0) {
    await admin
      .from("pessoal_diarias_solicitacoes")
      .update({ situacao: "cancelada", avaliacao_observacao: "Sem despesas — complemento retirado.", updated_at: new Date().toISOString() })
      .eq("id", solicitacaoId)
      .eq("situacao", "aguardando")
  }
  if (complemento?.remessaId) await recalcularRemessa(complemento.remessaId)
  return {}
}
