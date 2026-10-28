"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"

import { requirePermissao } from "@/lib/auth"
import { type EstadoForm } from "@/lib/contas"
import {
  atualizarReembolso,
  conferirLoteReembolsos,
  criarReembolso,
  excluirReembolso,
  salvarConfigReembolso,
  type LinhaLoteConferida,
} from "@/lib/db/filiacao-reembolsos-edicao"
import { criarPedido, pedidoPendente } from "@/lib/db/pedidos-dados-bancarios"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { lerListaLote } from "@/lib/reembolsos-lote"
import { ehTipoReembolso, type TipoReembolso } from "@/lib/reembolsos-tipos"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATA = /^\d{4}-\d{2}-\d{2}$/
const LISTA = "/painel/filiados/reembolsos"

/** Quem lança reembolso: a permissão de reembolsos ou a gestão da filiação. */
async function exigirEdicao() {
  return requirePermissao("filiacao_reembolsos", ["filiacao_gestao"])
}

const texto = (formData: FormData, campo: string) => {
  const v = String(formData.get(campo) ?? "").trim()
  return v === "" ? null : v
}
/** "35", "35,00", "R$ 35,00" e "1.234,56" viram número. */
const dinheiro = (formData: FormData, campo: string): number | null => {
  const bruto = String(formData.get(campo) ?? "").replace(/[^\d,.-]/g, "")
  if (!bruto) return null
  const normalizado = bruto.includes(",") ? bruto.replace(/\./g, "").replace(",", ".") : bruto
  const n = Number(normalizado)
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null
}

function revalidar(filiadoId?: string | null, id?: string) {
  revalidatePath(LISTA)
  if (id) revalidatePath(`${LISTA}/${id}`)
  if (filiadoId) revalidatePath(`/painel/filiados/${filiadoId}`)
  revalidatePath("/painel/financeiro/ordens")
}

function lerCampos(formData: FormData) {
  const data = texto(formData, "data")
  if (!data || !DATA.test(data)) return { erro: "Informe a data de referência." }
  const tipo = texto(formData, "tipo")
  if (!ehTipoReembolso(tipo)) return { erro: "Escolha o tipo do reembolso." }
  const justificativa = texto(formData, "justificativa")
  if (!justificativa) return { erro: "Diga o motivo do reembolso." }
  const projetoId = texto(formData, "projeto_id")
  if (projetoId && projetoId !== "sem_projeto" && !UUID.test(projetoId)) return { erro: "Projeto inválido." }
  const valor = dinheiro(formData, "valor")
  if (valor == null || !(valor > 0)) return { erro: "Informe o valor do reembolso." }
  // Comprovante opcional: o campo vazio chega como arquivo de tamanho zero.
  const arquivo = formData.get("comprovante")
  return {
    data,
    tipo,
    justificativa,
    projetoId: projetoId && projetoId !== "sem_projeto" ? projetoId : null,
    valor,
    comprovante: arquivo instanceof File && arquivo.size > 0 ? arquivo : null,
  }
}

export async function criarReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await exigirEdicao()
  const filiadoId = texto(formData, "filiado_id")
  if (!filiadoId || !UUID.test(filiadoId)) return { erro: "Selecione o filiado." }
  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const r = await criarReembolso({ filiadoId, ...campos }, sessao.usuario.id)
  if ("erro" in r) return { erro: r.erro }
  revalidar(filiadoId, r.id)
  redirect(`${LISTA}/${r.id}?salvo=1`)
}

export async function atualizarReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = texto(formData, "reembolso_id")
  if (!id || !UUID.test(id)) return { erro: "Reembolso inválido." }
  const campos = lerCampos(formData)
  if ("erro" in campos) return campos

  const r = await atualizarReembolso(id, campos)
  if ("erro" in r) return { erro: r.erro }
  revalidar(texto(formData, "filiado_id"), id)
  redirect(`${LISTA}/${id}?salvo=1`)
}

export async function excluirReembolsoAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  await exigirEdicao()
  const id = texto(formData, "reembolso_id")
  if (!id || !UUID.test(id)) return { erro: "Reembolso inválido." }
  const r = await excluirReembolso(id)
  if (r.erro) return { erro: r.erro }
  revalidar(texto(formData, "filiado_id"), id)
  redirect(`${LISTA}?excluido=1`)
}

