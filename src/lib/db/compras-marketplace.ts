import "server-only"

import type { SupabaseClient } from "@supabase/supabase-js"

import { DIAS_PARADA } from "@/lib/db/pendencias"
import { esquemaAusente, hojeSP } from "@/lib/db/comum"
import { compraNoEscopo, type EscopoCompras } from "@/lib/db/compras-acesso"
import { registrarEvento } from "@/lib/db/ordens-ciclo"
import { enviarEmail, type ContextoEmail } from "@/lib/email"
import { botaoEmail, escaparHtml, paragrafo, textoSuave } from "@/lib/email-layout"
import { formatarData, formatarMoeda } from "@/lib/formato"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * COMPRAS EM MARKETPLACE (16/10/2026 — supabase/compras-marketplace.sql).
 *
 * Na compra num marketplace (empresa.marketplace) o pagamento vai para a
 * plataforma — ela é a favorecida da ordem —, mas a nota fiscal chega depois,
 * emitida pelo VENDEDOR. O fornecimento nasce com `nota_a_receber` e fica na
 * lista "Notas a receber" até a nota ser anexada; a ordem NÃO espera a nota.
 * Ao anexar, liga-se o vendedor (`vendedor_id`): "XYZ, comprado através do
 * <marketplace>". Passados 7 dias sem nota, quem comprou recebe um e-mail
 * (uma vez — `nota_aviso_em`).
 */

/** Dias sem nota até o e-mail para quem comprou. */
export const DIAS_AVISO_NOTA = DIAS_PARADA

export type NotaAReceber = {
  fornecimentoId: string
  processoId: string
  codigo: string | null
  produto: string | null
  departamentoNome: string | null
  marketplace: string
  vendedor: string | null
  valor: number | null
  dataCompra: string | null
  dias: number
  comprador: string | null
  avisadoEm: string | null
}

type Linha = Record<string, unknown>
const t = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

function nomeEmpresa(e: Linha | undefined): string | null {
  if (!e) return null
  return t(e.nome_fantasia) ?? t(e.nome_razao)
}

function diasDesde(data: string | null): number {
  if (!data) return 0
  const ms = new Date(`${hojeSP()}T12:00:00`).getTime() - new Date(`${data.slice(0, 10)}T12:00:00`).getTime()
  return Math.max(0, Math.round(ms / 864e5))
}

/**
 * Compras de marketplace ainda sem nota, do escopo de quem vê (o comprador
 * central vê todas; os demais, as dos seus departamentos e as que lançaram ou
 * compraram). Mais antigas primeiro.
 */
export async function listarNotasAReceber(
  escopo: EscopoCompras | null
): Promise<{ disponivel: boolean; itens: NotaAReceber[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, vendedor_id, valor, data_compra, created_at, comprador_id, nota_aviso_em")
    .eq("emp_proprietaria_id", emp)
    .eq("nota_a_receber", true)
    .order("data_compra", { ascending: true, nullsFirst: true })
    .limit(1000)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, itens: [] }
    throw new Error(`Falha ao listar as notas a receber: ${error.message}`)
  }
  const forns = (data ?? []) as Linha[]
  if (!forns.length) return { disponivel: true, itens: [] }

  const ids = (k: string) => [...new Set(forns.map((f) => t(f[k])).filter((v): v is string => !!v))]
  const [procs, empresas, usuarios] = await Promise.all([
    admin
      .from("compras_solicitacoes")
      .select("id, codigo, solicitacao_produto, solicitacao_departamento_id, solicitante_id, cancelado")
      .in("id", ids("processo_id")),
    admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", [...ids("fornecedor_id"), ...ids("vendedor_id")]),
    admin.from("usuarios").select("id, nome_completo, nome_guerra").in("id", ids("comprador_id")),
  ])
  const procPorId = new Map(((procs.data ?? []) as Linha[]).map((p) => [String(p.id), p]))
  const empPorId = new Map(((empresas.data ?? []) as Linha[]).map((e) => [String(e.id), e]))
  const usuPorId = new Map(((usuarios.data ?? []) as Linha[]).map((u) => [String(u.id), u]))
  const deptos = [...new Set([...procPorId.values()].map((p) => t(p.solicitacao_departamento_id)).filter((v): v is string => !!v))]
  const { data: dps } = deptos.length
    ? await admin.from("empresa_departamentos").select("id, departamento").in("id", deptos)
    : { data: [] as Linha[] }
  const deptoPorId = new Map(((dps ?? []) as Linha[]).map((d) => [String(d.id), t(d.departamento)]))

  const itens: NotaAReceber[] = []
  for (const f of forns) {
    const p = procPorId.get(String(f.processo_id))
    if (!p || p.cancelado === true) continue
    const comprador = t(f.comprador_id)
    if (
      escopo &&
      comprador !== escopo.usuarioId &&
      !compraNoEscopo(escopo, { departamentoId: t(p.solicitacao_departamento_id), solicitanteId: t(p.solicitante_id) })
    ) {
      continue
    }
    const data = t(f.data_compra) ?? t(f.created_at)?.slice(0, 10) ?? null
    const u = comprador ? usuPorId.get(comprador) : undefined
    itens.push({
      fornecimentoId: String(f.id),
      processoId: String(p.id),
      codigo: t(p.codigo),
      produto: t(p.solicitacao_produto),
      departamentoNome: deptoPorId.get(String(p.solicitacao_departamento_id)) ?? null,
      marketplace: nomeEmpresa(empPorId.get(String(f.fornecedor_id))) ?? "(marketplace)",
      vendedor: f.vendedor_id ? nomeEmpresa(empPorId.get(String(f.vendedor_id))) : null,
      valor: f.valor === null || f.valor === undefined ? null : Number(f.valor),
      dataCompra: data,
      dias: diasDesde(data),
      comprador: u ? (t(u.nome_completo) ?? t(u.nome_guerra)) : null,
      avisadoEm: t(f.nota_aviso_em),
    })
  }
  itens.sort((a, b) => b.dias - a.dias)
  return { disponivel: true, itens }
}

