import "server-only"

import { avisar, depoisDaResposta, type Destinatario } from "@/lib/db/avisos"
import { calcularSaldo } from "@/lib/db/caixa"
import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { registrarEvento } from "@/lib/db/ordens-ciclo"
import { formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * RECONHECIMENTO DE DESPESA NO CAIXA (06/10/2026 — supabase/caixa-reconhecimento.sql).
 *
 * Quem compra em dinheiro escolhe uma conta de caixa aberta — e pode errar.
 * Se a conta não é de quem lançou, o débito entra na hora (a compra não
 * trava), mas fica PENDENTE: a ordem ganha um apontamento de auditoria e o
 * responsável da conta, um pedido na caixa de entrada. Reconhecida, o
 * apontamento some. Não reconhecida (com motivo), vira pendência de quem
 * lançou — que TRANSFERE a despesa para a conta certa (a linha da conta
 * errada é cancelada; a nova vai ao reconhecimento do novo responsável).
 */

export type SituacaoReconhecimento = "pendente" | "reconhecida" | "nao_reconhecida" | "transferida"

export const CODIGO_AUDITORIA_CAIXA = "caixa_reconhecimento"
const TITULO_AUDITORIA_CAIXA = "Despesa reconhecida pelo responsável do caixa"

export type DespesaCaixa = {
  id: string
  contaId: string
  contaNome: string | null
  responsavelId: string | null
  responsavelNome: string | null
  valor: number
  descricao: string | null
  lancadaPorId: string | null
  lancadaPorNome: string | null
  ordemId: string | null
  ordemCodigo: string | null
  reconhecimento: SituacaoReconhecimento
  motivo: string | null
  criadaEm: string | null
}

/** Responsável (e nome) de uma conta de caixa. */
async function contaComResponsavel(contaId: string): Promise<{ id: string; nome: string; responsavelId: string } | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("caixa_contas")
    .select("id, nome, responsavel_usuario_id")
    .eq("id", contaId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data ? { id: String(data.id), nome: String(data.nome), responsavelId: String(data.responsavel_usuario_id) } : null
}

/** A despesa precisa do reconhecimento do responsável? (lançada por outra pessoa) */
export async function exigeReconhecimento(contaId: string, lancadaPor: string): Promise<boolean> {
  const conta = await contaComResponsavel(contaId)
  return Boolean(conta && conta.responsavelId !== lancadaPor)
}

/**
 * Grava a situação na auditoria da ordem (ordens_pagamento_verificacoes): a
 * última verificação do código vale — "ok" tira o alerta da avaliação.
 */
async function auditarNaOrdem(ordemId: string | null, status: "alerta" | "ok", detalhe: string): Promise<void> {
  if (!ordemId) return
  try {
    const admin = await createAdminClient()
    const { error } = await admin.from("ordens_pagamento_verificacoes").insert({
      emp_proprietaria_id: await tenantAtual(),
      ordem_id: ordemId,
      origem: "Caixa",
      codigo: CODIGO_AUDITORIA_CAIXA,
      titulo: TITULO_AUDITORIA_CAIXA,
      severidade: "alertar",
      status,
      detalhe: detalhe.slice(0, 500),
    })
    if (error && !esquemaAusente(error)) console.error("auditoria do caixa:", error.message)
  } catch (e) {
    console.error("auditoria do caixa:", e)
  }
}

async function destinatario(usuarioId: string): Promise<Destinatario | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("usuarios").select("id, nome_completo, nome_guerra, email").eq("id", usuarioId).maybeSingle()
  return data
    ? { id: String(data.id), nome: texto(data.nome_completo) ?? texto(data.nome_guerra), email: texto(data.email), permissoes: {} }
    : null
}

