import "server-only"

import { esquemaAusente, nomesDosUsuarios, texto } from "@/lib/db/comum"
import { listarAcessos } from "@/lib/db/acessos"
import { avisar, avisarQuemPode, type Destinatario } from "@/lib/db/avisos"
import { principaisDoTenant } from "@/lib/db/departamento-principal"
import { listarDepartamentosCompletos } from "@/lib/db/departamentos"
import { CHAVES_PERMISSAO, ROTULO_PERMISSAO } from "@/lib/permissoes-catalogo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * REVISÃO PERIÓDICA DE ACESSOS (Gestão, 20/11/2026). A Gestão abre um ciclo
 * (sugestão: a cada trimestre) com prazo; cada pessoa com acesso ao painel
 * vira um item, revisado pelo coordenador do departamento dela. Ninguém revisa
 * o próprio acesso: o do coordenador, o de quem não está num departamento com
 * coordenador e o das contas de função ficam com a própria Gestão.
 *
 * O revisor responde manter, retirar ou ajustar (com o que ajustar). Retirar,
 * ajustar e o que ficar sem resposta vão para a Gestão resolver — a revogação
 * é sempre de quem tem a Gestão, não do coordenador. O ciclo encerrado fica
 * como registro (quem confirmou o quê e quando): a prova de controle.
 */

export const DIAS_ENTRE_REVISOES = 90

export type Decisao = "manter" | "retirar" | "ajustar"

export const ROTULO_DECISAO: Record<Decisao, string> = {
  manter: "Ainda precisa",
  retirar: "Pode retirar",
  ajustar: "Precisa ajustar",
}

export type ResumoAcesso = { perfis: string[]; diretas: string[]; total: number }

export type Ciclo = {
  id: string
  titulo: string
  abertoEm: string
  abertoPor: string | null
  prazo: string
  encerradoEm: string | null
}

export type ItemRevisaoCiclo = {
  id: string
  cicloId: string
  usuarioId: string
  nome: string
  departamentoId: string | null
  departamento: string | null
  revisorId: string | null
  revisor: string | null
  resumo: ResumoAcesso
  decisao: Decisao | null
  observacao: string | null
  decididoEm: string | null
  decididoPor: string | null
  tratadoEm: string | null
  tratadoPor: string | null
  tratamento: string | null
}

type Linha = Record<string, unknown>

function hojeBR(): string {
  return new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
}

function lerResumo(v: unknown): ResumoAcesso {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>
  const lista = (x: unknown) => (Array.isArray(x) ? x.map(String) : [])
  return { perfis: lista(o.perfis), diretas: lista(o.diretas), total: Number(o.total ?? 0) || 0 }
}

function ciclo(l: Linha): Ciclo {
  return {
    id: String(l.id),
    titulo: String(l.titulo),
    abertoEm: String(l.aberto_em),
    abertoPor: texto(l.aberto_por),
    prazo: String(l.prazo),
    encerradoEm: texto(l.encerrado_em),
  }
}

/** O ciclo aberto e o último encerrado (para "última revisão há N dias"). */
export async function situacaoCiclos(): Promise<{ disponivel: boolean; aberto: Ciclo | null; ultimoEncerrado: Ciclo | null; anteriores: Ciclo[] }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("acessos_revisao_ciclos")
    .select("id, titulo, aberto_em, aberto_por, prazo, encerrado_em")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("aberto_em", { ascending: false })
    .limit(12)
  if (error) return { disponivel: !esquemaAusente(error), aberto: null, ultimoEncerrado: null, anteriores: [] }
  const ciclos = ((data ?? []) as Linha[]).map(ciclo)
  return {
    disponivel: true,
    aberto: ciclos.find((c) => !c.encerradoEm) ?? null,
    ultimoEncerrado: ciclos.find((c) => c.encerradoEm) ?? null,
    anteriores: ciclos.filter((c) => c.encerradoEm),
  }
}

/** Título sugerido: o trimestre de hoje (ex.: "4º trimestre de 2026"). */
export function tituloSugerido(hoje = hojeBR()): string {
  const [a, m] = hoje.split("-").map(Number)
  return `${Math.floor((m - 1) / 3) + 1}º trimestre de ${a}`
}

