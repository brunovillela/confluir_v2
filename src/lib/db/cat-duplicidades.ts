import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"
import type { CatResumo, ClassificacaoCat, TipoGrupoCat } from "@/lib/cat-classificacao"

export type { CatResumo, ClassificacaoCat, ClasseCat, TipoGrupoCat } from "@/lib/cat-classificacao"

/**
 * CAT nova, duplicada ou atualização — ver supabase/saude-cat-duplicidades.sql.
 *
 * O número da CAT do INSS tem a forma "2013.374.424-8/01": o número-base e,
 * depois da barra, a SEQUÊNCIA do mesmo acidente — /01 é a inicial; /02, /03…
 * são reabertura ou comunicação de óbito. No eSocial a CAT de reabertura/óbito
 * traz, no campo 6, o recibo da CAT de origem. Então:
 *  - mesmo número (só os dígitos)                    → DUPLICADA (já lançada);
 *  - mesmo número-base, sequência diferente          → ATUALIZAÇÃO;
 *  - campo 6 igual ao número/recibo de uma CAT       → ATUALIZAÇÃO;
 *  - mesmo acidentado e mesma data do acidente        → ATUALIZAÇÃO se muda o
 *    tipo (reabertura/óbito) ou passa a haver morte; senão POSSÍVEL duplicada.
 * O acidentado é o mesmo quando o CPF bate ou, sem CPF dos dois lados, quando o
 * nome sem acento bate. A base migrada quase não tem CPF (6 de 13 mil).
 */

/** Dados da CAT que chega (colunas de saude_cat). */
export type EntradaCat = {
  numero_cat?: string | null
  tipo_cat?: string | null
  recibo_esocial?: string | null
  trabalhador_nome?: string | null
  trabalhador_cpf?: string | null
  data_acidente?: string | null
  houve_morte?: boolean | null
  data_obito?: string | null
  cid10?: string | null
}

// ── Número da CAT ────────────────────────────────────────────────────────────

const digitos = (v: string | null | undefined) => (v ?? "").replace(/\D/g, "")

/** "2013.374.424-8/01" → base "20133744248", sequência 1; eSocial → só dígitos. */
export function partesNumeroCat(numero: string | null | undefined): {
  chave: string
  base: string | null
  sequencia: number | null
} {
  const bruto = (numero ?? "").trim()
  const m = bruto.match(/^(.*\d)\s*\/\s*(\d{1,2})$/)
  if (m) {
    const base = digitos(m[1])
    return { chave: `${base}/${Number(m[2])}`, base, sequencia: Number(m[2]) }
  }
  return { chave: digitos(bruto), base: null, sequencia: null }
}

const nomeChave = (v: string | null | undefined) => semAcento(v ?? "").replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim()

/** Tipo 2 da CAT: reabertura ou comunicação de óbito (não inicial). */
export function tipoDeAtualizacao(tipo: string | null | undefined): "reabertura" | "obito" | null {
  const t = semAcento(tipo ?? "")
  if (t.includes("obito")) return "obito"
  if (t.includes("reabert")) return "reabertura"
  return null
}

function mesmoAcidentado(a: { cpf: string | null; nome: string | null }, b: { cpf: string | null; nome: string | null }) {
  const ca = digitos(a.cpf)
  const cb = digitos(b.cpf)
  if (ca.length === 11 && cb.length === 11) return ca === cb
  const na = nomeChave(a.nome)
  return Boolean(na) && na === nomeChave(b.nome)
}

// ── Base (em cache por 10 minutos) ───────────────────────────────────────────

const COLUNAS =
  "id,numero_cat,tipo_cat,recibo_esocial,trabalhador_nome,trabalhador_cpf,data_acidente," +
  "houve_morte,data_obito,cid10,empregador_razao_social,created_at,cat_origem_id"

type Linha = {
  id: string
  numero_cat: string | null
  tipo_cat: string | null
  recibo_esocial: string | null
  trabalhador_nome: string | null
  trabalhador_cpf: string | null
  data_acidente: string | null
  houve_morte: boolean | null
  data_obito: string | null
  cid10: string | null
  empregador_razao_social: string | null
  created_at: string | null
  cat_origem_id: string | null
}

