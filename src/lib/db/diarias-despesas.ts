import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Despesas extras de uma diária — hospedagem, alimentação, passagem. Ficam
 * SUBMETIDAS à diária (a mesma solicitação, a mesma avaliação, a mesma ordem
 * de pagamento), mas cada uma vai para a SUA conta contábil: é por isso que a
 * ordem passou a ter rateio. Ver supabase/diarias-diretoria.sql.
 *
 * Comprovante vai para o bucket `comprovantes` (aceita PDF e foto, até 3 MB —
 * o bucket `pessoal` só aceita PDF e recibo quase sempre chega fotografado).
 */

const BUCKET = "comprovantes"
export const TAMANHO_MAXIMO_COMPROVANTE = 3 * 1024 * 1024
const TIPOS_ACEITOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"]

export type DespesaDiaria = {
  id: string
  solicitacaoId: string
  tipoId: string | null
  tipoNome: string | null
  descricao: string | null
  valor: number
  comprovante: string | null
  criadoEm: string | null
}

const linhaDespesa = (d: Record<string, unknown>, nomeTipo: Map<string, string>): DespesaDiaria => ({
  id: String(d.id),
  solicitacaoId: String(d.solicitacao_id),
  tipoId: texto(d.tipo_id),
  tipoNome: d.tipo_id ? (nomeTipo.get(String(d.tipo_id)) ?? null) : null,
  descricao: texto(d.descricao),
  valor: Number(d.valor ?? 0),
  comprovante: texto(d.comprovante),
  criadoEm: texto(d.created_at),
})

/** Despesas agrupadas por solicitação (uma consulta só para a lista inteira). */
export async function despesasDasSolicitacoes(
  solicitacaoIds: string[]
): Promise<Map<string, DespesaDiaria[]>> {
  const porSolicitacao = new Map<string, DespesaDiaria[]>()
  if (solicitacaoIds.length === 0) return porSolicitacao
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("pessoal_diarias_solicitacao_despesas")
    .select("id, solicitacao_id, tipo_id, descricao, valor, comprovante, created_at")
    .in("solicitacao_id", solicitacaoIds)
    .order("created_at", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return porSolicitacao
    throw new Error(`Falha ao listar as despesas da diária: ${error.message}`)
  }
  const linhas = (data ?? []) as Record<string, unknown>[]
  const tipoIds = [...new Set(linhas.map((l) => texto(l.tipo_id)).filter((v): v is string => Boolean(v)))]
  const nomeTipo = new Map<string, string>()
  if (tipoIds.length) {
    const { data: tipos } = await admin
      .from("pessoal_diarias_despesa_tipos")
      .select("id, nome")
      .in("id", tipoIds)
    for (const t of (tipos ?? []) as Record<string, unknown>[]) {
      nomeTipo.set(String(t.id), String(t.nome ?? "(sem nome)"))
    }
  }
  for (const l of linhas) {
    const chave = String(l.solicitacao_id)
    const lista = porSolicitacao.get(chave) ?? []
    lista.push(linhaDespesa(l, nomeTipo))
    porSolicitacao.set(chave, lista)
  }
  return porSolicitacao
}

export async function despesasDaSolicitacao(solicitacaoId: string): Promise<DespesaDiaria[]> {
  return (await despesasDasSolicitacoes([solicitacaoId])).get(solicitacaoId) ?? []
}

export const somaDespesas = (despesas: DespesaDiaria[]): number =>
  Math.round(despesas.reduce((s, d) => s + d.valor, 0) * 100) / 100

/**
 * Anexa uma despesa à solicitação. Só enquanto ela aguarda avaliação — depois
 * de aprovada a ordem de pagamento já saiu com o rateio fechado.
 */
