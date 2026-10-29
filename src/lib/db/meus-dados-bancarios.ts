import "server-only"

import type { EntradaDadosBancarios } from "@/lib/dados-bancarios"
import { avisar, avisarQuemPode, depoisDaResposta, type Destinatario } from "@/lib/db/avisos"
import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { donosDaPessoa, filtroDosDonos, type DonosDaPessoa } from "@/lib/db/dados-bancarios-pessoa"
import { avisoRepetida, dadoRepetido } from "@/lib/db/dados-bancarios-repetida"
import { ligarOrdensSemForma } from "@/lib/db/ordens-destino"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * MEUS DADOS BANCÁRIOS (29/10/2026 — migração financeiro_dados_bancarios_alteracoes).
 *
 * O funcionário e o diretor incluem, alteram e excluem a própria conta no
 * Meu perfil, mas o pedido NÃO vale na hora: fica aguardando o Financeiro e os
 * pagamentos seguem na conta antiga. Confirmado, o pedido é aplicado em
 * `dados_bancarios` e a conta ganha o selo "Financeiro ciente"; recusado, nada
 * muda e a pessoa vê o motivo. As contas da pessoa são as do usuário e as das
 * filiações com o mesmo CPF (onde a ficha do diretor grava); a inclusão vai
 * para o usuário. A gestão (Pessoal, Diretoria) continua editando direto.
 */

export type AcaoAlteracao = "incluir" | "alterar" | "excluir"
export type SituacaoAlteracao = "aguardando" | "confirmada" | "recusada" | "cancelada"

export type ContaBancaria = EntradaDadosBancarios & { id: string; principal: boolean }

export type DadosConta = EntradaDadosBancarios & { principal?: boolean }

export type AlteracaoDadosBancarios = {
  id: string
  usuarioId: string
  usuarioNome: string | null
  acao: AcaoAlteracao
  contaId: string | null
  dados: DadosConta | null
  anteriores: DadosConta | null
  principal: boolean
  situacao: SituacaoAlteracao
  motivo: string | null
  decididaPor: string | null
  decididaEm: string | null
  criadaEm: string
}

/** A conta da pessoa com o que está pendente e o selo do Financeiro. */
export type MinhaConta = ContaBancaria & {
  /** Confirmação do Financeiro da última inclusão/alteração desta conta (null = feita pela gestão ou antes da regra). */
  ciente: { em: string; por: string | null } | null
  pendente: AlteracaoDadosBancarios | null
}

const COLUNAS =
  "id, usuario_id, filiado_id, banco, banco_codigo, agencia, conta, tipo_conta, pix, pix_tipo, favorecido, titular_documento, prefere_pix, favorito, created_at"

function paraConta(d: Record<string, unknown>): ContaBancaria {
  return {
    id: String(d.id),
    banco: texto(d.banco),
    bancoCodigo: texto(d.banco_codigo),
    agencia: texto(d.agencia),
    conta: texto(d.conta),
    tipoConta: texto(d.tipo_conta),
    pix: texto(d.pix),
    pixTipo: texto(d.pix_tipo),
    favorecido: texto(d.favorecido),
    titularDocumento: texto(d.titular_documento),
    preferePix: d.prefere_pix === true,
    principal: d.favorito === true,
  }
}

function paraLinha(d: EntradaDadosBancarios) {
  return {
    banco: d.banco,
    banco_codigo: d.bancoCodigo,
    agencia: d.agencia,
    conta: d.conta,
    tipo_conta: d.tipoConta,
    pix: d.pix,
    pix_tipo: d.pixTipo,
    favorecido: d.favorecido,
    titular_documento: d.titularDocumento,
    prefere_pix: d.preferePix,
  }
}

/** Só os cadastros de usuário e de filiação da pessoa (fornecedor PF fica de fora). */
async function donosDaConta(usuarioId: string): Promise<DonosDaPessoa> {
  const d = await donosDaPessoa("usuario", usuarioId)
  return { usuario_id: d.usuario_id, filiado_id: d.filiado_id, fornecedor_id: [] }
}

