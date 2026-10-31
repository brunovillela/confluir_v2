import "server-only"

import { lerEmLotes, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { TIPOS_REUNIAO, type TipoReuniao } from "@/lib/atas-constantes"
import {
  ehSigiloDeliberacao,
  ehSituacaoDeliberacao,
  type SigiloDeliberacao,
  type SituacaoDeliberacao,
} from "@/lib/deliberacoes-constantes"

/**
 * Deliberações das atas (`reuniao_deliberacao`, 31/10/2026) — cada decisão
 * de uma reunião como item próprio, presa à ata: assunto, teor, votação,
 * responsável, prazo, situação do cumprimento e sigilo. A data é a da ata.
 * Registrar e editar: na página da ata. Consultar: Institucional ›
 * Deliberações (`listarDeliberacoes`).
 */

export type Deliberacao = {
  id: string
  ataId: string
  ordem: number
  assunto: string
  texto: string | null
  votacao: string | null
  responsavel: string | null
  prazo: string | null
  situacao: SituacaoDeliberacao
  sigilo: SigiloDeliberacao
}

export type DeliberacaoComAta = Deliberacao & {
  ata: { titulo: string | null; data: string | null; tipo: TipoReuniao; orgao: string | null }
}

const CAMPOS = "id, ata_id, ordem, assunto, texto, votacao, responsavel, prazo, situacao, sigilo"

function tipoValido(t: unknown): TipoReuniao {
  return TIPOS_REUNIAO.some((x) => x.chave === t) ? (t as TipoReuniao) : "outra"
}

function paraDeliberacao(r: Record<string, unknown>): Deliberacao {
  return {
    id: String(r.id),
    ataId: String(r.ata_id),
    ordem: Number(r.ordem ?? 1),
    assunto: String(r.assunto ?? ""),
    texto: texto(r.texto),
    votacao: texto(r.votacao),
    responsavel: texto(r.responsavel),
    prazo: texto(r.prazo),
    situacao: ehSituacaoDeliberacao(r.situacao) ? r.situacao : "a_cumprir",
    sigilo: ehSigiloDeliberacao(r.sigilo) ? r.sigilo : "restrito",
  }
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/**
 * Deliberações da ata que o usuário pode ver (`sigilos` = os graus que o
 * nível dele alcança) e quantas ficaram ocultas pelo sigilo.
 */
export async function deliberacoesDaAta(
  ataId: string,
  sigilos: SigiloDeliberacao[]
): Promise<{ visiveis: Deliberacao[]; ocultas: number }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("reuniao_deliberacao")
    .select(CAMPOS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ata_id", ataId)
    .order("ordem")
    .order("created_at")
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return { visiveis: [], ocultas: 0 }
    throw new Error(`Falha ao ler as deliberações: ${error.message}`)
  }
  const todas = (data ?? []).map((r) => paraDeliberacao(r as Record<string, unknown>))
  const visiveis = todas.filter((d) => sigilos.includes(d.sigilo))
  return { visiveis, ocultas: todas.length - visiveis.length }
}

export async function obterDeliberacao(id: string): Promise<Deliberacao | null> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("reuniao_deliberacao")
    .select(CAMPOS)
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
    .maybeSingle()
  return data ? paraDeliberacao(data as Record<string, unknown>) : null
}

export type FiltrosDeliberacoes = {
  /** Período pela data da ata (AAAA-MM-DD). */
  de?: string
  ate?: string
  /** Busca no assunto e no teor. */
  assunto?: string
  situacao?: SituacaoDeliberacao
  sigilo?: SigiloDeliberacao
  tipo?: TipoReuniao
  /**
   * Só as vencidas: a cumprir ou em execução com prazo antes desta data
   * (hoje, AAAA-MM-DD) — o mesmo critério da caixa de entrada.
   */
  vencidasAntesDe?: string
}

function escaparLike(t: string): string {
  return t.replace(/[%_\\,()]/g, (c) => (c === "," || c === "(" || c === ")" ? " " : `\\${c}`))
}

/**
 * Todas as deliberações do filtro, da reunião mais recente para a mais
 * antiga (e na ordem da ata). Lê tudo sem o teto de 1.000 do PostgREST — o
 * volume é o de uma entidade (dezenas por ano).
 */
