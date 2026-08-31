import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › Página de links ("link na bio", estilo Linktree) — leitura.
 *
 * UMA página pública por tenant, em /links: título + bio + lista ordenada de
 * links. Cada clique passa por /links/ir/<id>, que conta e redireciona.
 * Escrita nas actions da rota. SQL: supabase/comunicacao-pagina-links.sql.
 */

export type ConfigLinks = {
  id: string | null
  titulo: string | null
  bio: string | null
  publicada: boolean
}

export type LinkDaPagina = {
  id: string
  titulo: string | null
  descricao: string | null
  url: string | null
  ordem: number
  ativo: boolean
  cliques: number
  ultimo_clique: string | null
}

/** ativo=false → tabela ainda não criada (rodar o SQL). */
export async function obterPaginaLinks(): Promise<{
  ativo: boolean
  config: ConfigLinks
  links: LinkDaPagina[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [cfg, lks] = await Promise.all([
    admin
      .from("comunicacao_links_config")
      .select("id, titulo, bio, publicada")
      .eq("emp_proprietaria_id", emp)
      .maybeSingle(),
    admin
      .from("comunicacao_links")
      .select("id, titulo, descricao, url, ordem, ativo, cliques, ultimo_clique")
      .eq("emp_proprietaria_id", emp)
      .order("ordem", { ascending: true })
      .order("created_at", { ascending: true }),
  ])
  if (cfg.error && esquemaAusente(cfg.error)) {
    return {
      ativo: false,
      config: { id: null, titulo: null, bio: null, publicada: false },
      links: [],
    }
  }
  return {
    ativo: true,
    config: {
      id: (cfg.data?.id as string | null) ?? null,
      titulo: (cfg.data?.titulo as string | null) ?? null,
      bio: (cfg.data?.bio as string | null) ?? null,
      // sem config ainda = página publicada por padrão (aparece ao criar links)
      publicada: cfg.data ? cfg.data.publicada !== false : true,
    },
    links: (lks.data ?? []).map((l) => ({
      id: l.id as string,
      titulo: l.titulo as string | null,
      descricao: l.descricao as string | null,
      url: l.url as string | null,
      ordem: (l.ordem as number | null) ?? 0,
      ativo: l.ativo !== false,
      cliques: (l.cliques as number | null) ?? 0,
      ultimo_clique: l.ultimo_clique as string | null,
    })),
  }
}

/** Um link pelo id (para o redirecionamento público). */
export async function linkPorId(id: string): Promise<{
  url: string | null
  ativo: boolean
  cliques: number
} | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_links")
    .select("url, ativo, cliques")
    .eq("id", id)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error || !data) return null
  return {
    url: data.url as string | null,
    ativo: data.ativo !== false,
    cliques: (data.cliques as number | null) ?? 0,
  }
}

/** Incrementa o contador de cliques (chamado no redirecionamento público). */
export async function registrarClique(id: string, cliquesAtuais: number): Promise<void> {
  const admin = await createAdminClient()
  await admin
    .from("comunicacao_links")
    .update({
      cliques: cliquesAtuais + 1,
      ultimo_clique: new Date().toISOString(),
    })
    .eq("id", id)
}