const resumo = (l: Linha): CatResumo => ({
  id: l.id,
  numero: texto(l.numero_cat),
  tipo: texto(l.tipo_cat),
  recibo: texto(l.recibo_esocial),
  nome: texto(l.trabalhador_nome),
  cpf: texto(l.trabalhador_cpf),
  dataAcidente: l.data_acidente,
  houveMorte: l.houve_morte,
  dataObito: l.data_obito,
  cid: texto(l.cid10),
  empregador: texto(l.empregador_razao_social),
  criadoEm: l.created_at,
  origemId: l.cat_origem_id,
})

const VALIDADE_CACHE_MS = 10 * 60 * 1000
let cache: { emp: string; expira: number; cats: CatResumo[]; disponivel: boolean } | null = null

export function invalidarCacheCatDuplicidades() {
  cache = null
}

/** CATs não descartadas do tenant. */
export async function catsDaBase(): Promise<{ cats: CatResumo[]; disponivel: boolean }> {
  const emp = await tenantAtual()
  if (cache && cache.emp === emp && cache.expira > Date.now()) return cache
  const admin = await createAdminClient()
  const cats: CatResumo[] = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await admin
      .from("saude_cat")
      .select(COLUNAS)
      .eq("emp_proprietaria_id", emp)
      .is("duplicada_de_id", null)
      .order("id", { ascending: true })
      .range(de, de + 999)
    if (error) {
      if (esquemaAusente(error)) return { cats: [], disponivel: false }
      throw new Error(`Falha ao ler as CATs: ${error.message}`)
    }
    cats.push(...((data ?? []) as unknown as Linha[]).map(resumo))
    if (!data || data.length < 1000) break
  }
  cache = { emp, expira: Date.now() + VALIDADE_CACHE_MS, cats, disponivel: true }
  return cache
}

// ── Classificação de uma CAT que chega ──────────────────────────────────────

/** O que muda da CAT da base para a que chega: óbito, tipo, CID. */
export function mudancasEntre(base: CatResumo, entrada: EntradaCat): string[] {
  const mudancas: string[] = []
  if (entrada.houve_morte === true && base.houveMorte !== true) {
    mudancas.push(
      `Evolução para óbito${entrada.data_obito ? ` em ${entrada.data_obito.split("-").reverse().join("/")}` : ""}`
    )
  } else if (entrada.data_obito && entrada.data_obito !== base.dataObito) {
    mudancas.push(`Data do óbito: ${entrada.data_obito.split("-").reverse().join("/")}`)
  }
  const tipo = tipoDeAtualizacao(entrada.tipo_cat)
  if (tipo && tipoDeAtualizacao(base.tipo) !== tipo) {
    mudancas.push(tipo === "obito" ? "Comunicação de óbito" : "Reabertura")
  }
  if (entrada.cid10 && base.cid && digitos(entrada.cid10) !== digitos(base.cid)) {
    mudancas.push(`CID-10: ${base.cid} → ${entrada.cid10}`)
  }
  return mudancas
}

const ordemOrigem = (a: CatResumo, b: CatResumo) =>
  (partesNumeroCat(a.numero).sequencia ?? 99) - (partesNumeroCat(b.numero).sequencia ?? 99) ||
  (a.criadoEm ?? "").localeCompare(b.criadoEm ?? "")

/**
 * A regra em si, sobre uma lista de CATs já lida. Separada de classificarCat
 * para que a carga de planilha (scripts/importar-cat-csv.mjs) classifique com
 * o mesmo critério da tela sem passar pela sessão: o script lê a base com a
 * service role.
 */