/** Perfis (nomes) por usuário, numa consulta. */
async function perfisPorUsuario(ids: string[]): Promise<Map<string, string[]>> {
  const mapa = new Map<string, string[]>()
  if (!ids.length) return mapa
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuario_perfis")
    .select("usuario_id, perfis(nome, ativo)")
    .eq("emp_proprietaria_id", await tenantAtual())
    .in("usuario_id", ids)
  for (const l of (data ?? []) as Linha[]) {
    const bruto = l.perfis as Linha | Linha[] | null
    const p = Array.isArray(bruto) ? bruto[0] : bruto
    if (!p || p.ativo === false) continue
    const id = String(l.usuario_id)
    mapa.set(id, [...(mapa.get(id) ?? []), String(p.nome ?? "Perfil")])
  }
  return mapa
}

async function destinatariosPorId(ids: string[]): Promise<Destinatario[]> {
  if (!ids.length) return []
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, email")
    .in("id", ids)
    .not("inativo", "is", true)
    .not("deletado", "is", true)
  return ((data ?? []) as Linha[]).map((u) => ({
    id: String(u.id),
    nome: texto(u.nome_completo) ?? texto(u.nome_guerra),
    email: texto(u.email),
    permissoes: {},
  }))
}

function dataBR(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-")
  return `${d}/${m}/${a}`
}

/**
 * Abre um ciclo: um item por pessoa com acesso, com o revisor e o retrato do
 * acesso de agora. Avisa cada coordenador (e a Gestão, pelos que ficam com ela).
 */
export async function abrirCiclo(titulo: string, prazo: string, usuarioId: string): Promise<{ erro?: string; itens?: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { aberto, disponivel } = await situacaoCiclos()
  if (!disponivel) return { erro: "Falta aplicar a migração da revisão de acessos." }
  if (aberto) return { erro: `Já há uma revisão aberta (${aberto.titulo}). Encerre-a antes de abrir outra.` }

  const [acessos, deptos, linhasPerm] = await Promise.all([
    listarAcessos(),
    listarDepartamentosCompletos(),
    admin.from("permissoes").select("*").eq("emp_proprietaria_id", emp).not("usuario_id", "is", null),
  ])
  const comLogin = acessos.filter((a) => a.usuarioId)
  const perfis = await perfisPorUsuario(comLogin.map((a) => a.usuarioId!))
  const permPorUsuario = new Map(((linhasPerm.data ?? []) as Linha[]).map((p) => [String(p.usuario_id), p]))

  // Departamento de cada pessoa pelo qual alguém (que não ela) a revisa.
  const ativos = deptos.filter((d) => !d.legado && d.coordenadorId)
  // O departamento principal (Gestão › IA › Departamento principal) vem primeiro.
  const principais = await principaisDoTenant()
  const revisaoDe = (uid: string): { departamentoId: string; revisorId: string } | null => {
    const doPrincipal = ativos.find((x) => x.id === principais.get(uid) && x.coordenadorId !== uid)
    const d = doPrincipal ?? ativos.find((x) => x.coordenadorId !== uid && x.integrantes.some((i) => i.usuarioId === uid))
    return d ? { departamentoId: d.id, revisorId: d.coordenadorId! } : null
  }

  const { data: novo, error } = await admin
    .from("acessos_revisao_ciclos")
    .insert({ emp_proprietaria_id: emp, titulo, prazo, aberto_por: usuarioId })
    .select("id")
    .single()
  if (error || !novo) return { erro: `Falha ao abrir a revisão: ${error?.message ?? "sem retorno"}` }
  const cicloId = String(novo.id)

  const itens = comLogin.map((a) => {
    const uid = a.usuarioId!
    const p = permPorUsuario.get(uid) ?? {}
    const diretas = CHAVES_PERMISSAO.filter((c) => p[c] === true).map((c) => ROTULO_PERMISSAO[c] ?? c)
    const r = a.contaFuncao ? null : revisaoDe(uid)
    return {
      emp_proprietaria_id: emp,
      ciclo_id: cicloId,
      usuario_id: uid,
      departamento_id: r?.departamentoId ?? null,
      revisor_id: r?.revisorId ?? null,
      acesso_resumo: { perfis: perfis.get(uid) ?? [], diretas, total: a.totalPermissoes },
    }
  })
  for (let i = 0; i < itens.length; i += 500) {
    const { error: e } = await admin.from("acessos_revisao_itens").insert(itens.slice(i, i + 500))
    if (e) {
      await admin.from("acessos_revisao_ciclos").delete().eq("id", cicloId)
      return { erro: `Falha ao montar a revisão: ${e.message}` }
    }
  }

  // Avisos: cada coordenador com a quantidade da equipe; a Gestão pelos dela.
  const porRevisor = new Map<string, number>()
  let daGestao = 0
  for (const it of itens) {
    if (it.revisor_id) porRevisor.set(it.revisor_id, (porRevisor.get(it.revisor_id) ?? 0) + 1)
    else daGestao++
  }
  const coordenadores = await destinatariosPorId([...porRevisor.keys()])
  for (const c of coordenadores) {
    const n = porRevisor.get(c.id) ?? 0
    await avisar([c], {
      texto: `Revisão de acessos (${titulo}): confirme até ${dataBR(prazo)} se ${n === 1 ? "a pessoa da sua equipe ainda precisa" : `as ${n} pessoas da sua equipe ainda precisam`} do acesso ao Confluir.`,
      link: "/painel?aba=coordenacao#revisao-acessos",
      evento: "revisao_acessos",
      assunto: "Revisão de acessos da sua equipe",
    })
  }
  if (daGestao) {
    await avisarQuemPode("gestao_sistema", [], {
      texto: `Revisão de acessos (${titulo}) aberta: ${daGestao} ${daGestao === 1 ? "acesso fica" : "acessos ficam"} com a Gestão (sem coordenador, coordenadores e contas de função).`,
      link: "/painel/gestao/usuarios/revisao#periodica",
      evento: "revisao_acessos",
      assunto: "Revisão de acessos aberta",
      exceto: usuarioId,
    })
  }
  return { itens: itens.length }
}

