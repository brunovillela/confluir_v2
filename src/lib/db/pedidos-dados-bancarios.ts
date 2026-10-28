import "server-only"

import { lerDocumentoTitular, mesmoTitular } from "@/lib/cpf"
import type { EntradaDadosBancarios } from "@/lib/dados-bancarios"
import { texto } from "@/lib/db/comum"
import { dadoRepetido } from "@/lib/db/dados-bancarios-repetida"
import { ligarOrdensSemForma } from "@/lib/db/ordens-destino"
import { nomeEntidade } from "@/lib/db/organizacao"
import { enviarEmail } from "@/lib/email"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { origemAtual } from "@/lib/tenant-url"

/**
 * PEDIDO DE DADOS BANCÁRIOS (27/10/2026): em vez de o Financeiro ir atrás da
 * conta e digitá-la, manda ao favorecido (fornecedor, funcionário/diretor ou
 * filiado) um link de uso único, sem login. Ele informa a chave Pix ou a
 * conta; a resposta entra como dado bancário NOVO do dono (nunca altera um
 * existente) e as ordens dele que esperavam a conta seguem sozinhas
 * (ligarOrdensSemForma). Segurança: o link só vale no domínio da entidade,
 * expira em 7 dias, serve uma vez, e o titular da conta tem de ser o próprio
 * dono (documento_esperado; mesma raiz de CNPJ vale) — um link vazado não
 * desvia pagamento para outra pessoa.
 */

export type DonoPedido = { tipo: "fornecedor" | "usuario" | "filiado"; id: string }
export type CanalPedido = "link" | "email" | "whatsapp"
export type SituacaoPedido = "aberto" | "respondido" | "expirado" | "cancelado"

export type PedidoDadosBancarios = {
  id: string
  token: string
  canal: CanalPedido
  enviadoPara: string | null
  criadoEm: string
  expiraEm: string
  abertoEm: string | null
  respondidoEm: string | null
  situacao: SituacaoPedido
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const COLUNA_DO_DONO = { fornecedor: "fornecedor_id", usuario: "usuario_id", filiado: "filiado_id" } as const

function situacaoDe(l: Record<string, unknown>): SituacaoPedido {
  if (l.respondido_em) return "respondido"
  if (l.cancelado_em) return "cancelado"
  return new Date(String(l.expira_em)).getTime() < Date.now() ? "expirado" : "aberto"
}

function comoPedido(l: Record<string, unknown>): PedidoDadosBancarios {
  return {
    id: String(l.id),
    token: String(l.token),
    canal: String(l.canal) as CanalPedido,
    enviadoPara: texto(l.enviado_para),
    criadoEm: String(l.created_at),
    expiraEm: String(l.expira_em),
    abertoEm: texto(l.aberto_em),
    respondidoEm: texto(l.respondido_em),
    situacao: situacaoDe(l),
  }
}

/** Nome e CPF/CNPJ (válido) do dono, como estão no cadastro. */
async function dadosDoDono(dono: DonoPedido): Promise<{ nome: string; documento: string | null } | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  if (dono.tipo === "fornecedor") {
    const { data } = await admin
      .from("empresa")
      .select("empresa, nome_fantasia, nome_razao, cnpj_cpf")
      .eq("id", dono.id)
      .eq("emp_proprietaria_id", emp)
      .maybeSingle()
    if (!data) return null
    return {
      nome: texto(data.nome_fantasia) ?? texto(data.empresa) ?? texto(data.nome_razao) ?? "Fornecedor",
      documento: lerDocumentoTitular(texto(data.cnpj_cpf)).documento,
    }
  }
  const { data } = await admin
    .from(dono.tipo === "usuario" ? "usuarios" : "filiacoes")
    .select("nome_completo, cpf")
    .eq("id", dono.id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!data) return null
  return { nome: texto(data.nome_completo) ?? "Favorecido", documento: lerDocumentoTitular(texto(data.cpf)).documento }
}

export async function linkDoPedido(token: string): Promise<string> {
  return `${await origemAtual()}/dados-bancarios/${token}`
}

/** Pedidos do dono, o mais recente primeiro. */
export async function pedidosDoDono(dono: DonoPedido): Promise<PedidoDadosBancarios[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("financeiro_pedidos_dados_bancarios")
    .select("*")
    .eq(COLUNA_DO_DONO[dono.tipo], dono.id)
    .order("created_at", { ascending: false })
    .limit(10)
  return ((data ?? []) as Record<string, unknown>[]).map(comoPedido)
}