/** Pede ao responsável que reconheça a despesa (caixa de entrada + aviso). */
async function pedirReconhecimento(conta: { nome: string; responsavelId: string }, valor: number, descricao: string, lancadaPor: string): Promise<void> {
  const [quem, nomes] = await Promise.all([destinatario(conta.responsavelId), nomesDosUsuarios([lancadaPor])])
  if (!quem) return
  depoisDaResposta(() =>
    avisar([quem], {
      texto: `${nomes.get(lancadaPor) ?? "Alguém"} lançou ${formatarMoeda(valor)} no seu caixa "${conta.nome}": ${descricao}`.slice(0, 300),
      link: "/painel/perfil/caixa#reconhecer",
      evento: "pendencia_caixa",
      assunto: "Despesa lançada no seu caixa — reconheça ou não",
    })
  )
}

/**
 * Chamado logo depois do débito da compra no caixa: se a conta não é de quem
 * lançou, marca a despesa pendente, alerta a auditoria da ordem e avisa o
 * responsável. Sem as colunas (SQL não rodado), não faz nada.
 */
export async function marcarParaReconhecimento(movId: string, contaId: string, lancadaPor: string, ordemId: string | null, valor: number, descricao: string): Promise<void> {
  const conta = await contaComResponsavel(contaId)
  if (!conta || conta.responsavelId === lancadaPor) return
  const admin = await createAdminClient()
  const { error } = await admin.from("caixa_movimentacoes").update({ reconhecimento: "pendente" }).eq("id", movId)
  if (error) {
    if (!esquemaAusente(error)) console.error("reconhecimento do caixa:", error.message)
    return
  }
  const nomes = await nomesDosUsuarios([conta.responsavelId])
  await auditarNaOrdem(ordemId, "alerta", `Lançada no caixa "${conta.nome}" por outra pessoa — aguardando o reconhecimento de ${nomes.get(conta.responsavelId) ?? "o responsável"}.`)
  await pedirReconhecimento(conta, valor, descricao, lancadaPor)
}

// ── Listas (Meu perfil → Despesas em caixas) ─────────────────────────────────

async function montar(linhas: Record<string, unknown>[]): Promise<DespesaCaixa[]> {
  if (!linhas.length) return []
  const admin = await createAdminClient()
  const contaIds = [...new Set(linhas.map((l) => String(l.conta_id)))]
  const ordemIds = [...new Set(linhas.map((l) => texto(l.ordem_pagamento_id)).filter((v): v is string => Boolean(v)))]
  const [contas, ordens] = await Promise.all([
    admin.from("caixa_contas").select("id, nome, responsavel_usuario_id").in("id", contaIds),
    ordemIds.length ? admin.from("ordens_pagamento").select("id, codigo").in("id", ordemIds) : Promise.resolve({ data: [] }),
  ])
  const contaPor = new Map((contas.data ?? []).map((c) => [String(c.id), c]))
  const codigoPor = new Map(((ordens.data ?? []) as { id: string; codigo: string | null }[]).map((o) => [String(o.id), o.codigo]))
  const nomes = await nomesDosUsuarios([
    ...new Set(
      [...linhas.map((l) => texto(l.criada_por_usuario_id)), ...(contas.data ?? []).map((c) => texto(c.responsavel_usuario_id))].filter(
        (v): v is string => Boolean(v)
      )
    ),
  ])
  return linhas.map((l) => {
    const conta = contaPor.get(String(l.conta_id))
    const resp = texto(conta?.responsavel_usuario_id)
    const lanc = texto(l.criada_por_usuario_id)
    const ordemId = texto(l.ordem_pagamento_id)
    return {
      id: String(l.id),
      contaId: String(l.conta_id),
      contaNome: texto(conta?.nome),
      responsavelId: resp,
      responsavelNome: resp ? (nomes.get(resp) ?? null) : null,
      valor: Number(l.valor),
      descricao: texto(l.descricao),
      lancadaPorId: lanc,
      lancadaPorNome: lanc ? (nomes.get(lanc) ?? null) : null,
      ordemId,
      ordemCodigo: ordemId ? (codigoPor.get(ordemId) ?? null) : null,
      reconhecimento: l.reconhecimento as SituacaoReconhecimento,
      motivo: texto(l.reconhecimento_motivo),
      criadaEm: texto(l.created_at),
    }
  })
}