/** Itens do ciclo, com nomes. `revisorId` filtra os de um coordenador. */
export async function itensDoCiclo(cicloId: string, revisorId?: string): Promise<ItemRevisaoCiclo[]> {
  const admin = await createAdminClient()
  let q = admin
    .from("acessos_revisao_itens")
    .select("id, ciclo_id, usuario_id, departamento_id, revisor_id, acesso_resumo, decisao, observacao, decidido_em, decidido_por, tratado_em, tratado_por, tratamento")
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("ciclo_id", cicloId)
  if (revisorId) q = q.eq("revisor_id", revisorId)
  const { data } = await q.range(0, 4999)
  const linhas = (data ?? []) as Linha[]
  const ids = new Set<string>()
  for (const l of linhas) for (const c of ["usuario_id", "revisor_id", "decidido_por", "tratado_por"]) if (l[c]) ids.add(String(l[c]))
  const [nomes, deptos] = await Promise.all([nomesDosUsuarios([...ids]), listarDepartamentosCompletos()])
  const nomeDepto = new Map(deptos.map((d) => [d.id, d.nome]))
  const nome = (v: unknown) => (v ? (nomes.get(String(v)) ?? null) : null)
  return linhas
    .map((l) => ({
      id: String(l.id),
      cicloId: String(l.ciclo_id),
      usuarioId: String(l.usuario_id),
      nome: nome(l.usuario_id) ?? "Pessoa sem nome",
      departamentoId: texto(l.departamento_id),
      departamento: l.departamento_id ? (nomeDepto.get(String(l.departamento_id)) ?? null) : null,
      revisorId: texto(l.revisor_id),
      revisor: nome(l.revisor_id),
      resumo: lerResumo(l.acesso_resumo),
      decisao: (texto(l.decisao) as Decisao | null) ?? null,
      observacao: texto(l.observacao),
      decididoEm: texto(l.decidido_em),
      decididoPor: nome(l.decidido_por),
      tratadoEm: texto(l.tratado_em),
      tratadoPor: nome(l.tratado_por),
      tratamento: texto(l.tratamento),
    }))
    // Por departamento; os que a Gestão revisa (sem departamento) no fim.
    .sort((a, b) => Number(!a.departamento) - Number(!b.departamento) || (a.departamento ?? "").localeCompare(b.departamento ?? "", "pt-BR") || a.nome.localeCompare(b.nome, "pt-BR"))
}

/** O que o coordenador tem para responder no ciclo aberto. */
export async function revisaoDoCoordenador(usuarioId: string): Promise<{ ciclo: Ciclo; itens: ItemRevisaoCiclo[] } | null> {
  const { aberto } = await situacaoCiclos()
  if (!aberto) return null
  const itens = await itensDoCiclo(aberto.id, usuarioId)
  return itens.length ? { ciclo: aberto, itens } : null
}

/**
 * Responde um item do ciclo aberto. O coordenador responde os da equipe; a
 * Gestão responde qualquer um (os dela e, se preciso, no lugar de quem não
 * respondeu). Ninguém responde o próprio acesso.
 */
