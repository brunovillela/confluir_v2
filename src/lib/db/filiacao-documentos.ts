import "server-only"

import { randomUUID } from "node:crypto"

import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Ficha de filiação e carta de desfiliação de cada vínculo.
 *
 * As colunas `ficha_filiacao` e `carta_desfiliacao` JÁ existiam em
 * `filiacao_vinculos`, vindas do Bubble — o que faltava era a tela. Por isso
 * este módulo não cria coluna nenhuma; ele dá uso ao que já estava lá.
 *
 * ATENÇÃO — dívida da migração: os valores migrados são URLs do CDN do Bubble
 * (`//…cdn.bubble.io/…/F1.pdf`), não caminhos do bucket do Supabase. Enquanto o
 * Bubble estiver no ar eles abrem; no dia em que ele for desligado, somem.
 * `ehDoBubble()` existe para a tela poder dizer isso a quem olha.
 */

const BUCKET = "filiacao"
const MAX_ARQUIVO = 10 * 1024 * 1024

export type TipoDocumento = "ficha" | "carta"

const COLUNA: Record<TipoDocumento, string> = {
  ficha: "ficha_filiacao",
  carta: "carta_desfiliacao",
}

const ROTULO: Record<TipoDocumento, string> = {
  ficha: "ficha de filiação",
  carta: "carta de desfiliação",
}

/** O valor guardado é um endereço do Bubble, e não um arquivo nosso? */
export function ehDoBubble(valor: string | null): boolean {
  if (!valor) return false
  return valor.startsWith("//") || /^https?:\/\//i.test(valor)
}

export type DocumentoDoVinculo = {
  tipo: TipoDocumento
  /** O que está gravado na coluna (caminho do bucket ou URL do Bubble). */
  valor: string | null
  /** Endereço para abrir agora — assinado, quando é arquivo nosso. */
  url: string | null
  noBubble: boolean
}

/** Link temporário do bucket privado; URL do Bubble passa direto. */
async function urlDe(valor: string | null): Promise<string | null> {
  if (!valor) return null
  if (ehDoBubble(valor)) {
    // O Bubble grava sem protocolo ("//host/..."), que só funciona colado a uma
    // página https. Normaliza para um link que abre sozinho.
    return valor.startsWith("//") ? `https:${valor}` : valor
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(valor, 3600)
  return data?.signedUrl ?? null
}

export async function documentosDoVinculo(
  vinculoId: string
): Promise<DocumentoDoVinculo[]> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("filiacao_vinculos")
    .select("ficha_filiacao, carta_desfiliacao")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", vinculoId)
    .maybeSingle()

  const bruto: Record<TipoDocumento, string | null> = {
    ficha: (data?.ficha_filiacao as string | null) ?? null,
    carta: (data?.carta_desfiliacao as string | null) ?? null,
  }

  return Promise.all(
    (["ficha", "carta"] as TipoDocumento[]).map(async (tipo) => ({
      tipo,
      valor: bruto[tipo],
      url: await urlDe(bruto[tipo]),
      noBubble: ehDoBubble(bruto[tipo]),
    }))
  )
}

export async function enviarDocumentoDoVinculo(
  vinculoId: string,
  tipo: TipoDocumento,
  arquivo: File
): Promise<{ erro?: string }> {
  if (arquivo.size === 0) return { erro: `Escolha o arquivo da ${ROTULO[tipo]}.` }
  if (arquivo.size > MAX_ARQUIVO) {
    return { erro: "O arquivo deve ter no máximo 10 MB." }
  }
  if (arquivo.type !== "application/pdf") {
    return { erro: "Envie em PDF — é o formato que vale como documento." }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: vinculo } = await admin
    .from("filiacao_vinculos")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("id", vinculoId)
    .maybeSingle()
  if (!vinculo) return { erro: "Vínculo não encontrado." }

  const caminho = `vinculos/${vinculoId}/${tipo}-${randomUUID()}.pdf`
  const { error: erroUpload } = await admin.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: "application/pdf" })
  if (erroUpload) return { erro: `Falha ao enviar: ${erroUpload.message}` }

  const { error } = await admin
    .from("filiacao_vinculos")
    .update({ [COLUNA[tipo]]: caminho })
    .eq("emp_proprietaria_id", emp)
    .eq("id", vinculoId)
  if (error) {
    // Não deixa arquivo órfão ocupando espaço se o vínculo não aceitou.
    await admin.storage.from(BUCKET).remove([caminho])
    return { erro: `Falha ao registrar: ${error.message}` }
  }

  return {}
}

/**
 * Tira o documento do vínculo.
 *
 * O arquivo do BUCKET é apagado junto; o do Bubble não — não é nosso, e o
 * campo só deixa de apontar para ele.
 */
export async function removerDocumentoDoVinculo(
  vinculoId: string,
  tipo: TipoDocumento
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // Lê as duas colunas e escolhe em memória: `select` com nome dinâmico
  // atrapalha a inferência de tipo do supabase-js.
  const { data: vinculo } = await admin
    .from("filiacao_vinculos")
    .select("ficha_filiacao, carta_desfiliacao")
    .eq("emp_proprietaria_id", emp)
    .eq("id", vinculoId)
    .maybeSingle()
  if (!vinculo) return { erro: "Vínculo não encontrado." }

  const valor = (tipo === "ficha"
    ? vinculo.ficha_filiacao
    : vinculo.carta_desfiliacao) as string | null
  if (valor && !ehDoBubble(valor)) {
    await admin.storage.from(BUCKET).remove([valor])
  }

  const { error } = await admin
    .from("filiacao_vinculos")
    .update({ [COLUNA[tipo]]: null })
    .eq("emp_proprietaria_id", emp)
    .eq("id", vinculoId)
  return error ? { erro: error.message } : {}
}

/**
 * Quantos documentos ainda moram no CDN do Bubble.
 *
 * Serve de alerta na tela: são arquivos que a entidade acha que tem e que
 * desaparecem no dia em que o Bubble for desligado.
 */
export async function documentosNoBubble(): Promise<{
  fichas: number
  cartas: number
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [fichas, cartas] = await Promise.all([
    admin
      .from("filiacao_vinculos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .like("ficha_filiacao", "//%"),
    admin
      .from("filiacao_vinculos")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp)
      .like("carta_desfiliacao", "//%"),
  ])
  return { fichas: fichas.count ?? 0, cartas: cartas.count ?? 0 }
}