async function contasDosDonos(donos: DonosDaPessoa): Promise<ContaBancaria[]> {
  const filtro = filtroDosDonos(donos)
  if (!filtro) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("dados_bancarios")
    .select(COLUNAS)
    .or(filtro)
    .order("favorito", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
  if (error) throw new Error(`Falha ao ler os dados bancários: ${error.message}`)
  return ((data ?? []) as Record<string, unknown>[]).map(paraConta)
}

function paraAlteracao(r: Record<string, unknown>, nomes: Map<string, string>): AlteracaoDadosBancarios {
  const decisor = texto(r.decidida_por_usuario_id)
  return {
    id: String(r.id),
    usuarioId: String(r.usuario_id),
    usuarioNome: nomes.get(String(r.usuario_id)) ?? null,
    acao: r.acao as AcaoAlteracao,
    contaId: texto(r.dados_bancarios_id),
    dados: (r.dados as DadosConta | null) ?? null,
    anteriores: (r.dados_anteriores as DadosConta | null) ?? null,
    principal: r.principal === true,
    situacao: r.situacao as SituacaoAlteracao,
    motivo: texto(r.motivo),
    decididaPor: decisor ? (nomes.get(decisor) ?? null) : null,
    decididaEm: texto(r.decidida_em),
    criadaEm: String(r.created_at),
  }
}

async function montar(linhas: Record<string, unknown>[]): Promise<AlteracaoDadosBancarios[]> {
  const ids = [
    ...new Set(
      linhas.flatMap((l) => [texto(l.usuario_id), texto(l.decidida_por_usuario_id)]).filter((v): v is string => Boolean(v))
    ),
  ]
  const nomes = ids.length ? await nomesDosUsuarios(ids) : new Map<string, string>()
  return linhas.map((l) => paraAlteracao(l, nomes))
}

/** Os pedidos da pessoa, do mais recente ao mais antigo (disponivel=false: migração não aplicada). */
export async function minhasAlteracoes(usuarioId: string): Promise<{ disponivel: boolean; lista: AlteracaoDadosBancarios[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_dados_bancarios_alteracoes")
    .select("*")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("usuario_id", usuarioId)
    .order("created_at", { ascending: false })
    .limit(200)
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, lista: [] }
    throw new Error(`Falha ao ler as alterações: ${error.message}`)
  }
  return { disponivel: true, lista: await montar((data ?? []) as Record<string, unknown>[]) }
}

/** As contas da pessoa, cada uma com o pedido pendente e o selo do Financeiro. */
export async function minhasContas(usuarioId: string, alteracoes: AlteracaoDadosBancarios[]): Promise<MinhaConta[]> {
  const contas = await contasDosDonos(await donosDaConta(usuarioId))
  return contas.map((c) => {
    const daConta = alteracoes.filter((a) => a.contaId === c.id)
    const pendente = daConta.find((a) => a.situacao === "aguardando") ?? null
    // A lista vem do mais recente: a primeira confirmada é a que vale.
    const ultima = daConta.find((a) => a.situacao === "confirmada" && a.acao !== "excluir")
    return {
      ...c,
      ciente: ultima?.decididaEm ? { em: ultima.decididaEm, por: ultima.decididaPor } : null,
      pendente,
    }
  })
}

/** O Financeiro (quem paga ordens) é avisado de um pedido novo. */
function avisarFinanceiro(nome: string | null, acao: AcaoAlteracao): void {
  const verbo = acao === "incluir" ? "incluir uma conta" : acao === "alterar" ? "alterar uma conta" : "excluir uma conta"
  depoisDaResposta(() =>
    avisarQuemPode("financeiro_pagamento", [], {
      // Sem número de conta nem chave: o detalhe fica atrás do link.
      texto: `${nome ?? "Um funcionário/diretor"} pediu para ${verbo} bancária — confirme no Financeiro.`,
      link: "/painel/financeiro/contas-bancarias/alteracoes",
      evento: "pendencia_dados_bancarios",
      assunto: "Alteração de dados bancários a confirmar",
    })
  )
}

/**
 * Registra o pedido da própria pessoa. Na alteração e na exclusão, a conta
 * tem de ser dela e não pode ter outro pedido aguardando.
 */