/** Despesas lançadas por outras pessoas nos caixas de que a pessoa é responsável. */
export async function despesasParaReconhecer(usuarioId: string): Promise<{ disponivel: boolean; lista: DespesaCaixa[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: contas } = await admin.from("caixa_contas").select("id").eq("emp_proprietaria_id", emp).eq("responsavel_usuario_id", usuarioId)
  const ids = (contas ?? []).map((c) => String(c.id))
  if (!ids.length) return { disponivel: true, lista: [] }
  const { data, error } = await admin
    .from("caixa_movimentacoes")
    .select("*")
    .in("conta_id", ids)
    .eq("situacao", "confirmada")
    .eq("reconhecimento", "pendente")
    .order("created_at", { ascending: true })
  if (error) return { disponivel: !esquemaAusente(error), lista: [] }
  return { disponivel: true, lista: await montar((data ?? []) as Record<string, unknown>[]) }
}

/** Despesas que a pessoa lançou em caixas de outras pessoas e ainda não foram reconhecidas. */
export async function despesasLancadasEmAberto(usuarioId: string): Promise<{ disponivel: boolean; lista: DespesaCaixa[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("caixa_movimentacoes")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("criada_por_usuario_id", usuarioId)
    .eq("situacao", "confirmada")
    .in("reconhecimento", ["pendente", "nao_reconhecida"])
    .order("created_at", { ascending: true })
  if (error) return { disponivel: !esquemaAusente(error), lista: [] }
  return { disponivel: true, lista: await montar((data ?? []) as Record<string, unknown>[]) }
}

/** Situação do reconhecimento da despesa de uma ordem (auditoria ao vivo). */
export async function reconhecimentoDaOrdem(ordemId: string): Promise<{ situacao: SituacaoReconhecimento; contaNome: string | null; motivo: string | null } | null> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("caixa_movimentacoes")
    .select("reconhecimento, reconhecimento_motivo, conta_id, situacao")
    .eq("ordem_pagamento_id", ordemId)
    .eq("situacao", "confirmada")
    .not("reconhecimento", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error || !data) return null
  const conta = await contaComResponsavel(String(data.conta_id))
  return { situacao: data.reconhecimento as SituacaoReconhecimento, contaNome: conta?.nome ?? null, motivo: texto(data.reconhecimento_motivo) }
}

/**
 * O que ainda não foi resolvido numa conta: despesas esperando o
 * reconhecimento do responsável e despesas não reconhecidas que ainda não
 * foram transferidas. Só as primeiras travam a prestação de contas — a não
 * reconhecida já não pesa no saldo da conta (o valor voltou).
 */
export async function reconhecimentosEmAberto(contaId: string): Promise<{ pendentes: number; naoReconhecidas: number }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("caixa_movimentacoes")
    .select("reconhecimento")
    .eq("conta_id", contaId)
    .eq("situacao", "confirmada")
    .in("reconhecimento", ["pendente", "nao_reconhecida"])
  if (error) return { pendentes: 0, naoReconhecidas: 0 }
  const lista = (data ?? []) as { reconhecimento: string }[]
  return {
    pendentes: lista.filter((m) => m.reconhecimento === "pendente").length,
    naoReconhecidas: lista.filter((m) => m.reconhecimento === "nao_reconhecida").length,
  }
}

/** Mensagem do bloqueio da prestação de contas (null = pode prestar). */
export function bloqueioPrestacao(abertos: { pendentes: number; naoReconhecidas: number }): string | null {
  return abertos.pendentes
    ? `Antes de prestar contas, avalie ${abertos.pendentes} despesa(s) lançada(s) por outras pessoas esperando o seu reconhecimento — no quadro "Para reconhecer", aqui no Meu caixa.`
    : null
}

