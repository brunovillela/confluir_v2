import "server-only"

import { validarCnpj, validarCpf } from "@/lib/cpf"
import { alcadaDoUsuario } from "@/lib/db/compras"
import { rateioDaOrdem } from "@/lib/db/ordens-rateio"
import type { Procedencia } from "@/lib/db/ordens-procedencia"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * AUDITORIA AUTOMÁTICA de uma ordem de pagamento: verificações objetivas que
 * um auditor (interno ou externo) faria à mão — documento, favorecido,
 * autorização dentro da alçada, segregação de funções, pagamento depois da
 * autorização, valor e prazo, comprovante, recebimento, duplicidade, rateio.
 * Roda na hora (não grava nada): sai na tela da ordem e no extrato.
 */

export type StatusAuditoria = "ok" | "alerta" | "falha" | "pendente" | "na"

export type ItemAuditoria = {
  codigo: string
  rotulo: string
  status: StatusAuditoria
  detalhe: string
}

export type ResultadoAuditoria = {
  itens: ItemAuditoria[]
  resumo: Record<StatusAuditoria, number>
  /** Pior status encontrado (falha > alerta > pendente > ok). */
  geral: "ok" | "alerta" | "falha" | "pendente"
}

type Linha = Record<string, unknown>

const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
const n = (v: unknown) => {
  if (v === null || v === undefined || v === "") return null
  const x = Number(v)
  return Number.isFinite(x) ? x : null
}

/** Tipos cuja autorização pode ser dispensada (aprovados em outra instância). */
const TIPOS_COM_DISPENSA = ["Folha de pagamento", "Contrato", "Locação de veículos - Mensalidade"]
/** Tipos que exigem documento de suporte anexado (NF, contracheque, fatura, RPA). */
const TIPOS_COM_DOCUMENTO = ["Compras", "Folha de pagamento", "Hospedagem", "RPA"]
const ENCERRADAS = ["Cancelada", "Estornado"]

function docValido(doc: string | null): boolean | null {
  const d = (doc ?? "").replace(/\D/g, "")
  if (!d) return null
  if (d.length === 11) return validarCpf(d)
  if (d.length === 14) return validarCnpj(d)
  return false
}

async function alcadaDe(usuarioId: string): Promise<number | null> {
  const admin = await createAdminClient()
  const { data: base } = await admin.from("permissoes").select("*").eq("usuario_id", usuarioId).maybeSingle()
  if (!base) return null
  const p = await resolverPermissoes(admin, usuarioId, base as never)
  return alcadaDoUsuario(p as Record<string, unknown>)
}

