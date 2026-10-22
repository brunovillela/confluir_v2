import "server-only"

import { esquemaAusente } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * LIVRO DE EXPORTAÇÕES (achado M5 da RIPD da base multi-entidade,
 * docs/lgpd/ripd-base-multitenant.md): toda rota que entrega um arquivo com
 * dado pessoal em massa chama `registrarExportacao` antes de responder.
 * Grava pelo service_role com o tenant explícito; a entidade só lê
 * (policy tenant_isolation FOR SELECT), em Institucional › Auditoria.
 */

export type CategoriaExportada = "identificacao" | "cpf" | "sindical" | "saude" | "financeiro" | "trabalhista" | "voto"

export const RECURSOS_EXPORTACAO = {
  filiados: { rotulo: "Lista de filiados", categorias: ["identificacao", "cpf", "sindical"] },
  filiados_relatorio: { rotulo: "Relatório de filiados", categorias: ["identificacao", "cpf", "sindical"] },
  etiquetas: { rotulo: "Etiquetas dos Correios", categorias: ["identificacao", "sindical"] },
  links_voto: { rotulo: "Links de voto dos aptos", categorias: ["identificacao", "cpf", "voto"] },
  apuracao_relatorio: { rotulo: "Relação de votantes (apuração)", categorias: ["identificacao", "cpf", "voto"] },
  cat: { rotulo: "CATs", categorias: ["identificacao", "saude", "trabalhista"] },
  folha_movimento: { rotulo: "Movimento da folha (contabilidade)", categorias: ["identificacao", "cpf", "trabalhista", "financeiro"] },
  ponto_remessa: { rotulo: "Remessa de controle de ponto", categorias: ["identificacao", "cpf", "trabalhista"] },
  remessa_cnab: { rotulo: "Remessa/retorno bancário (CNAB)", categorias: ["identificacao", "cpf", "financeiro"] },
  ordens: { rotulo: "Ordens de pagamento", categorias: ["identificacao", "financeiro"] },
  contabil: { rotulo: "Lançamentos contábeis", categorias: ["identificacao", "cpf", "financeiro"] },
  compras: { rotulo: "Compras", categorias: ["identificacao", "financeiro"] },
  contratos: { rotulo: "Contratos", categorias: ["identificacao", "financeiro"] },
  fornecedores: { rotulo: "Fornecedores", categorias: ["identificacao", "cpf", "financeiro"] },
  custeios: { rotulo: "Custeios institucionais", categorias: ["identificacao", "financeiro"] },
  viagens: { rotulo: "Viagens", categorias: ["identificacao"] },
  juridico_processos: { rotulo: "Processos jurídicos", categorias: ["identificacao", "trabalhista"] },
  juridico_homologacoes: { rotulo: "Homologações", categorias: ["identificacao", "trabalhista"] },
  patrimonio: { rotulo: "Patrimônio", categorias: ["identificacao"] },
} as const satisfies Record<string, { rotulo: string; categorias: readonly CategoriaExportada[] }>

export type RecursoExportacao = keyof typeof RECURSOS_EXPORTACAO

export const ROTULO_CATEGORIA: Record<CategoriaExportada, string> = {
  identificacao: "identificação",
  cpf: "CPF",
  sindical: "filiação sindical",
  saude: "saúde",
  financeiro: "financeiro",
  trabalhista: "trabalhista",
  voto: "votação",
}

export function rotuloRecurso(recurso: string): string {
  return (RECURSOS_EXPORTACAO as Record<string, { rotulo: string }>)[recurso]?.rotulo ?? recurso
}

/** Parâmetros da URL (sem `formato`, que vira coluna própria). */
function filtrosDaUrl(url: URL): Record<string, string | string[]> {
  const f: Record<string, string | string[]> = {}
  for (const k of new Set(url.searchParams.keys())) {
    if (k === "formato") continue
    const v = url.searchParams.getAll(k).filter((x) => x !== "")
    if (v.length) f[k] = v.length === 1 ? v[0] : v
  }
  return f
}

/**
 * Registra o arquivo no livro. Não derruba a exportação se o registro
 * falhar (o erro vai ao console/Sentry): a rota já checou a permissão.
 */
export async function registrarExportacao(
  request: Request,
  dados: {
    usuarioId: string | null | undefined
    recurso: RecursoExportacao
    formato: "csv" | "xlsx" | "pdf" | "cnab"
    quantidade: number | null
    /** Recorte legível quando a URL não conta tudo (ex.: id da rodada vem do caminho). */
    filtros?: Record<string, unknown>
  }
): Promise<void> {
  const url = new URL(request.url)
  try {
    // Fora de TABELAS_TENANT: o createAdminClient grava pelo service_role
    // (o tenant só tem SELECT nesta tabela).
    const { error } = await (await createAdminClient())
      .from("lgpd_exportacoes")
      .insert({
        emp_proprietaria_id: await tenantAtual(),
        usuario_id: dados.usuarioId ?? null,
        recurso: dados.recurso,
        rota: url.pathname,
        formato: dados.formato,
        filtros: { ...filtrosDaUrl(url), ...(dados.filtros ?? {}) },
        quantidade: dados.quantidade,
        categorias: [...RECURSOS_EXPORTACAO[dados.recurso].categorias],
      })
    if (error) console.error("Falha ao registrar exportação no livro:", error.message)
  } catch (e) {
    console.error("Falha ao registrar exportação no livro:", e instanceof Error ? e.message : e)
  }
}

// ── Leitura (tela de auditoria) ─────────────────────────────────────────────

export type LinhaExportacao = {
  id: string
  recurso: string
  rota: string
  formato: string | null
  filtros: Record<string, unknown>
  quantidade: number | null
  categorias: string[]
  usuarioId: string | null
  momento: string
}

export async function listarExportacoes(
  filtros: { recurso?: string; usuarioId?: string; de?: string; ate?: string },
  pagina: number,
  porPagina: number
): Promise<{ linhas: LinhaExportacao[]; total: number; disponivel: boolean }> {
  const admin = await createAdminClient()
  let q = admin
    .from("lgpd_exportacoes")
    .select("id, recurso, rota, formato, filtros, quantidade, categorias, usuario_id, created_at", { count: "exact" })
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("created_at", { ascending: false })
  if (filtros.recurso) q = q.eq("recurso", filtros.recurso)
  if (filtros.usuarioId) q = q.eq("usuario_id", filtros.usuarioId)
  if (filtros.de) q = q.gte("created_at", `${filtros.de}T00:00:00-03:00`)
  if (filtros.ate) q = q.lte("created_at", `${filtros.ate}T23:59:59-03:00`)
  const de = (pagina - 1) * porPagina
  const { data, count, error } = await q.range(de, de + porPagina - 1)
  if (error) {
    if (esquemaAusente(error)) return { linhas: [], total: 0, disponivel: false }
    throw new Error(error.message)
  }
  return {
    disponivel: true,
    total: count ?? 0,
    linhas: (data ?? []).map((l) => ({
      id: String(l.id),
      recurso: String(l.recurso),
      rota: String(l.rota),
      formato: l.formato ? String(l.formato) : null,
      filtros: (l.filtros as Record<string, unknown> | null) ?? {},
      quantidade: l.quantidade === null || l.quantidade === undefined ? null : Number(l.quantidade),
      categorias: (l.categorias as string[] | null) ?? [],
      usuarioId: l.usuario_id ? String(l.usuario_id) : null,
      momento: String(l.created_at),
    })),
  }
}