/** O pedido ainda em aberto do dono (o mais recente), para a ficha mostrar. */
export async function pedidoPendente(
  dono: DonoPedido
): Promise<{ id: string; criadoEm: string; abertoEm: string | null; enviadoPara: string | null } | null> {
  const aberto = (await pedidosDoDono(dono)).find((p) => p.situacao === "aberto")
  return aberto ? { id: aberto.id, criadoEm: aberto.criadoEm, abertoEm: aberto.abertoEm, enviadoPara: aberto.enviadoPara } : null
}

/**
 * Cria o pedido (cancelando o aberto anterior do mesmo dono) e, no canal
 * e-mail, já o envia. Devolve o link para copiar ou mandar pelo WhatsApp.
 */
export async function criarPedido(
  dono: DonoPedido,
  canal: CanalPedido,
  enviadoPara: string | null,
  usuarioId: string | null
): Promise<{ link?: string; erro?: string }> {
  const pessoa = await dadosDoDono(dono)
  if (!pessoa) return { erro: "Favorecido não encontrado." }
  if (canal === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(enviadoPara ?? "")) {
    return { erro: "Informe um e-mail válido." }
  }
  const admin = await createAdminClient()
  const coluna = COLUNA_DO_DONO[dono.tipo]
  await admin
    .from("financeiro_pedidos_dados_bancarios")
    .update({ cancelado_em: new Date().toISOString() })
    .eq(coluna, dono.id)
    .is("respondido_em", null)
    .is("cancelado_em", null)
  const { data, error } = await admin
    .from("financeiro_pedidos_dados_bancarios")
    .insert({
      [coluna]: dono.id,
      documento_esperado: pessoa.documento,
      canal,
      enviado_para: enviadoPara,
      criado_por_usuario_id: usuarioId,
    })
    .select("token")
    .single()
  if (error || !data) return { erro: `Não foi possível criar o pedido: ${error?.message ?? "sem retorno"}` }
  const link = await linkDoPedido(String(data.token))

  if (canal === "email" && enviadoPara) {
    const entidade = await nomeEntidade()
    const enviado = await enviarEmail({
      email: enviadoPara,
      nome: pessoa.nome,
      assunto: "{ENTIDADE}: informe seus dados bancários",
      html:
        `<p>Olá, ${escapar(pessoa.nome)}.</p>` +
        `<p>${escapar(entidade)} precisa da sua <strong>chave Pix</strong> ou da sua <strong>conta bancária</strong> para fazer pagamentos a você.</p>` +
        `<p>Informe pelo link abaixo, sem precisar de senha. A conta tem de estar no seu CPF/CNPJ. O link vale por 7 dias e serve uma vez.</p>` +
        `<p><a href="${link}">Informar meus dados bancários</a></p>`,
    })
    if (!enviado) return { link, erro: "O pedido foi criado, mas o e-mail não saiu. Copie o link e mande por outro meio." }
  }
  return { link }
}

export async function cancelarPedido(dono: DonoPedido, pedidoId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("financeiro_pedidos_dados_bancarios")
    .update({ cancelado_em: new Date().toISOString() })
    .eq("id", pedidoId)
    .eq(COLUNA_DO_DONO[dono.tipo], dono.id)
    .is("respondido_em", null)
  return error ? { erro: `Não foi possível cancelar: ${error.message}` } : {}
}

// ── Lado do favorecido (página pública /dados-bancarios/<token>) ───────────

export type PedidoPublico = {
  situacao: SituacaoPedido
  entidade: string
  nome: string
  /** O favorecido tem de informar conta no próprio documento (aqui mascarado). */
  documentoMascarado: string | null
  expiraEm: string
}

async function linhaPorToken(token: string): Promise<Record<string, unknown> | null> {
  if (!UUID.test(token)) return null
  const admin = await createAdminClient()
  const { data } = await admin.from("financeiro_pedidos_dados_bancarios").select("*").eq("token", token).maybeSingle()
  // O link só vale no domínio da própria entidade.
  if (!data || String(data.emp_proprietaria_id) !== (await tenantAtual())) return null
  return data as Record<string, unknown>
}

function donoDaLinha(l: Record<string, unknown>): DonoPedido {
  if (l.fornecedor_id) return { tipo: "fornecedor", id: String(l.fornecedor_id) }
  if (l.usuario_id) return { tipo: "usuario", id: String(l.usuario_id) }
  return { tipo: "filiado", id: String(l.filiado_id) }
}

