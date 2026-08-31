import "server-only"

import { esquemaAusente, nomesDosUsuarios } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › QR Codes — camada de leitura.
 *
 * QR DINÂMICO: a imagem carrega a URL curta `/q/<slug>` do tenant, que
 * redireciona ao `destino_url` enquanto o registro estiver ATIVO. Desativar
 * derruba o redirecionamento (página de aviso) mesmo em peças já impressas.
 * Leituras são contadas no redirecionamento (sem identificar quem escaneou).
 * Escrita nas actions da rota. SQL: supabase/comunicacao-qrcodes.sql.
 */

export type QrCode = {
  id: string
  slug: string
  titulo: string | null
  finalidade: string | null
  destino_url: string | null
  ativo: boolean
  criadoPorNome: string | null
  leituras: number
  ultima_leitura: string | null
  created_at: string
}

/** true quando a tabela ainda não foi criada (rodar o SQL). */
export async function listarQrCodes(): Promise<{
  ativo: boolean
  linhas: QrCode[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_qrcodes")
    .select(
      "id, slug, titulo, finalidade, destino_url, ativo, criado_por, leituras, ultima_leitura, created_at"
    )
    .eq("emp_proprietaria_id", emp)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar QR Codes: ${error.message}`)
  }
  const nomes = await nomesDosUsuarios(
    (data ?? []).map((q) => q.criado_por).filter((v): v is string => !!v)
  )
  return {
    ativo: true,
    linhas: (data ?? []).map((q) => ({
      id: q.id as string,
      slug: q.slug as string,
      titulo: q.titulo as string | null,
      finalidade: q.finalidade as string | null,
      destino_url: q.destino_url as string | null,
      ativo: q.ativo !== false,
      criadoPorNome: q.criado_por ? (nomes.get(q.criado_por) ?? null) : null,
      leituras: (q.leituras as number | null) ?? 0,
      ultima_leitura: q.ultima_leitura as string | null,
      created_at: q.created_at as string,
    })),
  }
}

export async function buscarQrCode(id: string): Promise<QrCode | null> {
  const { linhas } = await listarQrCodes()
  return linhas.find((q) => q.id === id) ?? null
}

/**
 * Resolve um slug para o redirecionamento público /q/<slug> (rota SEM login —
 * sempre pelo tenant do host). Retorna null se não existe.
 */
export async function qrPorSlug(slug: string): Promise<{
  id: string
  destino_url: string | null
  ativo: boolean
} | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_qrcodes")
    .select("id, destino_url, ativo")
    .eq("emp_proprietaria_id", emp)
    .eq("slug", slug)
    .maybeSingle()
  if (error || !data) return null
  return {
    id: data.id as string,
    destino_url: data.destino_url as string | null,
    ativo: data.ativo !== false,
  }
}

/** Incrementa o contador de leituras (chamado no redirecionamento público). */
export async function registrarLeitura(id: string): Promise<void> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("comunicacao_qrcodes")
    .select("leituras")
    .eq("id", id)
    .maybeSingle()
  await admin
    .from("comunicacao_qrcodes")
    .update({
      leituras: ((data?.leituras as number | null) ?? 0) + 1,
      ultima_leitura: new Date().toISOString(),
    })
    .eq("id", id)
}