export function classificarContra(
  cats: CatResumo[],
  entrada: EntradaCat,
  opcoes: { ignorarId?: string; soNumero?: boolean } = {}
): ClassificacaoCat {
  const outras = cats.filter((c) => c.id !== opcoes.ignorarId)
  const num = partesNumeroCat(entrada.numero_cat)
  const pessoa = { cpf: entrada.trabalhador_cpf ?? null, nome: entrada.trabalhador_nome ?? null }
  const avisos: string[] = []
  const tipoAtualizacao = tipoDeAtualizacao(entrada.tipo_cat)

  // 1. Mesmo número: já lançada.
  if (num.chave) {
    const iguais = outras.filter((c) => partesNumeroCat(c.numero).chave === num.chave)
    if (iguais.length > 0) {
      if (!opcoes.soNumero && entrada.trabalhador_nome && !iguais.some((c) => mesmoAcidentado(c, pessoa))) {
        avisos.push("O acidentado da CAT da base é outro — confira se o número foi digitado certo.")
      }
      return {
        classe: "duplicada",
        motivo: `Já existe CAT com o número ${iguais[0].numero}.`,
        relacionadas: iguais,
        origemId: null,
        mudancas: opcoes.soNumero ? [] : mudancasEntre(iguais[0], entrada),
        avisos,
      }
    }
  }

  // 2. Mesmo número-base, outra sequência: reabertura/óbito do mesmo acidente.
  if (num.base) {
    const mesmoAcidente = outras
      .filter((c) => partesNumeroCat(c.numero).base === num.base)
      .sort(ordemOrigem)
    if (mesmoAcidente.length > 0) {
      const origem = mesmoAcidente[0]
      if (!opcoes.soNumero && entrada.trabalhador_nome && !mesmoAcidente.some((c) => mesmoAcidentado(c, pessoa))) {
        avisos.push("O acidentado da CAT de origem é outro — confira o número antes de gravar.")
      }
      return {
        classe: "atualizacao",
        motivo: `Mesmo acidente da CAT ${origem.numero} (sequência /${String(num.sequencia).padStart(2, "0")}).`,
        relacionadas: mesmoAcidente,
        origemId: origem.id,
        mudancas: opcoes.soNumero ? [] : mudancasEntre(origem, entrada),
        avisos,
      }
    }
  }
  if (opcoes.soNumero) {
    return { classe: "nova", motivo: "Número não encontrado na base.", relacionadas: [], origemId: null, mudancas: [], avisos }
  }

  // 3. Campo 6 (recibo da CAT de origem) aponta para uma CAT da base.
  const recibo = digitos(entrada.recibo_esocial)
  if (recibo.length >= 6) {
    const origem = outras.filter((c) => digitos(c.numero) === recibo || digitos(c.recibo) === recibo).sort(ordemOrigem)
    if (origem.length > 0) {
      return {
        classe: "atualizacao",
        motivo: `O campo 6 (CAT de origem) aponta para a CAT ${origem[0].numero ?? "sem número"}.`,
        relacionadas: origem,
        origemId: origem[0].id,
        mudancas: mudancasEntre(origem[0], entrada),
        avisos,
      }
    }
  }

  // 4. Mesmo acidentado, mesma data do acidente.
  if (entrada.data_acidente && (entrada.trabalhador_nome || entrada.trabalhador_cpf)) {
    const mesmoDia = outras
      .filter((c) => c.dataAcidente === entrada.data_acidente && mesmoAcidentado(c, pessoa))
      .sort(ordemOrigem)
    if (mesmoDia.length > 0) {
      const mudancas = mudancasEntre(mesmoDia[0], entrada)
      const atualiza = Boolean(tipoAtualizacao) || mudancas.some((m) => m.startsWith("Evolução para óbito"))
      return {
        classe: atualiza ? "atualizacao" : "possivel_duplicada",
        motivo: atualiza
          ? `Mesmo acidentado e mesma data do acidente da CAT ${mesmoDia[0].numero ?? "sem número"}.`
          : `Já há CAT do mesmo acidentado com a mesma data do acidente (${mesmoDia[0].numero ?? "sem número"}).`,
        relacionadas: mesmoDia,
        origemId: atualiza ? mesmoDia[0].id : null,
        mudancas,
        avisos,
      }
    }
  }

  if (tipoAtualizacao) {
    avisos.push(
      `É uma CAT de ${tipoAtualizacao === "obito" ? "comunicação de óbito" : "reabertura"}, mas a CAT de origem não está na base.`
    )
  }
  return { classe: "nova", motivo: "Nenhuma CAT parecida na base.", relacionadas: [], origemId: null, mudancas: [], avisos }
}