export async function salvarConfigAction(
  _prev: EstadoForm,
  formData: FormData
): Promise<EstadoForm> {
  const sessao = await exigirEdicao()
  const centroCustoId = texto(formData, "centro_custo_id")
  if (centroCustoId && centroCustoId !== "sem_centro" && !UUID.test(centroCustoId)) {
    return { erro: "Centro de custo inválido." }
  }
  const r = await salvarConfigReembolso(
    {
      centroCustoId: centroCustoId && centroCustoId !== "sem_centro" ? centroCustoId : null,
    },
    sessao.usuario.id
  )
  if (r.erro) return { erro: r.erro }
  revalidatePath(LISTA)
  revalidatePath(`${LISTA}/configuracao`)
  return { ok: "Configuração salva." }
}

// ── Lançamento em lote ─────────────────────────────────────────────────────

/** O que vale para todas as linhas do lote. */
export type ComumLote = {
  data: string
  tipo: TipoReembolso
  justificativa: string
  projetoId: string | null
}

export type EstadoLote = {
  erro?: string
  comum?: ComumLote
  linhas?: LinhaLoteConferida[]
  /** Linhas da entrada que não eram dados (cabeçalho, linha em branco com texto). */
  ignoradas?: number
}

const MAXIMO_LOTE = 1000

/** Passo 1: lê a lista (colada ou planilha) e confere — nada é gravado. */
export async function conferirLoteAction(_prev: EstadoLote, formData: FormData): Promise<EstadoLote> {
  await exigirEdicao()
  const data = texto(formData, "data")
  if (!data || !DATA.test(data)) return { erro: "Informe a data de referência." }
  const tipo = texto(formData, "tipo")
  if (!ehTipoReembolso(tipo)) return { erro: "Escolha o tipo do reembolso." }
  const justificativa = texto(formData, "justificativa")
  if (!justificativa) return { erro: "Diga o motivo do reembolso — vale para todas as linhas." }
  const projetoBruto = texto(formData, "projeto_id")
  if (projetoBruto && projetoBruto !== "sem_projeto" && !UUID.test(projetoBruto)) return { erro: "Projeto inválido." }
  const projetoId = projetoBruto && projetoBruto !== "sem_projeto" ? projetoBruto : null

  const arquivo = formData.get("planilha")
  const lido = await lerListaLote(
    String(formData.get("lista") ?? ""),
    arquivo instanceof File && arquivo.size > 0 ? arquivo : null
  )
  if ("erro" in lido) return { erro: lido.erro }
  if (lido.linhas.length === 0) {
    return { erro: "Nenhuma linha com CPF e valor. Cole uma linha por filiado (CPF e valor) ou envie a planilha." }
  }
  if (lido.linhas.length > MAXIMO_LOTE) {
    return { erro: `São ${lido.linhas.length} linhas; o lote aceita até ${MAXIMO_LOTE}. Divida em partes.` }
  }
  const linhas = await conferirLoteReembolsos(lido.linhas, data)
  return { comum: { data, tipo, justificativa, projetoId }, linhas, ignoradas: lido.ignoradas }
}

export type ResultadoParteLote = { linha: number; id?: string; erro?: string }[]

/**
 * Passo 2: lança uma parte do lote (até 10 linhas; a tela manda em sequência
 * e mostra o progresso). Cada linha é um lançamento completo — ordem de
 * pagamento, prontuário —, como no formulário individual.
 */
export async function lancarLoteParteAction(
  comum: ComumLote,
  itens: { linha: number; filiadoId: string; valor: number }[]
): Promise<ResultadoParteLote> {
  const sessao = await exigirEdicao()
  if (!DATA.test(comum.data) || !ehTipoReembolso(comum.tipo) || !comum.justificativa?.trim()) {
    return itens.map((i) => ({ linha: i.linha, erro: "Dados do lote inválidos." }))
  }
  if (comum.projetoId && !UUID.test(comum.projetoId)) {
    return itens.map((i) => ({ linha: i.linha, erro: "Projeto inválido." }))
  }
  const saida: ResultadoParteLote = []
  for (const item of itens.slice(0, 10)) {
    if (!UUID.test(item.filiadoId) || !(item.valor > 0)) {
      saida.push({ linha: item.linha, erro: "Linha inválida." })
      continue
    }
    const r = await criarReembolso(
      {
        filiadoId: item.filiadoId,
        data: comum.data,
        tipo: comum.tipo,
        justificativa: comum.justificativa.trim(),
        projetoId: comum.projetoId,
        valor: Math.round(item.valor * 100) / 100,
      },
      sessao.usuario.id
    )
    saida.push("erro" in r ? { linha: item.linha, erro: r.erro } : { linha: item.linha, id: r.id })
  }
  revalidatePath(LISTA)
  revalidatePath("/painel/financeiro/ordens")
  return saida
}