// ── Decisões ─────────────────────────────────────────────────────────────────

async function carregarMov(movId: string) {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("caixa_movimentacoes")
    .select("*")
    .eq("id", movId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data as Record<string, unknown> | null
}

/** O responsável da conta reconhece (ou não, com motivo) a despesa lançada por outra pessoa. */
export async function avaliarDespesaCaixa(movId: string, usuarioId: string, reconhece: boolean, motivo: string | null): Promise<{ erro?: string }> {
  const mov = await carregarMov(movId)
  if (!mov) return { erro: "Despesa não encontrada." }
  if (mov.reconhecimento !== "pendente" || mov.situacao !== "confirmada") return { erro: "Esta despesa já foi avaliada." }
  const conta = await contaComResponsavel(String(mov.conta_id))
  if (!conta || conta.responsavelId !== usuarioId) return { erro: "Só o responsável da conta avalia as despesas lançadas nela." }
  if (!reconhece && (!motivo || motivo.trim().length < 5)) return { erro: "Diga por que não reconhece a despesa." }

  const admin = await createAdminClient()
  const { error } = await admin
    .from("caixa_movimentacoes")
    .update({
      reconhecimento: reconhece ? "reconhecida" : "nao_reconhecida",
      reconhecimento_por_usuario_id: usuarioId,
      reconhecimento_em: new Date().toISOString(),
      reconhecimento_motivo: reconhece ? null : motivo!.trim(),
    })
    .eq("id", movId)
    .eq("reconhecimento", "pendente")
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }

  const ordemId = texto(mov.ordem_pagamento_id)
  const valor = Number(mov.valor)
  const nomes = await nomesDosUsuarios([usuarioId])
  const quem = nomes.get(usuarioId) ?? "O responsável"
  if (reconhece) {
    await auditarNaOrdem(ordemId, "ok", `${quem} reconheceu a despesa no caixa "${conta.nome}".`)
  } else {
    await auditarNaOrdem(ordemId, "alerta", `${quem} NÃO reconheceu a despesa no caixa "${conta.nome}": ${motivo!.trim()} — quem lançou deve transferi-la para a conta certa.`)
    const lancadaPor = texto(mov.criada_por_usuario_id)
    const dest = lancadaPor ? await destinatario(lancadaPor) : null
    if (dest) {
      depoisDaResposta(() =>
        avisar([dest], {
          texto: `${quem} não reconheceu a despesa de ${formatarMoeda(valor)} no caixa "${conta.nome}": ${motivo!.trim()}. Transfira para a conta certa.`.slice(0, 300),
          link: "/painel/perfil/despesas-caixa",
          evento: "pendencia_caixa",
          assunto: "Despesa de caixa não reconhecida — transfira para a conta certa",
        })
      )
    }
  }
  if (ordemId) {
    await registrarEvento(
      ordemId,
      "caixa_reconhecimento",
      usuarioId,
      reconhece ? `Despesa reconhecida no caixa "${conta.nome}".` : `Despesa não reconhecida no caixa "${conta.nome}": ${motivo!.trim()}`,
      { mov_id: movId, reconhecida: reconhece }
    )
  }
  return {}
}

/**
 * Transfere a despesa para outra conta de caixa aberta: a linha da conta
 * errada é cancelada (o saldo volta) e nasce a mesma despesa na conta certa,
 * que vai ao reconhecimento do novo responsável (se não for quem lançou).
 * Pode transferir quem lançou ou a administração do caixa.
 */