export async function classificarCat(
  entrada: EntradaCat,
  opcoes: { ignorarId?: string; soNumero?: boolean } = {}
): Promise<ClassificacaoCat & { disponivel: boolean }> {
  const { cats, disponivel } = await catsDaBase()
  return { ...classificarContra(cats, entrada, opcoes), disponivel }
}

// ── Sub-área: grupos para tratar ─────────────────────────────────────────────

export type GrupoCat = {
  tipo: TipoGrupoCat
  chave: string
  cats: CatResumo[]
  /** Acidentados diferentes no grupo: provável número digitado errado. */
  pessoasDiferentes: boolean
  /** Alguma CAT do grupo com morte (evolução para óbito). */
  comObito: boolean
}

export type GruposCat = {
  disponivel: boolean
  grupos: GrupoCat[]
  totais: Record<TipoGrupoCat, number>
  geradoEm: string
}

async function ignorados(): Promise<Set<string>> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_cat_duplicidades_ignoradas")
    .select("tipo, chave")
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return new Set()
  return new Set((data ?? []).map((r) => `${r.tipo}:${r.chave}`))
}

export async function listarGruposCat(): Promise<GruposCat> {
  const { cats, disponivel } = await catsDaBase()
  const pulados = await ignorados()
  const grupos: GrupoCat[] = []
  const agrupar = (lista: CatResumo[], chave: (c: CatResumo) => string | null) => {
    const m = new Map<string, CatResumo[]>()
    for (const c of lista) {
      const k = chave(c)
      if (!k) continue
      const l = m.get(k) ?? []
      l.push(c)
      m.set(k, l)
    }
    return [...m.entries()].filter(([, l]) => l.length > 1)
  }
  const montar = (tipo: TipoGrupoCat, chave: string, lista: CatResumo[]) => {
    if (pulados.has(`${tipo}:${chave}`)) return
    const ordenadas = [...lista].sort(ordemOrigem)
    grupos.push({
      tipo,
      chave,
      cats: ordenadas,
      pessoasDiferentes: ordenadas.some((c) => !mesmoAcidentado(c, ordenadas[0])),
      comObito: ordenadas.some((c) => c.houveMorte === true),
    })
  }

  // Mesmo número completo.
  const emNumero = new Set<string>()
  for (const [chave, lista] of agrupar(cats, (c) => partesNumeroCat(c.numero).chave || null)) {
    montar("numero", chave, lista)
    lista.forEach((c) => emNumero.add(c.id))
  }

  // Mesmo número-base, sequências diferentes, ainda sem cat_origem_id ligando.
  const emAtualizacao = new Set<string>()
  for (const [chave, lista] of agrupar(cats, (c) => partesNumeroCat(c.numero).base)) {
    const sequencias = new Set(lista.map((c) => partesNumeroCat(c.numero).sequencia))
    if (sequencias.size < 2) continue
    const origem = [...lista].sort(ordemOrigem)[0]
    const soltas = lista.filter((c) => c.id !== origem.id && c.origemId !== origem.id)
    lista.forEach((c) => emAtualizacao.add(c.id))
    if (soltas.length === 0) continue
    montar("atualizacao", chave, lista)
  }

  // Mesmo acidentado e mesma data, números diferentes, fora dos grupos acima.
  const ligadas = new Set(cats.filter((c) => c.origemId).flatMap((c) => [c.id, c.origemId as string]))
  for (const [chave, lista] of agrupar(cats, (c) =>
    c.dataAcidente && nomeChave(c.nome) ? `${nomeChave(c.nome)}|${c.dataAcidente}` : null
  )) {
    const restantes = lista.filter((c) => !emNumero.has(c.id) && !emAtualizacao.has(c.id))
    if (restantes.length < 2) continue
    if (restantes.every((c) => ligadas.has(c.id))) continue
    montar("acidente", chave, restantes)
  }

  const totais: Record<TipoGrupoCat, number> = { numero: 0, atualizacao: 0, acidente: 0 }
  for (const g of grupos) totais[g.tipo]++
  const peso: Record<TipoGrupoCat, number> = { numero: 0, atualizacao: 1, acidente: 2 }
  grupos.sort((a, b) => peso[a.tipo] - peso[b.tipo] || (b.cats[0].dataAcidente ?? "").localeCompare(a.cats[0].dataAcidente ?? ""))
  return { disponivel, grupos, totais, geradoEm: new Date().toISOString() }
}