export async function pedirAlteracao({
  usuarioId,
  acao,
  contaId,
  dados,
  principal,
}: {
  usuarioId: string
  acao: AcaoAlteracao
  contaId: string | null
  dados: EntradaDadosBancarios | null
  principal: boolean
}): Promise<{ erro?: string }> {
  const donos = await donosDaConta(usuarioId)
  const contas = await contasDosDonos(donos)
  const conta = contaId ? contas.find((c) => c.id === contaId) : null
  if (acao !== "incluir" && !conta) return { erro: "Conta não encontrada entre as suas." }
  if (acao !== "excluir") {
    if (!dados) return { erro: "Informe os dados da conta." }
    const repetida = await dadoRepetido(donos, dados, conta?.id ?? null)
    if (repetida) return { erro: avisoRepetida(repetida, "usuario") }
  }

  const admin = await createAdminClient()
  const { error } = await admin.from("financeiro_dados_bancarios_alteracoes").insert({
    emp_proprietaria_id: await tenantAtual(),
    usuario_id: usuarioId,
    acao,
    dados_bancarios_id: conta?.id ?? null,
    dados: acao === "excluir" ? null : dados,
    dados_anteriores: conta ?? null,
    principal: acao !== "excluir" && (principal || contas.length === 0),
  })
  if (error) {
    if (error.code === "23505") return { erro: "Esta conta já tem um pedido aguardando o Financeiro. Cancele-o antes de pedir outro." }
    return { erro: `Não foi possível registrar o pedido: ${error.message}` }
  }
  const nomes = await nomesDosUsuarios([usuarioId])
  avisarFinanceiro(nomes.get(usuarioId) ?? null, acao)
  return {}
}

/** A própria pessoa desiste do pedido enquanto ele aguarda. */
export async function cancelarAlteracao(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("financeiro_dados_bancarios_alteracoes")
    .update({ situacao: "cancelada", decidida_em: new Date().toISOString() })
    .eq("id", id)
    .eq("usuario_id", usuarioId)
    .eq("situacao", "aguardando")
    .select("id")
  if (error) return { erro: `Não foi possível cancelar: ${error.message}` }
  if (!data?.length) return { erro: "Pedido não encontrado ou já decidido." }
  return {}
}

// ── Financeiro ───────────────────────────────────────────────────────────────

/** Pedidos aguardando (mais antigos primeiro) e os decididos recentes. */
export async function alteracoesParaOFinanceiro(): Promise<{
  disponivel: boolean
  aguardando: AlteracaoDadosBancarios[]
  decididas: AlteracaoDadosBancarios[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [ag, dec] = await Promise.all([
    admin
      .from("financeiro_dados_bancarios_alteracoes")
      .select("*")
      .eq("emp_proprietaria_id", emp)
      .eq("situacao", "aguardando")
      .order("created_at", { ascending: true }),
    admin
      .from("financeiro_dados_bancarios_alteracoes")
      .select("*")
      .eq("emp_proprietaria_id", emp)
      .neq("situacao", "aguardando")
      .order("created_at", { ascending: false })
      .limit(100),
  ])
  if (ag.error) {
    if (esquemaAusente(ag.error)) return { disponivel: false, aguardando: [], decididas: [] }
    throw new Error(`Falha ao ler as alterações: ${ag.error.message}`)
  }
  const [aguardando, decididas] = await Promise.all([
    montar((ag.data ?? []) as Record<string, unknown>[]),
    montar((dec.data ?? []) as Record<string, unknown>[]),
  ])
  return { disponivel: true, aguardando, decididas }
}

async function destinatario(usuarioId: string): Promise<Destinatario | null> {
  const admin = await createAdminClient()
  const { data } = await admin.from("usuarios").select("id, nome_completo, nome_guerra, email").eq("id", usuarioId).maybeSingle()
  return data
    ? { id: String(data.id), nome: texto(data.nome_completo) ?? texto(data.nome_guerra), email: texto(data.email), permissoes: {} }
    : null
}

function avisarPessoa(usuarioId: string, texto: string): void {
  depoisDaResposta(async () => {
    const quem = await destinatario(usuarioId)
    if (!quem) return
    await avisar([quem], {
      texto,
      link: "/painel/perfil/dados-bancarios",
      evento: "dados_bancarios",
      assunto: "Seus dados bancários",
    })
  })
}

/** Aplica o pedido em dados_bancarios (dentro da confirmação). */
async function aplicar(a: AlteracaoDadosBancarios): Promise<{ erro?: string; contaId?: string }> {
  const admin = await createAdminClient()
  const donos = await donosDaConta(a.usuarioId)
  const contas = await contasDosDonos(donos)
  if (a.acao !== "incluir" && !contas.some((c) => c.id === a.contaId)) {
    return { erro: "A conta não existe mais (ou não é mais desta pessoa). Recuse o pedido." }
  }

  if (a.acao === "excluir") {
    const { error } = await admin.from("dados_bancarios").delete().eq("id", a.contaId!)
    if (error) {
      if (error.code === "23503") {
        return { erro: "Esta conta já foi usada em ordens de pagamento e não pode ser excluída. Recuse o pedido e oriente a pessoa a cadastrar outra como principal." }
      }
      return { erro: `Falha ao excluir: ${error.message}` }
    }
    // Sem principal entre as que ficaram: a mais antiga passa a ser.
    const restantes = contas.filter((c) => c.id !== a.contaId)
    if (restantes.length && !restantes.some((c) => c.principal)) {
      await admin.from("dados_bancarios").update({ favorito: true }).eq("id", restantes[0].id)
    }
    return {}
  }

  if (!a.dados) return { erro: "O pedido não tem os dados da conta." }
  const repetida = await dadoRepetido(donos, a.dados, a.contaId)
  if (repetida) return { erro: `${avisoRepetida(repetida, "usuario")} Recuse o pedido.` }
  const principal = a.principal || contas.length === 0 || (contas.length === 1 && contas[0].id === a.contaId)
  const linha = { ...paraLinha(a.dados), ...(principal ? { favorito: true } : {}) }
  const { data: salvo, error } =
    a.acao === "alterar"
      ? await admin.from("dados_bancarios").update(linha).eq("id", a.contaId!).select("id").single()
      : await admin
          .from("dados_bancarios")
          .insert({ ...linha, usuario_id: a.usuarioId, favorito: principal })
          .select("id")
          .single()
  if (error || !salvo) return { erro: `Falha ao gravar a conta: ${error?.message ?? "sem retorno"}` }
  const id = String(salvo.id)
  if (principal) {
    const outras = contas.filter((c) => c.id !== id && c.principal).map((c) => c.id)
    if (outras.length) await admin.from("dados_bancarios").update({ favorito: false }).in("id", outras)
  }
  // Ordens da pessoa que esperavam a conta (sem forma) recebem esta.
  await ligarOrdensSemForma(id).catch((e) => console.error("ligarOrdensSemForma:", e))
  return { contaId: id }
}

async function carregar(id: string): Promise<AlteracaoDadosBancarios | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("financeiro_dados_bancarios_alteracoes")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  return data ? (await montar([data as Record<string, unknown>]))[0] : null
}