export async function decidirItem(
  itemId: string,
  decisao: Decisao,
  observacao: string | null,
  usuarioId: string,
  comoGestao: boolean
): Promise<{ erro?: string }> {
  if (decisao === "ajustar" && !observacao) return { erro: "Diga o que precisa ajustar." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: item } = await admin
    .from("acessos_revisao_itens")
    .select("id, ciclo_id, usuario_id, revisor_id, tratado_em, acessos_revisao_ciclos(encerrado_em)")
    .eq("emp_proprietaria_id", emp)
    .eq("id", itemId)
    .maybeSingle()
  if (!item) return { erro: "Item não encontrado." }
  const c = item.acessos_revisao_ciclos as unknown as Linha | Linha[] | null
  const cic = Array.isArray(c) ? c[0] : c
  if (cic?.encerrado_em) return { erro: "Esta revisão já foi encerrada." }
  if (String(item.usuario_id) === usuarioId) return { erro: "Ninguém confirma o próprio acesso." }
  if (!comoGestao && String(item.revisor_id ?? "") !== usuarioId) return { erro: "Esta pessoa não está na sua revisão." }
  if (item.tratado_em) return { erro: "A Gestão já resolveu este acesso." }
  const { error } = await admin
    .from("acessos_revisao_itens")
    .update({ decisao, observacao, decidido_em: new Date().toISOString(), decidido_por: usuarioId })
    .eq("id", itemId)
  if (error) return { erro: `Falha ao salvar: ${error.message}` }
  return {}
}

/** A Gestão registra o que fez com um item (ajustou, manteve, revogou). */
export async function tratarItem(itemId: string, tratamento: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("acessos_revisao_itens")
    .update({ tratado_em: new Date().toISOString(), tratado_por: usuarioId, tratamento })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", itemId)
  if (error) return { erro: `Falha ao salvar: ${error.message}` }
  return {}
}

/** Revogou o acesso (por qualquer tela): o item do ciclo aberto fica resolvido. */
export async function marcarRevogadoNaRevisao(acessoId: string, usuarioId: string): Promise<void> {
  try {
    const admin = await createAdminClient()
    const emp = await tenantAtual()
    const { data: p } = await admin.from("permissoes").select("usuario_id").eq("emp_proprietaria_id", emp).eq("id", acessoId).maybeSingle()
    if (!p?.usuario_id) return
    const { aberto } = await situacaoCiclos()
    if (!aberto) return
    await admin
      .from("acessos_revisao_itens")
      .update({ tratado_em: new Date().toISOString(), tratado_por: usuarioId, tratamento: "Acesso revogado" })
      .eq("ciclo_id", aberto.id)
      .eq("usuario_id", String(p.usuario_id))
      .is("tratado_em", null)
  } catch (e) {
    console.error("marcarRevogadoNaRevisao:", e)
  }
}

export async function encerrarCiclo(cicloId: string, usuarioId: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("acessos_revisao_ciclos")
    .update({ encerrado_em: new Date().toISOString(), encerrado_por: usuarioId })
    .eq("emp_proprietaria_id", await tenantAtual())
    .eq("id", cicloId)
    .is("encerrado_em", null)
  if (error) return { erro: `Falha ao encerrar: ${error.message}` }
  return {}
}

export type ContagemCiclo = {
  total: number
  respondidos: number
  manter: number
  retirar: number
  ajustar: number
  semResposta: number
  /** Retirar/ajustar ainda não resolvidos pela Gestão. */
  paraResolver: number
}

export function contarItens(itens: ItemRevisaoCiclo[]): ContagemCiclo {
  const c: ContagemCiclo = { total: itens.length, respondidos: 0, manter: 0, retirar: 0, ajustar: 0, semResposta: 0, paraResolver: 0 }
  for (const i of itens) {
    if (i.decisao) {
      c.respondidos++
      c[i.decisao]++
      if (i.decisao !== "manter" && !i.tratadoEm) c.paraResolver++
    } else if (!i.tratadoEm) c.semResposta++
  }
  return c
}

/** Para a Saúde do sistema: a revisão está em dia? */
export async function saudeRevisaoPeriodica(): Promise<{ disponivel: boolean; diasDesdeUltima: number | null; aberto: Ciclo | null; prazoVencido: boolean; pendentes: number }> {
  const s = await situacaoCiclos()
  if (!s.disponivel) return { disponivel: false, diasDesdeUltima: null, aberto: null, prazoVencido: false, pendentes: 0 }
  const ref = s.ultimoEncerrado?.encerradoEm ?? null
  const diasDesdeUltima = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / (24 * 3600_000)) : null
  let pendentes = 0
  if (s.aberto) {
    const c = contarItens(await itensDoCiclo(s.aberto.id))
    pendentes = c.semResposta + c.paraResolver
  }
  return { disponivel: true, diasDesdeUltima, aberto: s.aberto, prazoVencido: Boolean(s.aberto && s.aberto.prazo < hojeBR()), pendentes }
}