function mascarar(d: string): string {
  return d.length === 11
    ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**`
    : d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5")
}

/** O pedido como o favorecido o vê; marca a primeira abertura. */
export async function pedidoPublico(token: string): Promise<PedidoPublico | null> {
  const l = await linhaPorToken(token)
  if (!l) return null
  const pessoa = await dadosDoDono(donoDaLinha(l))
  if (!pessoa) return null
  if (!l.aberto_em) {
    const admin = await createAdminClient()
    await admin.from("financeiro_pedidos_dados_bancarios").update({ aberto_em: new Date().toISOString() }).eq("id", String(l.id))
  }
  const esperado = texto(l.documento_esperado)
  return {
    situacao: situacaoDe(l),
    entidade: await nomeEntidade(),
    nome: pessoa.nome,
    documentoMascarado: esperado ? mascarar(esperado) : null,
    expiraEm: String(l.expira_em),
  }
}

/** Grava a resposta do favorecido: dado bancário novo + ordens que o esperavam. */
export async function responderPedido(token: string, dados: EntradaDadosBancarios): Promise<{ erro?: string }> {
  const l = await linhaPorToken(token)
  if (!l) return { erro: "Link inválido." }
  const situacao = situacaoDe(l)
  if (situacao !== "aberto") {
    return { erro: situacao === "respondido" ? "Este link já foi usado." : "Este link não vale mais. Peça outro à entidade." }
  }
  if (!dados.titularDocumento) return { erro: "Informe o CPF/CNPJ do titular da conta." }
  const esperado = texto(l.documento_esperado)
  if (esperado && !mesmoTitular(dados.titularDocumento, esperado)) {
    return { erro: `A conta precisa estar no seu CPF/CNPJ (${mascarar(esperado)}). Se a conta for de outra pessoa, fale com a entidade.` }
  }

  const dono = donoDaLinha(l)
  const coluna = COLUNA_DO_DONO[dono.tipo]
  const admin = await createAdminClient()

  // A mesma conta (ou chave) já está no cadastro: o pedido fecha com ela.
  const existente = await dadoRepetido({ coluna, ids: [dono.id] }, dados)
  if (existente) {
    await admin
      .from("dados_bancarios")
      .update({ titular_documento: dados.titularDocumento })
      .eq("id", existente)
      .is("titular_documento", null)
    const { data: fechou } = await admin
      .from("financeiro_pedidos_dados_bancarios")
      .update({ respondido_em: new Date().toISOString(), dados_bancarios_id: existente })
      .eq("id", String(l.id))
      .is("respondido_em", null)
      .select("id")
    if (!fechou?.length) return { erro: "Este link já foi usado." }
    await ligarOrdensSemForma(existente).catch((e) => console.error("ligarOrdensSemForma:", e))
    return {}
  }

  const { count } = await admin
    .from("dados_bancarios")
    .select("id", { count: "exact", head: true })
    .eq(coluna, dono.id)
    .eq("favorito", true)
  const { data: novo, error } = await admin
    .from("dados_bancarios")
    .insert({
      [coluna]: dono.id,
      banco: dados.banco,
      banco_codigo: dados.bancoCodigo,
      agencia: dados.agencia,
      conta: dados.conta,
      tipo_conta: dados.tipoConta,
      pix: dados.pix,
      pix_tipo: dados.pixTipo,
      titular_documento: dados.titularDocumento,
      prefere_pix: dados.preferePix || (Boolean(dados.pix) && !dados.conta),
      // Vira o principal só quando o dono ainda não tem um.
      favorito: !count,
    })
    .select("id")
    .single()
  if (error || !novo) return { erro: "Não foi possível gravar os dados. Tente de novo em instantes." }

  // Uso único: só um envio fecha o pedido (a condição barra a corrida).
  const { data: fechado } = await admin
    .from("financeiro_pedidos_dados_bancarios")
    .update({ respondido_em: new Date().toISOString(), dados_bancarios_id: String(novo.id) })
    .eq("id", String(l.id))
    .is("respondido_em", null)
    .select("id")
  if (!fechado?.length) {
    await admin.from("dados_bancarios").delete().eq("id", String(novo.id))
    return { erro: "Este link já foi usado." }
  }
  await ligarOrdensSemForma(String(novo.id)).catch((e) => console.error("ligarOrdensSemForma:", e))
  return {}
}

function escapar(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string)
}