export type ResultadoPedidoLote = {
  filiadoId: string
  nome: string | null
  /** e-mail: o pedido saiu por e-mail; link: sem e-mail, o link vai à mão (WhatsApp); ja_pedido: havia um aberto. */
  situacao: "email" | "link" | "ja_pedido" | "erro"
  link?: string
  email?: string
  /** Celular com WhatsApp do cadastro, só dígitos (com 55), para o link wa.me. */
  whatsapp?: string
  erro?: string
}

/**
 * "Pedir dados bancários" para os filiados do lote sem chave Pix nem conta:
 * o mesmo pedido por link da ficha (pedidos-dados-bancarios.ts — uso único, 7
 * dias, conta no CPF do próprio filiado). Com e-mail no cadastro, já sai por
 * e-mail; sem e-mail, devolve o link para mandar pelo WhatsApp. Quem já tem
 * pedido em aberto não recebe outro. Pode quem lança reembolso, além de quem
 * já podia pedir na ficha (gestão da filiação, pagamentos).
 */
export async function pedirDadosLoteAction(filiadoIds: string[]): Promise<ResultadoPedidoLote[]> {
  const sessao = await requirePermissao("filiacao_reembolsos", ["filiacao_gestao", "financeiro_pagamento"])
  const ids = [...new Set(filiadoIds.filter((id) => UUID.test(id)))].slice(0, 300)
  if (ids.length === 0) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: cadastros } = await admin
    .from("filiacoes")
    .select("id, nome_completo, email_pessoal, email_corporativo, telefone_1, telefone_1_whatsapp, telefone_2, telefone_2_whatsapp")
    .eq("emp_proprietaria_id", emp)
    .in("id", ids)
  const porId = new Map(((cadastros ?? []) as Record<string, unknown>[]).map((c) => [String(c.id), c]))
  const limpo = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)
  const emailValido = (v: string | null) => (v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null)

  const saida: ResultadoPedidoLote[] = []
  for (const id of ids) {
    const c = porId.get(id)
    const nome = limpo(c?.nome_completo)
    if (!c) {
      saida.push({ filiadoId: id, nome, situacao: "erro", erro: "Filiado não encontrado." })
      continue
    }
    if (await pedidoPendente({ tipo: "filiado", id })) {
      saida.push({ filiadoId: id, nome, situacao: "ja_pedido" })
      continue
    }
    const email = emailValido(limpo(c.email_pessoal)) ?? emailValido(limpo(c.email_corporativo))
    const fone = [
      c.telefone_1_whatsapp === true ? limpo(c.telefone_1) : null,
      c.telefone_2_whatsapp === true ? limpo(c.telefone_2) : null,
    ]
      .map((t) => (t ?? "").replace(/\D/g, ""))
      .find((t) => t.length >= 10)
    const whatsapp = fone ? (fone.startsWith("55") && fone.length >= 12 ? fone : `55${fone}`) : undefined
    const r = await criarPedido({ tipo: "filiado", id }, email ? "email" : "link", email, sessao.usuario.id)
    if (!r.link) {
      saida.push({ filiadoId: id, nome, situacao: "erro", erro: r.erro ?? "Não foi possível criar o pedido." })
    } else if (email && !r.erro) {
      saida.push({ filiadoId: id, nome, situacao: "email", email, link: r.link })
    } else {
      // Sem e-mail, ou o e-mail não saiu: o link vai à mão.
      saida.push({ filiadoId: id, nome, situacao: "link", link: r.link, whatsapp, erro: r.erro })
    }
  }
  return saida
}
