import "server-only"

import {
  esquemaAusente,
  hojeSP,
  lerEmLotes,
  nomesDosUsuarios,
} from "@/lib/db/comum"
import { depoisDaResposta } from "@/lib/db/avisos"
import { avisarMudancasDeCondicao } from "@/lib/db/filiacao-condicao-avisos"
import { atribuirMatriculaSindical } from "@/lib/db/filiacao-identidade"
import { CONDICAO_COLETIVA, type FiliacaoCondicao } from "@/lib/filiacao"
import { createAdminClient, createServiceClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Filiação coletiva — deliberada em assembleia cujo ACT tem a cláusula.
 *
 * O nascedouro é a RODADA de assembleia marcada com a cláusula (toggle no
 * cadastro da rodada, com os dias de desistência). A partir dela cria-se o
 * PROCESSO, que concilia os aptos com o cadastro e aplica o resultado.
 *
 * CONCILIAÇÃO — a empresa nem sempre envia CPF, então o casamento é em cascata,
 * do mais forte ao mais fraco:
 *   cpf → matrícula → e-mail → nome completo normalizado
 * Os três primeiros casam automaticamente; o NOME entra como "dúvida" para o
 * gestor confirmar, porque homônimo é comum e filiar a pessoa errada tem
 * consequência. Nada é gravado antes da confirmação (situacao='rascunho').
 *
 * Ver [[confluir-filiacao-coletiva]]; SQL supabase/filiacao-coletiva.sql.
 */

export type ChaveCasamento = "cpf" | "matricula" | "email" | "nome" | "manual" | "nenhum"
export type ResultadoItem =
  | "mantido_ativo"
  | "criado"
  | "recarimbado"
  | "duvida"
  | "ignorado"
  | "desistiu"

export type ItemConciliacao = {
  aptoId: string
  cpf: string | null
  nome: string | null
  matricula: string | null
  email: string | null
  chave: ChaveCasamento
  resultado: ResultadoItem
  /** Filiado casado (quando houve casamento). */
  filiacaoId: string | null
  filiadoNome: string | null
  condicaoAtual: string | null
  /** Candidatos quando o casamento é duvidoso (só por nome). */
  candidatos: { id: string; nome: string | null; cpf: string | null; condicao: string | null }[]
}

export type Conciliacao = {
  itens: ItemConciliacao[]
  resumo: {
    total: number
    mantidos: number
    aCriar: number
    aRecarimbar: number
    duvidas: number
  }
}

/** Normaliza nome para comparação: sem acento, caixa baixa, espaços colapsados. */
function chaveNome(nome: string | null | undefined): string | null {
  if (!nome) return null
  const n = semAcento(nome).toLowerCase().replace(/\s+/g, " ").trim()
  return n.length >= 6 ? n : null // nomes curtos demais não servem de chave
}

function soDigitos(v: string | null | undefined): string | null {
  const d = (v ?? "").replace(/\D/g, "")
  return d === "" ? null : d
}

function emailNorm(v: string | null | undefined): string | null {
  const e = (v ?? "").trim().toLowerCase()
  return e.includes("@") ? e : null
}

type FiliadoIndexado = {
  id: string
  nome_completo: string | null
  cpf: string | null
  matricula_sindical: string | null
  email_pessoal: string | null
  email_corporativo: string | null
  filiacao_condicao: string | null
}

/** Tamanho do lote — o PostgREST limita a resposta a 1.000 linhas. */
const LOTE = 1000

/**
 * Lê TODAS as linhas de uma consulta, em lotes de 1.000 (limite do PostgREST).
 * Sem isso, tabelas grandes voltam truncadas silenciosamente. Página que
 * falha LANÇA: uma conciliação feita sobre cadastro cortado mandaria criar
 * filiações que já existem (aplicarProcesso transforma o erro em mensagem).
 */
async function paginar<T>(
  consulta: (
    de: number,
    ate: number
  ) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<T[]> {
  const todas: T[] = []
  for (let de = 0; ; de += LOTE) {
    const { data, error } = await consulta(de, de + LOTE - 1)
    if (error) {
      const msg = typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : String(error)
      throw new Error(`Falha ao ler em lotes: ${msg}`)
    }
    const linhas = (data ?? []) as T[]
    todas.push(...linhas)
    if (linhas.length < LOTE) break
  }
  return todas
}

/**
 * Concilia os aptos da rodada com o cadastro de filiados. NÃO grava nada —
 * devolve o plano para o gestor revisar.
 */
export async function conciliar(rodadaId: string): Promise<Conciliacao> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  // ATENÇÃO: o PostgREST devolve no máximo 1.000 linhas por requisição. Aqui
  // as duas pontas estouram esse teto (milhares de aptos, ~11 mil filiados) —
  // sem paginar, a conciliação casaria contra um cadastro truncado e mandaria
  // criar gente que já existe. Por isso as duas leituras são paginadas.
  const [aptos, filiados] = await Promise.all([
    paginar<Record<string, unknown>>((de, ate) =>
      admin
        .from("voto_assembleias_aptos")
        .select("id, cpf, nome_completo, matricula, email_corporativo")
        .eq("rod_assembleia_id", rodadaId)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
    paginar<FiliadoIndexado>((de, ate) =>
      admin
        .from("filiacoes")
        .select(
          "id, nome_completo, cpf, matricula_sindical, email_pessoal, email_corporativo, filiacao_condicao"
        )
        .eq("emp_proprietaria_id", emp)
        .not("filiacao_excluida", "is", true)
        .order("id", { ascending: true })
        .range(de, ate)
    ),
  ])

  // índices de busca (o cadastro pode ter milhares — uma passada só)
  const porCpf = new Map<string, FiliadoIndexado>()
  const porMatricula = new Map<string, FiliadoIndexado[]>()
  const porEmail = new Map<string, FiliadoIndexado>()
  const porNome = new Map<string, FiliadoIndexado[]>()
  const juntar = <T>(m: Map<string, T[]>, k: string, v: T) =>
    m.set(k, [...(m.get(k) ?? []), v])

  for (const f of (filiados ?? []) as FiliadoIndexado[]) {
    const cpf = soDigitos(f.cpf)
    if (cpf) porCpf.set(cpf, f)
    const mat = soDigitos(f.matricula_sindical)
    if (mat) juntar(porMatricula, mat, f)
    for (const e of [f.email_pessoal, f.email_corporativo]) {
      const em = emailNorm(e)
      if (em && !porEmail.has(em)) porEmail.set(em, f)
    }
    const n = chaveNome(f.nome_completo)
    if (n) juntar(porNome, n, f)
  }

  const itens: ItemConciliacao[] = (aptos ?? []).map((a) => {
    const cpf = soDigitos(a.cpf as string | null)
    const mat = soDigitos(a.matricula as string | null)
    const email = emailNorm(a.email_corporativo as string | null)
    const nome = a.nome_completo as string | null

    let achado: FiliadoIndexado | null = null
    let chave: ChaveCasamento = "nenhum"
    let candidatos: FiliadoIndexado[] = []

    if (cpf && porCpf.has(cpf)) {
      achado = porCpf.get(cpf)!
      chave = "cpf"
    } else if (mat && (porMatricula.get(mat) ?? []).length === 1) {
      achado = porMatricula.get(mat)![0]
      chave = "matricula"
    } else if (email && porEmail.has(email)) {
      achado = porEmail.get(email)!
      chave = "email"
    } else {
      const n = chaveNome(nome)
      const porNomeAchados = n ? (porNome.get(n) ?? []) : []
      if (porNomeAchados.length > 0) {
        // nome NUNCA casa sozinho — vira dúvida para o gestor decidir
        candidatos = porNomeAchados.slice(0, 5)
        chave = "nome"
      }
    }

    const base = {
      aptoId: a.id as string,
      cpf,
      nome,
      matricula: a.matricula as string | null,
      email: a.email_corporativo as string | null,
    }

    if (achado) {
      const ativo = achado.filiacao_condicao === "Ativo"
      return {
        ...base,
        chave,
        resultado: ativo ? ("mantido_ativo" as const) : ("recarimbado" as const),
        filiacaoId: achado.id,
        filiadoNome: achado.nome_completo,
        condicaoAtual: achado.filiacao_condicao,
        candidatos: [],
      }
    }
    if (candidatos.length > 0) {
      return {
        ...base,
        chave: "nome" as ChaveCasamento,
        resultado: "duvida" as const,
        filiacaoId: null,
        filiadoNome: null,
        condicaoAtual: null,
        candidatos: candidatos.map((c) => ({
          id: c.id,
          nome: c.nome_completo,
          cpf: c.cpf,
          condicao: c.filiacao_condicao,
        })),
      }
    }
    return {
      ...base,
      chave: "nenhum" as ChaveCasamento,
      resultado: "criado" as const,
      filiacaoId: null,
      filiadoNome: null,
      condicaoAtual: null,
      candidatos: [],
    }
  })

  return {
    itens,
    resumo: {
      total: itens.length,
      mantidos: itens.filter((i) => i.resultado === "mantido_ativo").length,
      aCriar: itens.filter((i) => i.resultado === "criado").length,
      aRecarimbar: itens.filter((i) => i.resultado === "recarimbado").length,
      duvidas: itens.filter((i) => i.resultado === "duvida").length,
    },
  }
}

// ── Leitura dos processos ────────────────────────────────────────────────────

export type ProcessoColetivo = {
  id: string
  titulo: string | null
  rodadaId: string | null
  rodadaNome: string | null
  acordoId: string | null
  acordoTitulo: string | null
  dias: number | null
  situacao: string
  processado_em: string | null
  prazo_ate: string | null
  revertido_em: string | null
  criadoPorNome: string | null
  created_at: string
  totais: {
    total: number
    criados: number
    recarimbados: number
    mantidos: number
    duvidas: number
    desistiram: number
    ativados: number
  }
}

const VAZIO = {
  total: 0, criados: 0, recarimbados: 0, mantidos: 0,
  duvidas: 0, desistiram: 0, ativados: 0,
}

export async function listarProcessos(): Promise<{
  ativo: boolean
  linhas: ProcessoColetivo[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("filiacao_coletiva")
    .select(
      "id, titulo, rod_assembleia_id, acordo_id, dias_desistencia, situacao, processado_em, prazo_ate, revertido_em, criado_por, created_at"
    )
    .eq("emp_proprietaria_id", emp)
    .order("created_at", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar filiações coletivas: ${error.message}`)
  }
  const ids = (data ?? []).map((p) => p.id as string)
  // PostgREST corta em 1.000 linhas: um lote grande sozinho estoura o teto.
  // Os totais vêm de contagens no banco (head), por processo × resultado.
  const contar = async (
    coletivaId: string,
    filtro?: { resultado?: string; ativado?: true }
  ): Promise<number> => {
    let q = admin
      .from("filiacao_coletiva_itens")
      .select("id", { count: "exact", head: true })
      .eq("coletiva_id", coletivaId)
    if (filtro?.resultado) q = q.eq("resultado", filtro.resultado)
    if (filtro?.ativado) q = q.not("ativado_em", "is", null)
    const { count } = await q
    return count ?? 0
  }
  const totaisDe = async (coletivaId: string): Promise<typeof VAZIO> => {
    const [total, criados, recarimbados, mantidos, duvidas, desistiram, ativados] =
      await Promise.all([
        contar(coletivaId),
        contar(coletivaId, { resultado: "criado" }),
        contar(coletivaId, { resultado: "recarimbado" }),
        contar(coletivaId, { resultado: "mantido_ativo" }),
        contar(coletivaId, { resultado: "duvida" }),
        contar(coletivaId, { resultado: "desistiu" }),
        contar(coletivaId, { ativado: true }),
      ])
    return { total, criados, recarimbados, mantidos, duvidas, desistiram, ativados }
  }
  const [totais, rodadas, acordos, nomes] = await Promise.all([
    Promise.all(ids.map(async (id) => [id, await totaisDe(id)] as const)),
    admin
      .from("voto_rod_assembleias")
      .select("id, nome_assembleia")
      .eq("emp_proprietaria_id", emp),
    admin
      .from("acordo_coletivo")
      .select("id, titulo")
      .eq("emp_proprietaria_id", emp),
    nomesDosUsuarios(
      (data ?? []).map((p) => p.criado_por as string).filter(Boolean)
    ),
  ])
  const nomeRodada = new Map(
    (rodadas.data ?? []).map((r) => [
      r.id as string,
      r.nome_assembleia as string | null,
    ])
  )
  const tituloAcordo = new Map(
    (acordos.data ?? []).map((a) => [a.id as string, a.titulo as string | null])
  )
  const porLote = new Map<string, typeof VAZIO>(totais)
  return {
    ativo: true,
    linhas: (data ?? []).map((p) => ({
      id: p.id as string,
      titulo: p.titulo as string | null,
      rodadaId: p.rod_assembleia_id as string | null,
      rodadaNome: p.rod_assembleia_id
        ? (nomeRodada.get(p.rod_assembleia_id as string) ?? null)
        : null,
      acordoId: p.acordo_id as string | null,
      acordoTitulo: p.acordo_id
        ? (tituloAcordo.get(p.acordo_id as string) ?? null)
        : null,
      dias: p.dias_desistencia as number | null,
      situacao: (p.situacao as string) ?? "rascunho",
      processado_em: p.processado_em as string | null,
      prazo_ate: p.prazo_ate as string | null,
      revertido_em: p.revertido_em as string | null,
      criadoPorNome: p.criado_por
        ? (nomes.get(p.criado_por as string) ?? null)
        : null,
      created_at: p.created_at as string,
      totais: porLote.get(p.id as string) ?? { ...VAZIO },
    })),
  }
}

export type ItemDoProcesso = {
  id: string
  cpf: string | null
  nome_completo: string | null
  matricula: string | null
  email: string | null
  chave_casamento: string | null
  resultado: string | null
  condicao_anterior: string | null
  filiacao_id: string | null
  condicaoAtual: string | null
  desistencia_em: string | null
  ativado_em: string | null
}

export async function buscarProcesso(id: string): Promise<{
  processo: ProcessoColetivo
  itens: ItemDoProcesso[]
} | null> {
  const { linhas } = await listarProcessos()
  const processo = linhas.find((p) => p.id === id)
  if (!processo) return null
  const admin = await createAdminClient()
  // PostgREST corta em 1.000 linhas — o lote pode ter milhares de itens.
  let data: Record<string, unknown>[] = []
  try {
    data = await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("filiacao_coletiva_itens")
        .select(
          "id, cpf, nome_completo, matricula, email, chave_casamento, resultado, condicao_anterior, filiacao_id, desistencia_em, ativado_em"
        )
        .eq("coletiva_id", id)
        .order("nome_completo", { ascending: true, nullsFirst: false })
        .order("id", { ascending: true })
        .range(de, ate)
    )
  } catch {
    data = []
  }
  const filiacaoIds = [
    ...new Set(
      data
        .map((i) => i.filiacao_id as string | null)
        .filter((v): v is string => !!v)
    ),
  ]
  const condicoes = new Map<string, string | null>()
  // .in() em blocos de 200: milhares de ids estourariam a URL.
  for (let k = 0; k < filiacaoIds.length; k += 200) {
    const { data: fs } = await admin
      .from("filiacoes")
      .select("id, filiacao_condicao")
      .in("id", filiacaoIds.slice(k, k + 200))
    for (const f of fs ?? []) {
      condicoes.set(f.id as string, f.filiacao_condicao as string | null)
    }
  }
  return {
    processo,
    itens: data.map((i) => ({
      id: i.id as string,
      cpf: i.cpf as string | null,
      nome_completo: i.nome_completo as string | null,
      matricula: i.matricula as string | null,
      email: i.email as string | null,
      chave_casamento: i.chave_casamento as string | null,
      resultado: i.resultado as string | null,
      condicao_anterior: i.condicao_anterior as string | null,
      filiacao_id: i.filiacao_id as string | null,
      condicaoAtual: i.filiacao_id
        ? (condicoes.get(i.filiacao_id as string) ?? null)
        : null,
      desistencia_em: i.desistencia_em as string | null,
      ativado_em: i.ativado_em as string | null,
    })),
  }
}

/** Rodadas com cláusula de filiação coletiva ainda SEM processo vinculado. */
export async function rodadasDisponiveis(): Promise<
  { id: string; nome: string | null; dias: number | null; aptos: number }[]
> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("voto_rod_assembleias")
    .select("id, nome_assembleia, filiacao_coletiva_dias")
    .eq("emp_proprietaria_id", emp)
    .eq("clausula_filiacao_coletiva", true)
  if (error) return []
  const { data: usadas } = await admin
    .from("filiacao_coletiva")
    .select("rod_assembleia_id")
    .eq("emp_proprietaria_id", emp)
  const jaUsadas = new Set(
    (usadas ?? []).map((u) => u.rod_assembleia_id as string).filter(Boolean)
  )
  const livres = (data ?? []).filter((r) => !jaUsadas.has(r.id as string))
  const resultado: { id: string; nome: string | null; dias: number | null; aptos: number }[] = []
  for (const r of livres) {
    const { count } = await admin
      .from("voto_assembleias_aptos")
      .select("id", { count: "exact", head: true })
      .eq("rod_assembleia_id", r.id)
    resultado.push({
      id: r.id as string,
      nome: r.nome_assembleia as string | null,
      dias: r.filiacao_coletiva_dias as number | null,
      aptos: count ?? 0,
    })
  }
  return resultado.sort((a, b) => (a.nome ?? "").localeCompare(b.nome ?? "", "pt-BR"))
}

/**
 * Situação da filiação coletiva de UM filiado — usada na área do filiado para
 * decidir se a desistência online aparece (só na condição coletiva e dentro do
 * prazo). Tolerante ao schema ausente.
 */
export async function situacaoColetivaDoFiliado(
  filiacaoId: string | null | undefined
): Promise<{ emProcesso: boolean; prazo: string | null; dentroDoPrazo: boolean }> {
  const vazio = { emProcesso: false, prazo: null, dentroDoPrazo: false }
  if (!filiacaoId) return vazio
  try {
    const admin = await createAdminClient()
    const { data, error } = await admin
      .from("filiacoes")
      .select("filiacao_condicao, filiacao_coletiva_prazo")
      .eq("id", filiacaoId)
      .eq("emp_proprietaria_id", await tenantAtual())
      .maybeSingle()
    if (error || !data) return vazio
    const emProcesso = data.filiacao_condicao === CONDICAO_COLETIVA
    const prazo = (data.filiacao_coletiva_prazo as string | null) ?? null
    return {
      emProcesso,
      prazo,
      dentroDoPrazo: emProcesso && (!prazo || prazo >= hojeSP()),
    }
  } catch {
    return vazio
  }
}

// ── Aplicação do lote ────────────────────────────────────────────────────────

/** Soma dias corridos a uma data AAAA-MM-DD. */
export function somarDias(data: string, dias: number): string {
  const d = new Date(`${data}T12:00:00`)
  d.setDate(d.getDate() + dias)
  return d.toISOString().slice(0, 10)
}

/**
 * Aplica o plano conciliado: cria/re-carimba filiações, grava os itens do lote
 * e marca o processo como processado. `decisoes` traz o que o gestor resolveu
 * para as dúvidas: aptoId → filiacaoId (casar com esse) | "criar" | "ignorar".
 */
export async function aplicarProcesso(
  coletivaId: string,
  decisoes: Record<string, string>
): Promise<{ erro?: string; resumo?: { criados: number; recarimbados: number; mantidos: number; ignorados: number } }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: proc } = await admin
    .from("filiacao_coletiva")
    .select("id, rod_assembleia_id, dias_desistencia, situacao")
    .eq("id", coletivaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!proc) return { erro: "Processo não encontrado." }
  if (proc.situacao === "processado") {
    return { erro: "Este processo já foi aplicado." }
  }
  if (proc.situacao === "revertido") {
    return { erro: "Este processo foi revertido e não pode ser aplicado de novo." }
  }

  let conciliacao: Conciliacao
  try {
    conciliacao = await conciliar(proc.rod_assembleia_id as string)
  } catch (e) {
    // Sem a conciliação completa, nada é gravado (evita filiação em dobro).
    return { erro: `Não foi possível conferir os cadastros agora. Nada foi aplicado. ${(e as Error).message}` }
  }
  const hoje = hojeSP()
  const dias = (proc.dias_desistencia as number | null) ?? 0
  const prazo = somarDias(hoje, dias)

  const resumo = { criados: 0, recarimbados: 0, mantidos: 0, ignorados: 0 }
  const itensGravar: Record<string, unknown>[] = []

  for (const item of conciliacao.itens) {
    // resolve dúvidas com a decisão do gestor
    let resultado: ResultadoItem = item.resultado
    let filiacaoId = item.filiacaoId
    let chave = item.chave
    let condicaoAtual = item.condicaoAtual
    if (item.resultado === "duvida") {
      const d = decisoes[item.aptoId]
      if (!d || d === "ignorar") {
        resumo.ignorados++
        itensGravar.push({
          emp_proprietaria_id: emp,
          coletiva_id: coletivaId,
          apto_id: item.aptoId,
          cpf: item.cpf,
          nome_completo: item.nome,
          matricula: item.matricula,
          email: item.email,
          chave_casamento: "nome",
          resultado: "ignorado",
          observacao: "Dúvida não resolvida na conciliação.",
        })
        continue
      }
      if (d === "criar") {
        resultado = "criado"
        chave = "manual"
      } else {
        const escolhido = item.candidatos.find((c) => c.id === d)
        if (!escolhido) {
          resumo.ignorados++
          continue
        }
        filiacaoId = escolhido.id
        condicaoAtual = escolhido.condicao
        chave = "manual"
        resultado = escolhido.condicao === "Ativo" ? "mantido_ativo" : "recarimbado"
      }
    }

    if (resultado === "mantido_ativo") {
      resumo.mantidos++
      itensGravar.push({
        emp_proprietaria_id: emp,
        coletiva_id: coletivaId,
        apto_id: item.aptoId,
        filiacao_id: filiacaoId,
        cpf: item.cpf,
        nome_completo: item.nome,
        matricula: item.matricula,
        email: item.email,
        chave_casamento: chave,
        resultado: "mantido_ativo",
        condicao_anterior: condicaoAtual,
      })
      continue
    }

    if (resultado === "criado") {
      const { data: criada, error } = await admin
        .from("filiacoes")
        .insert({
          nome_completo: item.nome,
          cpf: item.cpf,
          // A matrícula da lista é a da empresa (fica no vínculo); a sindical
          // é atribuída logo abaixo.
          matricula_sindical: null,
          email_corporativo: item.email,
          filiacao_condicao: CONDICAO_COLETIVA,
          filiacao_coletiva_id: coletivaId,
          filiacao_coletiva_prazo: prazo,
          filiacao_coletiva_em: hoje,
          condicao_desde: hoje,
          emp_proprietaria_id: emp,
        })
        .select("id")
        .single()
      if (error || !criada) {
        itensGravar.push({
          emp_proprietaria_id: emp,
          coletiva_id: coletivaId,
          apto_id: item.aptoId,
          cpf: item.cpf,
          nome_completo: item.nome,
          matricula: item.matricula,
          email: item.email,
          chave_casamento: chave,
          resultado: "ignorado",
          observacao: `Falha ao criar: ${error?.message ?? "?"}`,
        })
        resumo.ignorados++
        continue
      }
      resumo.criados++
      await atribuirMatriculaSindical(String(criada.id))
      itensGravar.push({
        emp_proprietaria_id: emp,
        coletiva_id: coletivaId,
        apto_id: item.aptoId,
        filiacao_id: criada.id,
        cpf: item.cpf,
        nome_completo: item.nome,
        matricula: item.matricula,
        email: item.email,
        chave_casamento: chave,
        resultado: "criado",
        condicao_anterior: null,
      })
      await registrarProntuario(
        String(criada.id),
        "Filiado por deliberação de assembleia (filiação coletiva)."
      )
      continue
    }

    // recarimbado: já existia com outra condição
    if (resultado === "recarimbado" && filiacaoId) {
      await admin
        .from("filiacoes")
        .update({
          filiacao_condicao: CONDICAO_COLETIVA,
          filiacao_coletiva_id: coletivaId,
          filiacao_coletiva_prazo: prazo,
          filiacao_coletiva_em: hoje,
          condicao_desde: hoje,
          updated_at: new Date().toISOString(),
        })
        .eq("id", filiacaoId)
        .eq("emp_proprietaria_id", emp)
      // novo vínculo no histórico, preservando o anterior
      const { data: vinc } = await admin
        .from("filiacao_vinculos")
        .insert({
          filiado_id: filiacaoId,
          matricula: item.matricula,
          data_filiacao: hoje,
          emp_proprietaria_id: emp,
        })
        .select("id")
        .maybeSingle()
      resumo.recarimbados++
      itensGravar.push({
        emp_proprietaria_id: emp,
        coletiva_id: coletivaId,
        apto_id: item.aptoId,
        filiacao_id: filiacaoId,
        cpf: item.cpf,
        nome_completo: item.nome,
        matricula: item.matricula,
        email: item.email,
        chave_casamento: chave,
        resultado: "recarimbado",
        condicao_anterior: condicaoAtual,
        vinculo_id: vinc?.id ?? null,
      })
      await registrarProntuario(
        filiacaoId,
        `Filiação coletiva por deliberação de assembleia (condição anterior: ${condicaoAtual ?? "—"}).`
      )
    }
  }

  for (let i = 0; i < itensGravar.length; i += 300) {
    const { error } = await admin
      .from("filiacao_coletiva_itens")
      .insert(itensGravar.slice(i, i + 300))
    if (error) return { erro: `Falha ao gravar os itens: ${error.message}` }
  }

  const { error: erroProc } = await admin
    .from("filiacao_coletiva")
    .update({
      situacao: "processado",
      processado_em: new Date().toISOString(),
      prazo_ate: prazo,
      updated_at: new Date().toISOString(),
    })
    .eq("id", coletivaId)
    .eq("emp_proprietaria_id", emp)
  if (erroProc) return { erro: `Falha ao concluir: ${erroProc.message}` }
  return { resumo }
}

/** Apontamento genérico no prontuário (best-effort, não derruba o lote). */
async function registrarProntuario(
  filiacaoId: string,
  descricao: string,
  tenantId?: string
): Promise<void> {
  try {
    const admin = tenantId ? createServiceClient() : await createAdminClient()
    const agora = new Date().toISOString()
    await admin.from("filiacao_prontuario").insert({
      filiacao_id: filiacaoId,
      data: agora,
      tipo: "Filiação",
      descricao,
      diretor_funcionario_id: null,
      emp_proprietaria_id: tenantId ?? (await tenantAtual()),
      created_at: agora,
      modified_at: agora,
    })
  } catch {
    // prontuário é registro acessório
  }
}

/**
 * REVERSÃO do lote inteiro: desfaz o que o processamento fez — exclui as
 * filiações CRIADAS e devolve as RE-CARIMBADAS à condição anterior. Ação
 * destrutiva: a action exige confirmação por senha antes de chamar.
 */
export async function reverterProcesso(
  coletivaId: string,
  usuarioId: string
): Promise<{ erro?: string; revertidos?: number }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: proc } = await admin
    .from("filiacao_coletiva")
    .select("id, situacao")
    .eq("id", coletivaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (!proc) return { erro: "Processo não encontrado." }
  if (proc.situacao !== "processado") {
    return { erro: "Só um processo aplicado pode ser revertido." }
  }

  // PostgREST corta em 1.000 linhas: sem paginar, um lote grande seria
  // revertido só em parte e ainda assim marcado como "revertido".
  let itens: Record<string, unknown>[]
  try {
    itens = await lerEmLotes<Record<string, unknown>>((de, ate) =>
      admin
        .from("filiacao_coletiva_itens")
        .select("id, filiacao_id, resultado, condicao_anterior, vinculo_id")
        .eq("coletiva_id", coletivaId)
        .order("id", { ascending: true })
        .range(de, ate)
    )
  } catch (e) {
    return { erro: `Falha ao ler os itens do lote: ${(e as Error).message}` }
  }

  let revertidos = 0
  for (const i of itens) {
    const filiacaoId = i.filiacao_id as string | null
    if (!filiacaoId) continue
    if (i.resultado === "criado") {
      // criada pelo lote: marca como excluída (não apaga — preserva auditoria)
      await admin
        .from("filiacoes")
        .update({
          filiacao_excluida: true,
          filiacao_condicao: "Excluído(a) do quadro associativo",
          filiacao_coletiva_id: null,
          filiacao_coletiva_prazo: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", filiacaoId)
        .eq("emp_proprietaria_id", emp)
      revertidos++
    } else if (i.resultado === "recarimbado") {
      await admin
        .from("filiacoes")
        .update({
          filiacao_condicao: i.condicao_anterior,
          filiacao_coletiva_id: null,
          filiacao_coletiva_prazo: null,
          filiacao_coletiva_em: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", filiacaoId)
        .eq("emp_proprietaria_id", emp)
      if (i.vinculo_id) {
        await admin.from("filiacao_vinculos").delete().eq("id", i.vinculo_id)
      }
      revertidos++
    }
    await registrarProntuario(
      filiacaoId,
      "Filiação coletiva REVERTIDA pela gestão (processo desfeito)."
    )
  }

  await admin
    .from("filiacao_coletiva")
    .update({
      situacao: "revertido",
      revertido_em: new Date().toISOString(),
      revertido_por: usuarioId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", coletivaId)
    .eq("emp_proprietaria_id", emp)
  return { revertidos }
}

/**
 * MATURAÇÃO: quem passou do prazo de desistência avança na trilha coletiva
 * (Em processo de filiação coletiva → Filiação aguarda fonte = "informada à
 * fonte" → Ativo). Roda no tick diário e no botão "processar agora".
 */
/**
 * Tenants que têm alguém para maturar (condição coletiva em aberto ou já
 * informada à fonte vinda de lote). Usado pelo tick multi-tenant — service
 * role, cross-tenant por natureza.
 */
export async function tenantsComColetivaAberta(): Promise<string[]> {
  try {
    const service = createServiceClient()
    // PostgREST corta em 1.000 linhas — sem paginar, tenants além do
    // primeiro milhar de filiações nunca maturariam.
    const data = await lerEmLotes<{ emp_proprietaria_id: string | null }>(
      (de, ate) =>
        service
          .from("filiacoes")
          .select("emp_proprietaria_id")
          .not("filiacao_coletiva_id", "is", null)
          .in("filiacao_condicao", [CONDICAO_COLETIVA, "Filiação aguarda fonte"])
          .order("id", { ascending: true })
          .range(de, ate)
    )
    return [
      ...new Set(
        data
          .map((f) => f.emp_proprietaria_id as string | null)
          .filter((v): v is string => !!v)
      ),
    ]
  } catch {
    return []
  }
}

export async function maturarFiliacoesColetivas(tenantId?: string): Promise<{
  avancados: number
  ativados: number
}> {
  // tenant EXPLÍCITO + service role quando chamada pelo cron multi-tenant;
  // sem argumento, roda no tenant da requisição (botão "processar agora").
  const admin = tenantId ? createServiceClient() : await createAdminClient()
  const emp = tenantId ?? (await tenantAtual())
  const hoje = hojeSP()

  // 1) vencidos na condição de coletiva → informada à fonte
  // PostgREST corta em 1.000 linhas — lê tudo ANTES de alterar (as
  // atualizações tiram as linhas do filtro, e paginar no meio pularia gente).
  const vencidos = await lerEmLotes<{ id: string }>((de, ate) =>
    admin
      .from("filiacoes")
      .select("id, filiacao_coletiva_id")
      .eq("emp_proprietaria_id", emp)
      .eq("filiacao_condicao", CONDICAO_COLETIVA)
      .not("filiacao_coletiva_prazo", "is", null)
      .lte("filiacao_coletiva_prazo", hoje)
      .order("id", { ascending: true })
      .range(de, ate)
  ).catch(() => [] as { id: string }[])

  const proxima: FiliacaoCondicao = "Filiação aguarda fonte"
  for (const f of vencidos) {
    await admin
      .from("filiacoes")
      .update({
        filiacao_condicao: proxima,
        filiacao_informada_fonte_em: hoje,
        condicao_desde: hoje,
        updated_at: new Date().toISOString(),
      })
      .eq("id", f.id)
      .eq("emp_proprietaria_id", emp)
    await registrarProntuario(
      f.id as string,
      "Prazo de desistência encerrado — filiação informada à fonte pagadora.",
      tenantId
    )
  }

  // 2) já informados à fonte e vindos de lote coletivo → Ativo
  const prontos = await lerEmLotes<{ id: string }>((de, ate) =>
    admin
      .from("filiacoes")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("filiacao_condicao", proxima)
      .not("filiacao_coletiva_id", "is", null)
      .not("filiacao_informada_fonte_em", "is", null)
      .lt("filiacao_informada_fonte_em", hoje)
      .order("id", { ascending: true })
      .range(de, ate)
  ).catch(() => [] as { id: string }[])

  for (const f of prontos) {
    await admin
      .from("filiacoes")
      .update({
        filiacao_condicao: "Ativo",
        ativo_em: hoje,
        condicao_desde: hoje,
        updated_at: new Date().toISOString(),
      })
      .eq("id", f.id)
      .eq("emp_proprietaria_id", emp)
    await admin
      .from("filiacao_coletiva_itens")
      .update({ ativado_em: new Date().toISOString() })
      .eq("filiacao_id", f.id)
      .is("ativado_em", null)
    await registrarProntuario(
      f.id as string,
      "Filiação coletiva concluída — filiado ativo.",
      tenantId
    )
  }

  // Boas-vindas a quem ficou ativo (A58), depois da resposta. No tick não há
  // requisição do tenant: a identidade do e-mail sai do próprio tenant.
  if (prontos.length > 0) {
    depoisDaResposta(() =>
      avisarMudancasDeCondicao(
        prontos.map((f) => ({ id: String(f.id), anterior: proxima, nova: "Ativo" })),
        { client: admin, tenantId: emp, foraDaRequisicao: Boolean(tenantId) }
      )
    )
  }

  return { avancados: vencidos.length, ativados: prontos.length }
}