const ROTULO_ACAO: Record<AcaoAlteracao, string> = {
  incluir: "inclusão de conta",
  alterar: "alteração de conta",
  excluir: "exclusão de conta",
}

/** O Financeiro confirma: aplica a alteração e carimba "Financeiro ciente". */
export async function confirmarAlteracao(id: string, decisorId: string): Promise<{ erro?: string }> {
  const a = await carregar(id)
  if (!a || a.situacao !== "aguardando") return { erro: "Pedido não encontrado ou já decidido." }
  if (a.usuarioId === decisorId) return { erro: "Quem pediu não confirma o próprio pedido — outra pessoa do Financeiro confirma." }
  const r = await aplicar(a)
  if (r.erro) return r
  const admin = await createAdminClient()
  const { error } = await admin
    .from("financeiro_dados_bancarios_alteracoes")
    .update({
      situacao: "confirmada",
      decidida_por_usuario_id: decisorId,
      decidida_em: new Date().toISOString(),
      ...(r.contaId ? { dados_bancarios_id: r.contaId } : {}),
    })
    .eq("id", id)
    .eq("situacao", "aguardando")
  if (error) return { erro: `A conta foi gravada, mas o pedido não foi marcado: ${error.message}` }
  avisarPessoa(
    a.usuarioId,
    `O Financeiro confirmou a ${ROTULO_ACAO[a.acao]} bancária que você pediu — ${a.acao === "excluir" ? "a conta saiu do seu cadastro" : "já vale para os pagamentos"}.`
  )
  return {}
}

/** O Financeiro recusa (com motivo): nada muda na conta. */
export async function recusarAlteracao(id: string, decisorId: string, motivo: string): Promise<{ erro?: string }> {
  const a = await carregar(id)
  if (!a || a.situacao !== "aguardando") return { erro: "Pedido não encontrado ou já decidido." }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("financeiro_dados_bancarios_alteracoes")
    .update({ situacao: "recusada", motivo, decidida_por_usuario_id: decisorId, decidida_em: new Date().toISOString() })
    .eq("id", id)
    .eq("situacao", "aguardando")
  if (error) return { erro: `Não foi possível recusar: ${error.message}` }
  avisarPessoa(a.usuarioId, `O Financeiro recusou a ${ROTULO_ACAO[a.acao]} bancária que você pediu: ${motivo}`.slice(0, 300))
  return {}
}