export async function auditarOrdem(
  ordem: Linha,
  procedencia: Procedencia
): Promise<ResultadoAuditoria> {
  const itens: ItemAuditoria[] = []
  const add = (codigo: string, rotulo: string, status: StatusAuditoria, detalhe: string) =>
    itens.push({ codigo, rotulo, status, detalhe })

  const admin = await createAdminClient()
  const id = String(ordem.id)
  const tipo = t(ordem.tipo) ?? ""
  const situacao = t(ordem.situacao) ?? ""
  const valor = n(ordem.valor_inicial_cobranca)
  const paga = situacao === "Paga"
  const encerrada = ENCERRADAS.includes(situacao)
  const pelaCaixa = Boolean(t(ordem.caixa_conta_id))

  // 1. Valor
  add("valor", "Valor da cobrança definido", valor !== null && valor > 0 ? "ok" : "falha",
    valor !== null && valor > 0 ? formatarMoeda(valor) : "A ordem não tem valor.")

  // 2. Centro de custo da despesa / rateio
  const rateio = await rateioDaOrdem(id)
  const temCentro = Boolean(t(ordem.centro_custo_despesa_id))
  if (rateio.length > 0) {
    const soma = Math.round(rateio.reduce((a, r) => a + (r.valor ?? 0), 0) * 100) / 100
    const fecha = valor !== null && Math.abs(soma - valor) < 0.01
    add("centro_despesa", "Classificação da despesa (rateio)", fecha && rateio.every((r) => r.centroCustoNome) ? "ok" : "falha",
      fecha ? `${rateio.length} contas somando ${formatarMoeda(soma)}.` : `Rateio soma ${formatarMoeda(soma)}, diferente do valor da ordem.`)
  } else {
    add("centro_despesa", "Centro de custo da despesa", temCentro ? "ok" : "falha",
      temCentro ? "Informado." : "Sem centro de custo da despesa — a despesa não está classificada.")
  }

  // 3–4. Favorecido
  let favDoc: string | null = null
  let favNome: string | null = null
  let bloqueado = false
  const fornId = t(ordem.beneficiario_fornecedor_id) ?? t(ordem.fornecedor_id)
  if (fornId) {
    const { data: e } = await admin.from("empresa").select("nome_fantasia, nome_razao, cnpj_cpf, fornecedor_bloqueado, bloqueado").eq("id", fornId).maybeSingle()
    favNome = t(e?.nome_fantasia) ?? t(e?.nome_razao)
    favDoc = t(e?.cnpj_cpf)
    bloqueado = e?.fornecedor_bloqueado === true || e?.bloqueado === true
  } else if (t(ordem.beneficiario_usuario_id)) {
    const { data: u } = await admin.from("usuarios").select("nome_completo, cpf").eq("id", String(ordem.beneficiario_usuario_id)).maybeSingle()
    favNome = t(u?.nome_completo)
    favDoc = t(u?.cpf)
  } else {
    favNome = t(ordem.beneficiario_nome_avulso)
    favDoc = t(ordem.beneficiario_doc_avulso)
  }
  const dv = docValido(favDoc)
  add("favorecido", "Favorecido identificado com CPF/CNPJ válido",
    !favNome ? "falha" : dv === true ? "ok" : dv === null ? "alerta" : "falha",
    !favNome ? "A ordem não tem favorecido." : dv === true ? `${favNome}.` : dv === null ? `${favNome} — sem CPF/CNPJ no cadastro.` : `${favNome} — CPF/CNPJ inválido (${favDoc}).`)
  if (fornId) {
    add("bloqueio", "Fornecedor não bloqueado", bloqueado ? "falha" : "ok",
      bloqueado ? "O fornecedor está BLOQUEADO no cadastro." : "Fornecedor ativo.")
  }

  // 5. Procedência
  const semOrigem = procedencia.origem === "Origem não identificada"
  add("procedencia", "Procedência identificada", semOrigem ? "alerta" : "ok",
    semOrigem ? "Não foi possível ligar a ordem a um registro de origem." : `${procedencia.origem}${procedencia.titulo ? ` — ${procedencia.titulo}` : ""}.`)

  // 6. Documento de suporte
  if (TIPOS_COM_DOCUMENTO.includes(tipo)) {
    const temDoc = Boolean(t(ordem.arquivo_nota_fiscal)) || procedencia.documentos.some((d) => d.url)
    add("documento", "Documento fiscal/de suporte anexado", temDoc ? "ok" : "falha",
      temDoc ? "Anexado." : "Sem nota fiscal, contracheque, fatura ou RPA anexado.")
  } else {
    add("documento", "Documento fiscal/de suporte anexado", t(ordem.arquivo_nota_fiscal) ? "ok" : "na",
      t(ordem.arquivo_nota_fiscal) ? "Anexado." : "Não exigido para esta origem.")
  }

  // 7. Autorização
  const autorizado = ordem.autorizacao_esta_autorizado === true
  const dispensada = ordem.autorizacao_dispensada === true
  const autorizadorId = t(ordem.autorizacao_autorizador_id)
  if (encerrada) {
    add("autorizacao", "Autorização", "na", `Ordem ${situacao.toLowerCase()}.`)
  } else if (dispensada) {
    const valida = TIPOS_COM_DISPENSA.includes(tipo)
    add("autorizacao", "Autorização", valida ? "ok" : "falha",
      valida ? t(ordem.autorizacao_dispensa_motivo) ?? "Dispensada." : `Dispensa registrada para origem que exige autorização (${tipo}).`)
  } else if (autorizado && autorizadorId) {
    const alcada = await alcadaDe(autorizadorId)
    const dentro = alcada !== null && valor !== null && valor <= alcada
    const { data: au } = await admin.from("usuarios").select("nome_completo").eq("id", autorizadorId).maybeSingle()
    add("autorizacao", "Autorizada dentro da alçada", dentro ? "ok" : "alerta",
      `${t(au?.nome_completo) ?? "Avaliador"} em ${formatarData(t(ordem.autorizacao_data) ?? "")} — alçada atual ${alcada === null ? "desconhecida" : alcada >= Number.MAX_SAFE_INTEGER ? "sem teto" : formatarMoeda(alcada)}${dentro ? "" : " (abaixo do valor da ordem)"}.`)
  } else if (autorizado) {
    add("autorizacao", "Autorização", "alerta", "Marcada como autorizada, sem avaliador registrado (dado legado).")
  } else if (paga) {
    add("autorizacao", "Autorização", "falha", "Paga SEM autorização registrada.")
  } else if (situacao === "A pagar" || situacao === "Processando") {
    add("autorizacao", "Autorização", "alerta", `Liberada para pagamento ("${situacao}") sem autorização registrada — dado anterior ao rito atual.`)
  } else {
    add("autorizacao", "Autorização", "pendente",
      situacao === "Aguardando informações" ? "Devolvida pelo avaliador — aguardando informações." : "Aguardando avaliação por quem tem alçada.")
  }

  // 8. Segregação de funções
  if (autorizadorId && !dispensada) {
    const envolvidos = [procedencia.solicitante, ...procedencia.envolvidos].filter((p) => p?.id)
    const conflito = envolvidos.find((p) => p!.id === autorizadorId)
    add("segregacao", "Segregação: quem autorizou não originou a despesa",
      conflito ? "alerta" : envolvidos.length ? "ok" : "na",
      conflito ? `A mesma pessoa ${conflito.papel.toLowerCase()} e autorizou.` : envolvidos.length ? "Pessoas diferentes." : "A origem não registra quem a pediu.")
  }

  // 9–13. Pagamento
  if (paga) {
    const dp = t(ordem.data_pagamento)
    const da = t(ordem.autorizacao_data)
    if (pelaCaixa) {
      add("ordem_pagamento", "Pagamento depois da autorização", "ok", "Compra em dinheiro: paga pelo caixa no ato, autorizada depois (rito da compra direta).")
    } else if (dp && da && !dispensada) {
      add("ordem_pagamento", "Pagamento depois da autorização", dp >= da ? "ok" : "falha",
        dp >= da ? `Autorizada em ${formatarData(da)}, paga em ${formatarData(dp)}.` : `Paga em ${formatarData(dp)}, ANTES da autorização (${formatarData(da)}).`)
    }
    const pago = n(ordem.valor_pago)
    add("valor_pago", "Valor pago igual ao cobrado",
      pago !== null && valor !== null && Math.abs(pago - valor) < 0.01 ? "ok" : "alerta",
      pago === null ? "Sem valor pago." : valor !== null && Math.abs(pago - valor) >= 0.01 ? `Pago ${formatarMoeda(pago)} × cobrado ${formatarMoeda(valor)} (diferença ${formatarMoeda(pago - valor)}).` : formatarMoeda(pago))
    const venc = t(ordem.vencimento)
    if (venc && dp) {
      add("prazo", "Pago até o vencimento", dp <= venc ? "ok" : "alerta",
        dp <= venc ? `Vencimento ${formatarData(venc)}.` : `Pago em ${formatarData(dp)}, após o vencimento (${formatarData(venc)}).`)
    }
    add("comprovante", "Comprovante de pagamento anexado",
      pelaCaixa ? "na" : t(ordem.arquivo_pagamento) ? "ok" : "alerta",
      pelaCaixa ? "Pago em dinheiro pelo caixa — o registro está no extrato do caixa." : t(ordem.arquivo_pagamento) ? "Anexado." : "Sem comprovante do pagamento.")
    add("centro_debito", "Conta de onde saiu o dinheiro (débito)", t(ordem.centro_custo_receita_id) ? "ok" : "falha",
      t(ordem.centro_custo_receita_id) ? "Informada." : "Sem centro de custo do débito.")
  }

  // 14. Recebimento (compras)
  if (procedencia.recebimento) {
    const r = procedencia.recebimento
    add("recebimento", "Recebimento do bem/serviço confirmado",
      r.recebido ? (r.deAcordo === false ? "alerta" : "ok") : "pendente",
      r.recebido ? `Recebido${r.data ? ` em ${formatarData(r.data)}` : ""}${r.por ? ` por ${r.por}` : ""}${r.deAcordo === false ? " — COM RESSALVA" : ""}.` : "Ainda não recebido.")
  }

  // 15. Duplicidade
  if (valor !== null && (fornId || t(ordem.beneficiario_usuario_id)) && !encerrada) {
    const base = t(ordem.vencimento) ?? t(ordem.created_at)?.slice(0, 10) ?? null
    let q = admin
      .from("ordens_pagamento")
      .select("codigo, vencimento")
      .eq("emp_proprietaria_id", await tenantAtual())
      .neq("id", id)
      .eq("valor_inicial_cobranca", valor)
      .not("situacao", "in", '("Cancelada","Estornado")')
      .not("excluido", "is", true)
    q = fornId ? q.eq("beneficiario_fornecedor_id", fornId) : q.eq("beneficiario_usuario_id", String(ordem.beneficiario_usuario_id))
    if (base) {
      const d = new Date(`${base}T12:00:00`)
      const ini = new Date(d.getTime() - 7 * 864e5).toISOString().slice(0, 10)
      const fim = new Date(d.getTime() + 7 * 864e5).toISOString().slice(0, 10)
      q = q.gte("vencimento", ini).lte("vencimento", fim)
    }
    const { data: dup } = await q.limit(5)
    const lista = (dup ?? []).map((o) => t(o.codigo)).filter(Boolean)
    add("duplicidade", "Sem cobrança em duplicidade", lista.length ? "alerta" : "ok",
      lista.length ? `Mesmo favorecido e valor em ±7 dias: ${lista.join(", ")}.` : "Nenhuma ordem parecida.")
  }

  // 16. Cancelamento
  if (situacao === "Cancelada") {
    add("cancelamento", "Cancelamento motivado", t(ordem.cancelamento_motivo) ? "ok" : "alerta",
      t(ordem.cancelamento_motivo) ?? "Cancelada sem motivo registrado (dado legado).")
  }

  const resumo: Record<StatusAuditoria, number> = { ok: 0, alerta: 0, falha: 0, pendente: 0, na: 0 }
  for (const i of itens) resumo[i.status]++
  const geral = resumo.falha ? "falha" : resumo.alerta ? "alerta" : resumo.pendente ? "pendente" : "ok"
  return { itens, resumo, geral }
}
