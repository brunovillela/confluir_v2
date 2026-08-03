import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"

/**
 * CRUD dos termos legais de filiação POR TENANT: LGPD (`filiacao_tl_lgpd`) e
 * autorização de desconto (`filiacao_tl_desconto`). Cada tenant tem seus textos;
 * há sempre no máximo UM `em_vigor` por tipo (é o exibido na ficha pública e o
 * gravado no cadastro do filiado que aceitou). O histórico são as versões
 * anteriores. Ver [[confluir-ficha-publica]].
 */

export type TipoTermo = "lgpd" | "desconto"

const TABELA: Record<TipoTermo, string> = {
  lgpd: "filiacao_tl_lgpd",
  desconto: "filiacao_tl_desconto",
}

export const ROTULO_TIPO_TERMO: Record<TipoTermo, string> = {
  lgpd: "Termo de proteção de dados (LGPD)",
  desconto: "Autorização de desconto em folha",
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

/** Código de versão AAAAMMDDHHmm (America/Sao_Paulo). */
function codigoVersao(): string {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  })
    .format(new Date())
    .replace(/\D/g, "")
}

export type TermoVersao = {
  id: string
  texto: string | null
  codigo: string | null
  emVigor: boolean
  created_at: string | null
}

export async function listarTermos(tipo: TipoTermo): Promise<TermoVersao[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from(TABELA[tipo])
    .select("id, texto, codigo, em_vigor, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("em_vigor", { ascending: false })
    .order("created_at", { ascending: false, nullsFirst: false })
  if (error) throw new Error(`Falha ao listar termos: ${error.message}`)
  return (data ?? []).map((t) => ({
    id: String(t.id),
    texto: texto(t.texto),
    codigo: texto(t.codigo),
    emVigor: t.em_vigor === true,
    created_at: texto(t.created_at),
  }))
}

/** Nova versão do termo — passa a ser a vigente (desmarca as demais do tipo). */
export async function criarTermo(
  tipo: TipoTermo,
  textoNovo: string
): Promise<{ erro?: string; id?: string }> {
  const t = textoNovo.trim()
  if (t.length < 10) return { erro: "Escreva o texto do termo." }
  const empId = await tenantAtual()
  const admin = await createAdminClient()

  await admin
    .from(TABELA[tipo])
    .update({ em_vigor: false })
    .eq("emp_proprietaria_id", empId)
    .eq("em_vigor", true)

  const { data, error } = await admin
    .from(TABELA[tipo])
    .insert({
      texto: t,
      codigo: codigoVersao(),
      em_vigor: true,
      emp_proprietaria_id: empId,
    })
    .select("id")
    .single()
  if (error || !data) {
    return { erro: `Não foi possível salvar: ${error?.message ?? "?"}` }
  }
  return { id: String(data.id) }
}

/** Edita o texto de uma versão específica (correção). */
export async function atualizarTermo(
  tipo: TipoTermo,
  id: string,
  textoNovo: string
): Promise<{ erro?: string }> {
  const t = textoNovo.trim()
  if (t.length < 10) return { erro: "Escreva o texto do termo." }
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from(TABELA[tipo])
    .update({ texto: t }, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Termo não encontrado." }
  return {}
}

/** Marca uma versão como vigente (desmarca as demais do tipo). */
export async function definirVigente(
  tipo: TipoTermo,
  id: string
): Promise<{ erro?: string }> {
  const empId = await tenantAtual()
  const admin = await createAdminClient()
  await admin
    .from(TABELA[tipo])
    .update({ em_vigor: false })
    .eq("emp_proprietaria_id", empId)
    .eq("em_vigor", true)
  const { error, count } = await admin
    .from(TABELA[tipo])
    .update({ em_vigor: true }, { count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Não foi possível salvar: ${error.message}` }
  if (count === 0) return { erro: "Termo não encontrado." }
  return {}
}

export type TermoAceito = { codigo: string | null; texto: string | null }

/**
 * Resolve os termos que o filiado ACEITOU (por id gravado em
 * `filiacoes.tl_lgpd_id`/`tl_desconto_id`) — versão + texto, para exibir no
 * perfil. Retorna null quando não há id (aceite legado sem versão).
 */
export async function obterTermosAceitos(
  lgpdId: string | null | undefined,
  descontoId: string | null | undefined
): Promise<{ lgpd: TermoAceito | null; desconto: TermoAceito | null }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const buscar = async (
    tabela: string,
    id: string | null | undefined
  ): Promise<TermoAceito | null> => {
    if (!id) return null
    const { data } = await admin
      .from(tabela)
      .select("codigo, texto")
      .eq("id", id)
      .eq("emp_proprietaria_id", empId)
      .maybeSingle()
    return data ? { codigo: texto(data.codigo), texto: texto(data.texto) } : null
  }
  const [lgpd, desconto] = await Promise.all([
    buscar("filiacao_tl_lgpd", lgpdId),
    buscar("filiacao_tl_desconto", descontoId),
  ])
  return { lgpd, desconto }
}

export async function excluirTermo(
  tipo: TipoTermo,
  id: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error, count } = await admin
    .from(TABELA[tipo])
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    // FK de solicitações/filiações que apontam p/ este termo.
    if (error.code === "23503") {
      return {
        erro: "Este termo já foi aceito por alguém — não pode ser excluído. Crie uma nova versão.",
      }
    }
    return { erro: `Não foi possível excluir: ${error.message}` }
  }
  if (count === 0) return { erro: "Termo não encontrado." }
  return {}
}