/** O fornecimento do processo, se for de marketplace. */
async function fornecimentoDoProcesso(processoId: string, fornecimentoId: string) {
  const admin = await createAdminClient()
  const { data: f } = await admin
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, vendedor_id, nota_fiscal_url, nota_a_receber, ordem_pagamento_id")
    .eq("id", fornecimentoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!f || f.processo_id !== processoId) return null
  return f as Linha
}

async function nomeDe(id: string | null): Promise<string | null> {
  if (!id) return null
  const { data } = await (await createAdminClient())
    .from("empresa")
    .select("nome_fantasia, nome_razao")
    .eq("id", id)
    .maybeSingle()
  return nomeEmpresa((data ?? undefined) as Linha | undefined)
}

/**
 * Chegou a nota da compra em marketplace: anexa no fornecimento (e nas ordens
 * dele que ainda não têm nota), liga o vendedor e tira a compra de Notas a
 * receber. A correção na ordem faz a auditoria reavaliá-la.
 */
export async function receberNotaMarketplace(dados: {
  processoId: string
  fornecimentoId: string
  caminho: string
  vendedorId: string | null
  usuarioId: string
}): Promise<{ erro?: string }> {
  const f = await fornecimentoDoProcesso(dados.processoId, dados.fornecimentoId)
  if (!f) return { erro: "Fornecimento não encontrado neste processo." }
  const vendedorId = dados.vendedorId && dados.vendedorId !== f.fornecedor_id ? dados.vendedorId : t(f.vendedor_id)
  const admin = await createAdminClient()
  const anterior = t(f.nota_fiscal_url)

  const { error } = await admin
    .from("compras_fornecimentos")
    .update({
      nota_fiscal_url: dados.caminho,
      nota_a_receber: false,
      vendedor_id: vendedorId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", dados.fornecimentoId)
  if (error) return { erro: `Não foi possível salvar a nota: ${error.message}` }

  // Aquisição direta guarda a mesma nota como comprovante do processo.
  await admin
    .from("compras_solicitacoes")
    .update({ comprovante_url: dados.caminho })
    .eq("id", dados.processoId)
    .eq("comprado", true)
    .is("comprovante_url", null)

  const [marketplace, vendedor] = await Promise.all([nomeDe(t(f.fornecedor_id)), nomeDe(vendedorId)])
  const quem = vendedor ? `${vendedor}, comprado através de ${marketplace ?? "marketplace"}` : `comprado através de ${marketplace ?? "marketplace"}`

  // Ordens do fornecimento (as com fornecimento_id e a principal) sem nota
  // própria passam a ter a do vendedor.
  for (const o of await ordensDoFornecimento(dados.processoId, dados.fornecimentoId, t(f.ordem_pagamento_id))) {
    if (o.situacao === "Cancelada") continue
    const sem = !t(o.arquivo_nota_fiscal) || t(o.arquivo_nota_fiscal) === anterior
    if (sem) await admin.from("ordens_pagamento").update({ arquivo_nota_fiscal: dados.caminho }).eq("id", String(o.id))
    await registrarEvento(
      String(o.id),
      "corrigida",
      dados.usuarioId,
      `Nota fiscal do marketplace recebida — ${quem}.`,
      { campo: "arquivo_nota_fiscal", antes: o.arquivo_nota_fiscal ?? null, depois: sem ? dados.caminho : o.arquivo_nota_fiscal, vendedor_id: vendedorId }
    )
  }
  return {}
}

/** Liga (ou troca) o vendedor de uma compra em marketplace, com ou sem nota. */
export async function vincularVendedor(dados: {
  processoId: string
  fornecimentoId: string
  vendedorId: string
  usuarioId: string
}): Promise<{ erro?: string }> {
  const f = await fornecimentoDoProcesso(dados.processoId, dados.fornecimentoId)
  if (!f) return { erro: "Fornecimento não encontrado neste processo." }
  if (dados.vendedorId === f.fornecedor_id) return { erro: "O vendedor é outra empresa — não o próprio marketplace." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("compras_fornecimentos")
    .update({ vendedor_id: dados.vendedorId, updated_at: new Date().toISOString() })
    .eq("id", dados.fornecimentoId)
  if (error) return { erro: `Não foi possível salvar o vendedor: ${error.message}` }
  const [marketplace, vendedor] = await Promise.all([nomeDe(t(f.fornecedor_id)), nomeDe(dados.vendedorId)])
  const ordens = await ordensDoFornecimento(dados.processoId, dados.fornecimentoId, t(f.ordem_pagamento_id))
  if (ordens.length) {
    await registrarEvento(
      ordens.map((o) => String(o.id)),
      "corrigida",
      dados.usuarioId,
      `Vendedor identificado — ${vendedor ?? "?"}, comprado através de ${marketplace ?? "marketplace"}.`,
      { vendedor_id: dados.vendedorId, antes: { vendedor_id: f.vendedor_id ?? null } }
    )
  }
  return {}
}

/** As ordens que pagam o fornecimento (coluna fornecimento_id e a principal). */
async function ordensDoFornecimento(processoId: string, fornecimentoId: string, principal: string | null): Promise<Linha[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("ordens_pagamento")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("processo_compra_id", processoId)
    .not("excluido", "is", true)
  return ((data ?? []) as Linha[]).filter((o) => o.fornecimento_id === fornecimentoId || (principal && o.id === principal))
}

// ── Na ficha do fornecedor ──────────────────────────────────────────────────

export type CompraViaMarketplace = {
  processoId: string
  codigo: string | null
  produto: string | null
  dataCompra: string | null
  valor: number | null
  /** No marketplace, o vendedor; no vendedor, o marketplace. */
  outro: string | null
  notaAReceber: boolean
}

/**
 * Compras em marketplace ligadas a um cadastro: no MARKETPLACE, as feitas por
 * ele (com o vendedor de cada uma); no VENDEDOR, as que ele vendeu através de
 * uma plataforma. Vazio sem o SQL.
 */
export async function comprasViaMarketplace(
  empresaId: string,
  ehMarketplace: boolean
): Promise<CompraViaMarketplace[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("compras_fornecimentos")
    .select("processo_id, fornecedor_id, vendedor_id, valor, data_compra, nota_a_receber")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq(ehMarketplace ? "fornecedor_id" : "vendedor_id", empresaId)
    .order("data_compra", { ascending: false })
    .limit(200)
  if (error || !data?.length) return []
  const forns = data as Linha[]
  const outros = [...new Set(forns.map((f) => t(ehMarketplace ? f.vendedor_id : f.fornecedor_id)).filter((v): v is string => !!v))]
  const [procs, emps] = await Promise.all([
    admin
      .from("compras_solicitacoes")
      .select("id, codigo, solicitacao_produto, cancelado")
      .in("id", [...new Set(forns.map((f) => String(f.processo_id)))]),
    outros.length ? admin.from("empresa").select("id, nome_fantasia, nome_razao").in("id", outros) : Promise.resolve({ data: [] }),
  ])
  const procPorId = new Map(((procs.data ?? []) as Linha[]).map((p) => [String(p.id), p]))
  const empPorId = new Map(((emps.data ?? []) as Linha[]).map((e) => [String(e.id), e]))
  return forns
    .map((f) => {
      const p = procPorId.get(String(f.processo_id))
      if (!p || p.cancelado === true) return null
      const outroId = t(ehMarketplace ? f.vendedor_id : f.fornecedor_id)
      return {
        processoId: String(p.id),
        codigo: t(p.codigo),
        produto: t(p.solicitacao_produto),
        dataCompra: t(f.data_compra),
        valor: f.valor === null || f.valor === undefined ? null : Number(f.valor),
        outro: outroId ? nomeEmpresa(empPorId.get(outroId)) : null,
        notaAReceber: f.nota_a_receber === true,
      }
    })
    .filter((c): c is CompraViaMarketplace => c !== null)
}

// ── E-mail de 7 dias (tick diário das pendências) ──────────────────────────

/**
 * Para cada compra de marketplace sem nota há DIAS_AVISO_NOTA dias ou mais e
 * ainda não avisada, um e-mail a quem comprou (ou a quem lançou) e o registro
 * em `nota_aviso_em` — uma vez por compra. Roda fora de requisição: recebe o
 * cliente de serviço, o tenant e o contexto do e-mail.
 */
export async function avisarNotasAReceber(
  client: SupabaseClient,
  tenantId: string,
  contexto: ContextoEmail
): Promise<{ avisados: number; erros: string[] }> {
  const erros: string[] = []
  const limite = (() => {
    const d = new Date(`${hojeSP()}T12:00:00`)
    d.setDate(d.getDate() - DIAS_AVISO_NOTA)
    return d.toISOString().slice(0, 10)
  })()
  const { data, error } = await client
    .from("compras_fornecimentos")
    .select("id, processo_id, fornecedor_id, valor, data_compra, comprador_id")
    .eq("emp_proprietaria_id", tenantId)
    .eq("nota_a_receber", true)
    .is("nota_aviso_em", null)
    .lte("data_compra", limite)
    .limit(500)
  if (error) {
    if (!esquemaAusente(error)) erros.push(error.message)
    return { avisados: 0, erros }
  }
  const forns = (data ?? []) as Linha[]
  if (!forns.length) return { avisados: 0, erros }

  const procIds = [...new Set(forns.map((f) => String(f.processo_id)))]
  const { data: procs } = await client
    .from("compras_solicitacoes")
    .select("id, codigo, solicitacao_produto, solicitante_id, cancelado")
    .in("id", procIds)
  const procPorId = new Map(((procs ?? []) as Linha[]).map((p) => [String(p.id), p]))
  const empIds = [...new Set(forns.map((f) => String(f.fornecedor_id)))]
  const { data: emps } = await client.from("empresa").select("id, nome_fantasia, nome_razao").in("id", empIds)
  const empPorId = new Map(((emps ?? []) as Linha[]).map((e) => [String(e.id), e]))

  let avisados = 0
  for (const f of forns) {
    const p = procPorId.get(String(f.processo_id))
    if (!p || p.cancelado === true) continue
    const destinoId = t(f.comprador_id) ?? t(p.solicitante_id)
    if (!destinoId) continue
    const { data: u } = await client
      .from("usuarios")
      .select("id, nome_completo, nome_guerra, email")
      .eq("id", destinoId)
      .maybeSingle()
    const email = t(u?.email)
    const marketplace = nomeEmpresa(empPorId.get(String(f.fornecedor_id))) ?? "o marketplace"
    const dias = diasDesde(t(f.data_compra))
    const link = `/painel/compras/${p.id}`
    const texto = `A nota fiscal da compra ${t(p.codigo) ?? ""} (${t(p.solicitacao_produto) ?? "sem descrição"}), feita em ${marketplace}, ainda não foi anexada — ${dias} dias desde a compra.`
    try {
      await client.from("notificacoes").insert({
        usuario_id: destinoId,
        notificacao: texto.slice(0, 500),
        notificado: false,
        notificacao_data: hojeSP(),
        link,
      })
      if (email) {
        const url = `${contexto.origem}${link}`
        await enviarEmail({
          email,
          nome: t(u?.nome_completo) ?? t(u?.nome_guerra),
          assunto: `Nota fiscal pendente — compra ${t(p.codigo) ?? ""} em ${marketplace}`,
          html:
            paragrafo(
              `A compra <strong>${escaparHtml(t(p.codigo) ?? "")}</strong> — ${escaparHtml(t(p.solicitacao_produto) ?? "sem descrição")} — foi feita em <strong>${escaparHtml(marketplace)}</strong> em ${escaparHtml(formatarData(t(f.data_compra)))}${f.valor != null ? `, no valor de ${escaparHtml(formatarMoeda(Number(f.valor)))}` : ""}.`
            ) +
            paragrafo(
              `Já se passaram <strong>${dias} dias</strong> e a nota fiscal do vendedor ainda não foi anexada. Baixe a nota na plataforma e anexe-a na compra (botão <strong>Anexar nota</strong>): a IA identifica o vendedor e a compra sai de Notas a receber.`
            ) +
            botaoEmail(url, "Abrir a compra") +
            textoSuave("Este aviso é enviado uma vez por compra, 7 dias depois dela, enquanto a nota não chega."),
          contexto,
        })
      }
      await client.from("compras_fornecimentos").update({ nota_aviso_em: new Date().toISOString() }).eq("id", String(f.id))
      avisados++
    } catch (e) {
      erros.push(`${String(f.id)}: ${e instanceof Error ? e.message : String(e)}`)
    }
  }
  return { avisados, erros }
}