export async function adicionarDespesaDiaria(dados: {
  solicitacaoId: string
  tipoId: string | null
  descricao: string | null
  valor: number
  arquivo?: File | null
  /** Quando vem do portal: só o dono da solicitação pode mexer. */
  exigirBeneficiario?: string
}): Promise<{ erro?: string }> {
  if (!Number.isFinite(dados.valor) || dados.valor <= 0) {
    return { erro: "Informe o valor da despesa." }
  }
  const admin = await createAdminClient()
  const { data: solicitacao, error: erroBusca } = await admin
    .from("pessoal_diarias_solicitacoes")
    .select("id, situacao, funcionario_id")
    .eq("id", dados.solicitacaoId)
    .maybeSingle()
  if (erroBusca && esquemaAusente(erroBusca)) {
    return { erro: "Rode supabase/diarias-diretoria.sql antes de lançar despesas." }
  }
  if (!solicitacao) return { erro: "Solicitação não encontrada." }
  if (solicitacao.situacao !== "aguardando") {
    return { erro: "A diária já foi avaliada — não dá para mudar as despesas." }
  }
  if (dados.exigirBeneficiario && solicitacao.funcionario_id !== dados.exigirBeneficiario) {
    return { erro: "Esta diária é de outra pessoa." }
  }

  let comprovante: string | null = null
  if (dados.arquivo && dados.arquivo.size > 0) {
    if (dados.arquivo.size > TAMANHO_MAXIMO_COMPROVANTE) {
      return { erro: "O comprovante passa de 3 MB — envie um arquivo menor." }
    }
    const tipo = dados.arquivo.type || "application/octet-stream"
    if (!TIPOS_ACEITOS.includes(tipo)) {
      return { erro: "O comprovante precisa ser PDF, JPG, PNG ou WebP." }
    }
    const extensao = tipo === "application/pdf" ? "pdf" : tipo.split("/")[1]
    const caminho = `diarias/${dados.solicitacaoId}/${crypto.randomUUID()}.${extensao}`
    const { error } = await admin.storage
      .from(BUCKET)
      .upload(caminho, dados.arquivo, { contentType: tipo, upsert: false })
    if (error) return { erro: `Falha ao anexar o comprovante: ${error.message}` }
    comprovante = caminho
  }

  const { error } = await admin.from("pessoal_diarias_solicitacao_despesas").insert({
    solicitacao_id: dados.solicitacaoId,
    tipo_id: dados.tipoId,
    descricao: dados.descricao,
    valor: dados.valor,
    comprovante,
    emp_proprietaria_id: await tenantAtual(),
  })
  if (error) {
    if (esquemaAusente(error)) {
      return { erro: "Rode supabase/diarias-diretoria.sql antes de lançar despesas." }
    }
    return { erro: `Não foi possível lançar a despesa: ${error.message}` }
  }
  return {}
}

export async function removerDespesaDiaria(
  id: string,
  opcoes: { exigirBeneficiario?: string } = {}
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { data: despesa } = await admin
    .from("pessoal_diarias_solicitacao_despesas")
    .select("id, comprovante, solicitacao_id")
    .eq("id", id)
    .maybeSingle()
  if (!despesa) return { erro: "Despesa não encontrada." }
  const { data: solicitacao } = await admin
    .from("pessoal_diarias_solicitacoes")
    .select("situacao, funcionario_id")
    .eq("id", despesa.solicitacao_id)
    .maybeSingle()
  if (solicitacao?.situacao !== "aguardando") {
    return { erro: "A diária já foi avaliada — não dá para mudar as despesas." }
  }
  if (opcoes.exigirBeneficiario && solicitacao.funcionario_id !== opcoes.exigirBeneficiario) {
    return { erro: "Esta diária é de outra pessoa." }
  }
  const { error } = await admin
    .from("pessoal_diarias_solicitacao_despesas")
    .delete()
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (despesa.comprovante) {
    await admin.storage.from(BUCKET).remove([String(despesa.comprovante)])
  }
  return {}
}

/** URL assinada do comprovante (1 h), para os links da tela. */
export async function urlComprovanteDespesa(caminho: string | null): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}
