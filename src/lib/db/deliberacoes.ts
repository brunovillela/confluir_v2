import "server-only"

import { lerEmLotes, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { PERMISSOES_USUARIO_FK, type Permissoes } from "@/lib/permissoes"
import { resolverPermissoes } from "@/lib/permissoes-resolver"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { TIPOS_REUNIAO, type TipoReuniao } from "@/lib/atas-constantes"
import {
  ehSigiloDeliberacao,
  ehSituacaoDeliberacao,
  nivelSigilo,
  ROTULO_SIGILO_DELIBERACAO,
  ROTULO_SITUACAO_DELIBERACAO,
  SIGILOS_DELIBERACAO,
  type NivelSigilo,
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
  /** Responsável em texto livre (quem não é usuário). */
  responsavel: string | null
  /** Responsável usuário — recebe o aviso de prazo vencido. */
  responsavelId: string | null
  responsavelNome: string | null
  prazo: string | null
  situacao: SituacaoDeliberacao
  sigilo: SigiloDeliberacao
}

export type DeliberacaoComAta = Deliberacao & {
  ata: { titulo: string | null; data: string | null; tipo: TipoReuniao; orgao: string | null }
}

const CAMPOS = "id, ata_id, ordem, assunto, texto, votacao, responsavel, responsavel_id, prazo, situacao, sigilo"

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
    responsavelId: texto(r.responsavel_id),
    responsavelNome: null,
    prazo: texto(r.prazo),
    situacao: ehSituacaoDeliberacao(r.situacao) ? r.situacao : "a_cumprir",
    sigilo: ehSigiloDeliberacao(r.sigilo) ? r.sigilo : "restrito",
  }
}