export async function listarDeliberacoes(
  filtros: FiltrosDeliberacoes,
  sigilos: SigiloDeliberacao[]
): Promise<DeliberacaoComAta[]> {
  if (sigilos.length === 0) return []
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const termo = (filtros.assunto ?? "").trim()
  const linhas = await lerEmLotes<Record<string, unknown>>((de, ate) => {
    let q = admin
      .from("reuniao_deliberacao")
      .select(`${CAMPOS}, ata:ata_id!inner(titulo, data, tipo, orgao)`)
      .eq("emp_proprietaria_id", emp)
      .in("sigilo", sigilos)
    if (filtros.situacao) q = q.eq("situacao", filtros.situacao)
    if (filtros.sigilo) q = q.eq("sigilo", filtros.sigilo)
    if (filtros.tipo) q = q.eq("ata.tipo", filtros.tipo)
    if (filtros.vencidasAntesDe) {
      q = q.in("situacao", ["a_cumprir", "em_execucao"]).lt("prazo", filtros.vencidasAntesDe)
    }
    if (filtros.de) q = q.gte("ata.data", filtros.de)
    if (filtros.ate) q = q.lte("ata.data", filtros.ate)
    if (termo) {
      const e = escaparLike(termo)
      q = q.or(`assunto.ilike.%${e}%,texto.ilike.%${e}%`)
    }
    return q.order("id").range(de, ate)
  }).catch((e: Error) => {
    if (/does not exist|schema cache/i.test(e.message)) return []
    throw new Error(`Falha ao listar deliberações: ${e.message}`)
  })

  const resultado = linhas.map((r) => {
    const a = (Array.isArray(r.ata) ? r.ata[0] : r.ata) as Record<string, unknown> | null
    return {
      ...paraDeliberacao(r),
      ata: {
        titulo: texto(a?.titulo),
        data: texto(a?.data),
        tipo: tipoValido(a?.tipo),
        orgao: texto(a?.orgao),
      },
    }
  })
  return resultado.sort(
    (x, y) =>
      (y.ata.data ?? "").localeCompare(x.ata.data ?? "") ||
      x.ataId.localeCompare(y.ataId) ||
      x.ordem - y.ordem
  )
}

/** Assuntos já usados (dentro do sigilo do usuário) — sugestões no campo. */
export async function assuntosUsados(sigilos: SigiloDeliberacao[]): Promise<string[]> {
  if (sigilos.length === 0) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("reuniao_deliberacao")
    .select("assunto")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("sigilo", sigilos)
    .order("updated_at", { ascending: false })
    .limit(1000)
  const vistos = new Set<string>()
  for (const r of data ?? []) {
    const a = texto(r.assunto)
    if (a && a.length <= 60) vistos.add(a)
  }
  return [...vistos].sort((a, b) => a.localeCompare(b, "pt-BR")).slice(0, 200)
}

// ── Escrita ──────────────────────────────────────────────────────────────────

export type DadosDeliberacao = {
  assunto: string
  texto: string | null
  votacao: string | null
  responsavel: string | null
  prazo: string | null
  situacao: SituacaoDeliberacao
  sigilo: SigiloDeliberacao
}

export async function criarDeliberacao(
  ataId: string,
  dados: DadosDeliberacao,
  usuarioId: string
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: ata } = await admin
    .from("reuniao_ata")
    .select("id")
    .eq("emp_proprietaria_id", emp)
    .eq("id", ataId)
    .maybeSingle()
  if (!ata) return { erro: "Ata não encontrada." }
  const { data: ultima } = await admin
    .from("reuniao_deliberacao")
    .select("ordem")
    .eq("emp_proprietaria_id", emp)
    .eq("ata_id", ataId)
    .order("ordem", { ascending: false })
    .limit(1)
    .maybeSingle()
  const { data, error } = await admin
    .from("reuniao_deliberacao")
    .insert({
      ...dados,
      emp_proprietaria_id: emp,
      ata_id: ataId,
      ordem: Number(ultima?.ordem ?? 0) + 1,
      criado_por: usuarioId,
      atualizado_por: usuarioId,
    })
    .select("id")
    .single()
  if (error) return { erro: `Falha ao registrar a deliberação: ${error.message}` }
  return { id: String(data.id) }
}

export async function atualizarDeliberacao(
  id: string,
  dados: DadosDeliberacao,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("reuniao_deliberacao")
    .update({ ...dados, atualizado_por: usuarioId, updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
  if (error) return { erro: `Falha ao salvar a deliberação: ${error.message}` }
  return {}
}

export async function excluirDeliberacao(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("reuniao_deliberacao")
    .delete()
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
  if (error) return { erro: `Falha ao excluir a deliberação: ${error.message}` }
  return {}
}

/**
 * Deliberações lidas do PDF pela IA, gravadas ao salvar a ata — como "a
 * cumprir" e "reservado", para conferir depois. Só entram numa ata que
 * ainda não tem deliberações (reler o PDF não duplica).
 */
export async function registrarDeliberacoesLidas(
  ataId: string,
  itens: Omit<DadosDeliberacao, "situacao" | "sigilo">[],
  usuarioId: string
): Promise<{ quantidade: number; erro?: string }> {
  if (itens.length === 0) return { quantidade: 0 }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { count } = await admin
    .from("reuniao_deliberacao")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .eq("ata_id", ataId)
  if ((count ?? 0) > 0) return { quantidade: 0 }
  const { error } = await admin.from("reuniao_deliberacao").insert(
    itens.map((d, i) => ({
      ...d,
      emp_proprietaria_id: emp,
      ata_id: ataId,
      ordem: i + 1,
      situacao: "a_cumprir",
      sigilo: "reservado",
      criado_por: usuarioId,
      atualizado_por: usuarioId,
    }))
  )
  if (error) return { quantidade: 0, erro: `Falha ao registrar as deliberações lidas: ${error.message}` }
  return { quantidade: itens.length }
}