// ── Ações ───────────────────────────────────────────────────────────────────

/** Liga as CATs de atualização à CAT de origem (cat_origem_id). */
export async function vincularAtualizacoes(origemId: string, atualizacoes: string[]): Promise<{ erro?: string }> {
  const alvos = atualizacoes.filter((id) => id !== origemId)
  if (alvos.length === 0) return { erro: "Escolha a CAT de origem e ao menos uma atualização." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { error } = await admin
    .from("saude_cat")
    .update({ cat_origem_id: origemId, updated_at: new Date().toISOString() })
    .in("id", alvos)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: error.message }
  // A de origem não aponta para ninguém.
  await admin.from("saude_cat").update({ cat_origem_id: null }).eq("id", origemId).eq("emp_proprietaria_id", emp)
  invalidarCacheCatDuplicidades()
  return {}
}

/**
 * Descarta cópias de uma CAT repetida: ficam apontando para a que fica
 * (duplicada_de_id) e saem das listas. Nada é apagado — dá para desfazer.
 */
export async function descartarCopias(
  manterId: string,
  copias: string[],
  usuarioId: string
): Promise<{ erro?: string }> {
  const alvos = copias.filter((id) => id !== manterId)
  if (alvos.length === 0) return { erro: "Escolha a CAT que fica e ao menos uma cópia." }
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const agora = new Date().toISOString()
  const { error } = await admin
    .from("saude_cat")
    .update({ duplicada_de_id: manterId, descartada_em: agora, descartada_por: usuarioId, updated_at: agora })
    .in("id", alvos)
    .eq("emp_proprietaria_id", emp)
  if (error) return { erro: error.message }
  // Atualizações que apontavam para uma cópia passam a apontar para a que fica.
  await admin.from("saude_cat").update({ cat_origem_id: manterId }).in("cat_origem_id", alvos).eq("emp_proprietaria_id", emp)
  invalidarCacheCatDuplicidades()
  return {}
}

/** Desfaz o descarte: a cópia volta às listas. */
export async function restaurarCopia(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("saude_cat")
    .update({ duplicada_de_id: null, descartada_em: null, descartada_por: null, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: error.message }
  invalidarCacheCatDuplicidades()
  return {}
}

export async function ignorarGrupoCat(dados: {
  tipo: TipoGrupoCat
  chave: string
  cats: string[]
  motivo: string | null
  usuarioId: string
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin.from("saude_cat_duplicidades_ignoradas").upsert(
    {
      emp_proprietaria_id: await tenantAtual(),
      tipo: dados.tipo,
      chave: dados.chave,
      cats: dados.cats,
      motivo: dados.motivo,
      criado_por: dados.usuarioId,
    },
    { onConflict: "emp_proprietaria_id,tipo,chave" }
  )
  if (error) return { erro: esquemaAusente(error) ? "Rode supabase/saude-cat-duplicidades.sql." : error.message }
  return {}
}

/** Origem e atualizações ligadas a uma CAT, para a página dela. */
export async function relacoesDaCat(
  id: string,
  origemId: string | null
): Promise<{ origem: CatResumo | null; atualizacoes: CatResumo[]; copias: CatResumo[] }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [origem, atualizacoes, copias] = await Promise.all([
    origemId
      ? admin.from("saude_cat").select(COLUNAS).eq("id", origemId).eq("emp_proprietaria_id", emp).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("saude_cat").select(COLUNAS).eq("cat_origem_id", id).eq("emp_proprietaria_id", emp),
    admin.from("saude_cat").select(COLUNAS).eq("duplicada_de_id", id).eq("emp_proprietaria_id", emp),
  ])
  return {
    origem: origem.data ? resumo(origem.data as unknown as Linha) : null,
    atualizacoes: ((atualizacoes.data ?? []) as unknown as Linha[]).map(resumo).sort(ordemOrigem),
    copias: ((copias.data ?? []) as unknown as Linha[]).map(resumo),
  }
}