/** Preenche o nome dos responsáveis usuários. */
async function comNomes<T extends Deliberacao>(lista: T[]): Promise<T[]> {
  const nomes = await nomesDosUsuarios(lista.map((d) => d.responsavelId ?? ""), "guerra")
  return lista.map((d) => ({ ...d, responsavelNome: d.responsavelId ? (nomes.get(d.responsavelId) ?? null) : null }))
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
  const visiveis = await comNomes(todas.filter((d) => sigilos.includes(d.sigilo)))
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
  /** Só as abertas que vencem neste intervalo (AAAA-MM-DD, inclusive) — o lembrete antes do prazo. */
  vencemEntre?: { de: string; ate: string }
  /** Só as de um responsável usuário ("as minhas"). */
  responsavelId?: string
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
    if (filtros.responsavelId) q = q.eq("responsavel_id", filtros.responsavelId)
    if (filtros.vencemEntre) {
      q = q
        .in("situacao", ["a_cumprir", "em_execucao"])
        .gte("prazo", filtros.vencemEntre.de)
        .lte("prazo", filtros.vencemEntre.ate)
    }
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
  return (await comNomes(resultado)).sort(
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
  responsavel_id?: string | null
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
  await registrarEvento({
    deliberacaoId: String(data.id),
    ataId,
    evento: "criada",
    mudancas: await diferencas(null, dados),
    assunto: dados.assunto,
    sigilo: dados.sigilo,
    autorId: usuarioId,
  })
  return { id: String(data.id) }
}

export async function atualizarDeliberacao(
  id: string,
  dados: DadosDeliberacao,
  usuarioId: string
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const antes = await obterDeliberacao(id)
  const { error } = await admin
    .from("reuniao_deliberacao")
    .update({ ...dados, atualizado_por: usuarioId, updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
  if (error) return { erro: `Falha ao salvar a deliberação: ${error.message}` }
  if (antes) {
    const mudancas = await diferencas(antes, dados)
    // Salvar sem mudar nada não vira evento.
    if (mudancas.length > 0) {
      await registrarEvento({
        deliberacaoId: id,
        ataId: antes.ataId,
        evento: "alterada",
        mudancas,
        assunto: dados.assunto,
        // O "antes" pode ser mais sigiloso que o "depois": vale o mais restrito.
        sigilo: maisRestrito(antes.sigilo, dados.sigilo),
        autorId: usuarioId,
      })
    }
  }
  return {}
}

export async function excluirDeliberacao(id: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const antes = await obterDeliberacao(id)
  const { error } = await admin
    .from("reuniao_deliberacao")
    .delete()
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", id)
  if (error) return { erro: `Falha ao excluir a deliberação: ${error.message}` }
  // A exclusão também fica na trilha — sem o vínculo (a deliberação não existe
  // mais), com a ata, o assunto e o sigilo de então.
  if (antes) {
    await registrarEvento({
      deliberacaoId: null,
      ataId: antes.ataId,
      evento: "excluida",
      assunto: antes.assunto,
      sigilo: antes.sigilo,
      autorId: usuarioId,
    })
  }
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
  const linhas = itens.map((d, i) => ({
    ...d,
    ordem: i + 1,
    situacao: "a_cumprir" as const,
    sigilo: "reservado" as const,
  }))
  const { data, error } = await admin
    .from("reuniao_deliberacao")
    .insert(
      linhas.map((d) => ({ ...d, emp_proprietaria_id: emp, ata_id: ataId, criado_por: usuarioId, atualizado_por: usuarioId }))
    )
    .select("id, ordem")
  if (error) return { quantidade: 0, erro: `Falha ao registrar as deliberações lidas: ${error.message}` }
  for (const r of data ?? []) {
    const d = linhas.find((l) => l.ordem === Number(r.ordem))
    if (!d) continue
    await registrarEvento({
      deliberacaoId: String(r.id),
      ataId,
      evento: "criada",
      origem: "ia",
      mudancas: await diferencas(null, d),
      assunto: d.assunto,
      sigilo: d.sigilo,
      autorId: usuarioId,
    })
  }
  return { quantidade: itens.length }
}

// ── Responsável usuário ──────────────────────────────────────────────────────

/** Nível de sigilo de um usuário (permissões próprias + perfis), como no login. */
async function nivelDe(
  admin: Awaited<ReturnType<typeof createAdminClient>>,
  usuarioId: string,
  base: Permissoes
): Promise<NivelSigilo> {
  return nivelSigilo(await resolverPermissoes(admin, usuarioId, base))
}

export type ResponsavelPossivel = { id: string; nome: string; nivel: Exclude<NivelSigilo, "nenhum"> }

/**
 * Quem pode ser responsável por uma deliberação: usuários ativos da entidade
 * com algum nível de sigilo (sem nível, não veria a própria deliberação nem o
 * aviso). O nível vai junto para o formulário conferir com o sigilo.
 */
export async function responsaveisPossiveis(): Promise<ResponsavelPossivel[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: usuarios }, { data: perms }] = await Promise.all([
    admin.from("usuarios").select("id, inativo, deletado").eq("emp_proprietaria_id", emp),
    admin.from("permissoes").select("*"),
  ])
  const ativos = new Set(
    (usuarios ?? []).filter((u) => u.inativo !== true && u.deletado !== true).map((u) => String(u.id))
  )
  const linhas = (perms ?? []).filter((p) => ativos.has(String(p[PERMISSOES_USUARIO_FK])))
  const niveis = await Promise.all(
    linhas.map(async (p) => {
      const id = String(p[PERMISSOES_USUARIO_FK])
      return { id, nivel: await nivelDe(admin, id, p as Permissoes) }
    })
  )
  const comNivel = niveis.filter((n): n is { id: string; nivel: ResponsavelPossivel["nivel"] } => n.nivel !== "nenhum")
  const nomes = await nomesDosUsuarios(comNivel.map((n) => n.id), "guerra")
  return comNivel
    .map((n) => ({ ...n, nome: nomes.get(n.id) ?? "(sem nome)" }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/** Nível de sigilo de um usuário da entidade ("nenhum" se não achar). */
export async function nivelDoUsuario(usuarioId: string): Promise<NivelSigilo> {
  const admin = await createAdminClient()
  const { data: u } = await admin
    .from("usuarios")
    .select("id, inativo, deletado")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", usuarioId)
    .maybeSingle()
  if (!u || u.inativo === true || u.deletado === true) return "nenhum"
  const { data: p } = await admin.from("permissoes").select("*").eq(PERMISSOES_USUARIO_FK, usuarioId).maybeSingle()
  if (!p) return "nenhum"
  return nivelDe(admin, usuarioId, p as Permissoes)
}

// ── Trilha de alterações (reuniao_deliberacao_eventos, 31/10/2026) ───────────

export type MudancaDeliberacao = { campo: string; antes: string | null; depois: string | null }

export type EventoDeliberacao = {
  id: string
  deliberacaoId: string | null
  evento: "criada" | "alterada" | "excluida"
  origem: "manual" | "ia"
  mudancas: MudancaDeliberacao[]
  assunto: string | null
  sigilo: SigiloDeliberacao
  autorNome: string | null
  quando: string
}

const ROTULO_CAMPO: Record<string, string> = {
  assunto: "Assunto",
  texto: "Teor",
  votacao: "Votação",
  responsavel_id: "Responsável no sistema",
  responsavel: "Responsável fora do sistema",
  prazo: "Prazo",
  situacao: "Situação",
  sigilo: "Sigilo",
}

function maisRestrito(a: SigiloDeliberacao, b: SigiloDeliberacao): SigiloDeliberacao {
  const ordem: SigiloDeliberacao[] = SIGILOS_DELIBERACAO.map((x) => x.chave)
  return ordem.indexOf(a) >= ordem.indexOf(b) ? a : b
}

/**
 * Campo a campo, o que mudou — já como se lê na tela (nome do responsável,
 * data dd/mm/aaaa, rótulo da situação e do sigilo). `antes` nulo = criação:
 * entram os campos preenchidos.
 */
async function diferencas(antes: Deliberacao | null, depois: DadosDeliberacao): Promise<MudancaDeliberacao[]> {
  const valoresAntes: Record<string, string | null> = antes
    ? {
        assunto: antes.assunto,
        texto: antes.texto,
        votacao: antes.votacao,
        responsavel_id: antes.responsavelId,
        responsavel: antes.responsavel,
        prazo: antes.prazo,
        situacao: antes.situacao,
        sigilo: antes.sigilo,
      }
    : {}
  const valoresDepois: Record<string, string | null> = {
    assunto: depois.assunto,
    texto: depois.texto,
    votacao: depois.votacao,
    responsavel_id: depois.responsavel_id ?? null,
    responsavel: depois.responsavel,
    prazo: depois.prazo,
    situacao: depois.situacao,
    sigilo: depois.sigilo,
  }
  const campos = Object.keys(ROTULO_CAMPO).filter((c) => (valoresAntes[c] ?? null) !== (valoresDepois[c] ?? null))
  const nomes = await nomesDosUsuarios([valoresAntes.responsavel_id ?? "", valoresDepois.responsavel_id ?? ""], "guerra")
  const legivel = (campo: string, v: string | null): string | null => {
    if (!v) return null
    if (campo === "responsavel_id") return nomes.get(v) ?? "(usuário)"
    if (campo === "prazo") return v.split("-").reverse().join("/")
    if (campo === "situacao" && ehSituacaoDeliberacao(v)) return ROTULO_SITUACAO_DELIBERACAO[v]
    if (campo === "sigilo" && ehSigiloDeliberacao(v)) return ROTULO_SIGILO_DELIBERACAO[v]
    return v
  }
  return campos.map((c) => ({
    campo: ROTULO_CAMPO[c],
    antes: legivel(c, valoresAntes[c] ?? null),
    depois: legivel(c, valoresDepois[c] ?? null),
  }))
}

/**
 * Acrescenta uma linha à trilha. Melhor esforço: a falha vai para o log e
 * não desfaz a mudança na deliberação (a gravação já aconteceu).
 */
async function registrarEvento(ev: {
  /** Nulo na exclusão (a linha da deliberação já não existe). */
  deliberacaoId: string | null
  ataId: string
  evento: EventoDeliberacao["evento"]
  origem?: EventoDeliberacao["origem"]
  mudancas?: MudancaDeliberacao[]
  assunto: string
  sigilo: SigiloDeliberacao
  autorId: string
}): Promise<void> {
  try {
    const admin = await createAdminClient()
    const nomes = await nomesDosUsuarios([ev.autorId], "guerra")
    const { error } = await admin.from("reuniao_deliberacao_eventos").insert({
      emp_proprietaria_id: await tenantAtual(),
      deliberacao_id: ev.deliberacaoId,
      ata_id: ev.ataId,
      evento: ev.evento,
      origem: ev.origem ?? "manual",
      mudancas: ev.mudancas ?? [],
      assunto: ev.assunto,
      sigilo: ev.sigilo,
      autor_id: ev.autorId,
      autor_nome: nomes.get(ev.autorId) ?? null,
    })
    if (error) console.error("trilha da deliberação:", error.message)
  } catch (e) {
    console.error("trilha da deliberação:", (e as Error).message)
  }
}

/**
 * Trilha das deliberações da ata — só as linhas que o nível do usuário
 * alcança (`sigilos`), da mais antiga para a mais nova. Inclui as das
 * deliberações excluídas (`deliberacaoId` nulo).
 */
export async function eventosDaAta(ataId: string, sigilos: SigiloDeliberacao[]): Promise<EventoDeliberacao[]> {
  if (sigilos.length === 0) return []
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("reuniao_deliberacao_eventos")
    .select("id, deliberacao_id, evento, origem, mudancas, assunto, sigilo, autor_nome, created_at")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ata_id", ataId)
    .in("sigilo", sigilos)
    .order("created_at")
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return []
    throw new Error(`Falha ao ler a trilha das deliberações: ${error.message}`)
  }
  return (data ?? []).map((r) => ({
    id: String(r.id),
    deliberacaoId: texto(r.deliberacao_id),
    evento: r.evento === "alterada" || r.evento === "excluida" ? r.evento : "criada",
    origem: r.origem === "ia" ? "ia" : "manual",
    mudancas: Array.isArray(r.mudancas) ? (r.mudancas as MudancaDeliberacao[]) : [],
    assunto: texto(r.assunto),
    sigilo: ehSigiloDeliberacao(r.sigilo) ? r.sigilo : "restrito",
    autorNome: texto(r.autor_nome),
    quando: String(r.created_at),
  }))
}