export async function transferirDespesaCaixa(
  movId: string,
  usuarioId: string,
  novaContaId: string,
  administra: boolean
): Promise<{ erro?: string }> {
  const mov = await carregarMov(movId)
  if (!mov) return { erro: "Despesa não encontrada." }
  if (mov.situacao !== "confirmada" || !["pendente", "nao_reconhecida"].includes(String(mov.reconhecimento))) {
    return { erro: "Esta despesa não está esperando transferência." }
  }
  const lancadaPor = texto(mov.criada_por_usuario_id)
  if (lancadaPor !== usuarioId && !administra) return { erro: "Só quem lançou a despesa (ou a administração do caixa) a transfere." }
  if (String(mov.conta_id) === novaContaId) return { erro: "Escolha uma conta diferente da atual." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: nova } = await admin
    .from("caixa_contas")
    .select("id, nome, responsavel_usuario_id, situacao, ativa")
    .eq("id", novaContaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!nova || nova.ativa !== true || nova.situacao !== "aberta") return { erro: "A conta de destino precisa estar aberta." }
  const valor = Number(mov.valor)
  const { data: movsNova } = await admin
    .from("caixa_movimentacoes")
    .select("tipo, situacao, valor, reconhecimento")
    .eq("conta_id", novaContaId)
  const saldo = calcularSaldo(
    (movsNova ?? []).map((m) => ({
      tipo: String(m.tipo),
      situacao: String(m.situacao),
      valor: Number(m.valor),
      reconhecimento: (m.reconhecimento as string | null) ?? null,
    }))
  )
  if (saldo < valor) return { erro: `A conta "${nova.nome}" não tem saldo para a despesa (${formatarMoeda(saldo)}).` }

  const contaAntiga = await contaComResponsavel(String(mov.conta_id))
  const dono = lancadaPor ?? usuarioId
  const precisa = String(nova.responsavel_usuario_id) !== dono
  const { data: criada, error: erroNova } = await admin
    .from("caixa_movimentacoes")
    .insert({
      emp_proprietaria_id: emp,
      conta_id: novaContaId,
      tipo: mov.tipo,
      situacao: "confirmada",
      valor,
      descricao: texto(mov.descricao),
      criada_por_usuario_id: dono,
      confirmada_em: new Date().toISOString(),
      ordem_pagamento_id: texto(mov.ordem_pagamento_id),
      reconhecimento: precisa ? "pendente" : null,
      transferida_de_mov_id: movId,
    })
    .select("id")
    .single()
  if (erroNova || !criada) return { erro: `Não foi possível transferir: ${erroNova?.message ?? "?"}` }
  const { error: erroAntiga } = await admin
    .from("caixa_movimentacoes")
    .update({ situacao: "cancelada", reconhecimento: "transferida" })
    .eq("id", movId)
  if (erroAntiga) {
    await admin.from("caixa_movimentacoes").delete().eq("id", criada.id)
    return { erro: `Não foi possível transferir: ${erroAntiga.message}` }
  }

  const ordemId = texto(mov.ordem_pagamento_id)
  if (ordemId) await admin.from("ordens_pagamento").update({ caixa_conta_id: novaContaId }).eq("id", ordemId)
  const destino = { nome: String(nova.nome), responsavelId: String(nova.responsavel_usuario_id) }
  if (precisa) {
    const nomes = await nomesDosUsuarios([destino.responsavelId])
    await auditarNaOrdem(ordemId, "alerta", `Transferida do caixa "${contaAntiga?.nome ?? "?"}" para "${destino.nome}" — aguardando o reconhecimento de ${nomes.get(destino.responsavelId) ?? "o responsável"}.`)
    await pedirReconhecimento(destino, valor, texto(mov.descricao) ?? "despesa", dono)
  } else {
    await auditarNaOrdem(ordemId, "ok", `Transferida para o caixa "${destino.nome}", de quem lançou a despesa.`)
  }
  if (ordemId) {
    await registrarEvento(ordemId, "caixa_transferida", usuarioId, `Despesa transferida do caixa "${contaAntiga?.nome ?? "?"}" para "${destino.nome}".`, {
      de: String(mov.conta_id),
      para: novaContaId,
    })
  }
  return {}
}
