import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { createAdminClient } from "@/lib/supabase/admin"
import {
  FILTROS_BOOLEANOS,
  ORDENS_CAT,
  rotuloTipoAcidente,
  variantesDoTipo,
  type FiltroBooleano,
  type OrdemCat,
} from "@/lib/saude-constantes"

/**
 * Saúde — CATs (Comunicações de Acidente de Trabalho).
 *
 * A tabela foi recriada e carregada em 20/07/2026 (supabase/saude-cat-schema.sql
 * + saude-cat-carga.sql): 13.086 registros vindos do Bubble, cobrindo
 * 2010–2025. Duas particularidades do dado migrado que este módulo carrega:
 *
 * • DUAS GERAÇÕES de qualidade. Cerca de 19% dos registros trazem o código
 *   oficial de 9 dígitos nos campos 31/32/34/45; o restante veio da geração
 *   antiga, com a descrição truncada em ~45 caracteres e sem código. Esses
 *   estão marcados com `descricao_truncada` e formam a fila de revisão.
 *   Nenhum código foi inferido na carga.
 *
 * • AFASTAMENTO vem do campo 44, não do 23. O campo 23 ("Houve
 *   afastamento?") só foi preenchido em 8 dos 13.086 registros; o campo 44
 *   ("Deverá afastar-se durante o tratamento") tem 1.819 sim e 11.189 não.
 *   Filtrar pelo 23 devolveria praticamente nada — ver FILTROS_BOOLEANOS.
 *
 * Não há ligação CAT ↔ filiado: o CPF (campo 12) veio preenchido em apenas
 * 8 registros. `filiado_id` existe e é nulo em toda a base; a ligação será
 * feita pela interface, com confirmação humana.
 *
 * A paginação e os filtros são resolvidos no PostgREST (13k linhas é muito
 * para trazer em memória a cada request).
 */

/** PGRST205/42P01 = tabela ausente; PGRST204/42703 = coluna ausente. */
function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(erro?.code ?? "")
}

const AVISO_SQL =
  "A tabela de CATs ainda não está disponível — rode supabase/saude-cat-schema.sql no SQL Editor do Supabase."

/**
 * O PostgREST corta a resposta em 1.000 linhas (db-max-rows do Supabase) e
 * um `.range()` maior NÃO vence esse teto — ele silenciosamente devolve
 * mil. Com 13.086 CATs isso zerava os indicadores e truncava a exportação,
 * então tudo que precisa da base inteira passa por aqui.
 *
 * `.order("id")` é obrigatório: sem ordem estável, lotes consecutivos podem
 * repetir e pular linhas.
 */
const LOTE = 1000
/** Teto defensivo: 100 lotes = 100 mil linhas. */
const MAX_LOTES = 100

async function buscarTodos<T>(
  colunas: string,
  aplicar?: (q: unknown) => unknown
): Promise<{ linhas: T[]; disponivel: boolean }> {
  const admin = await createAdminClient()

  type Resposta = Promise<{
    data: unknown
    error: { code?: string } | null
    count?: number | null
  }>
  const lote = (de: number, comContagem: boolean): Resposta => {
    let q: unknown = admin
      .from("saude_cat")
      .select(colunas, comContagem ? { count: "exact" } : undefined)
    if (aplicar) q = aplicar(q)
    return (
      q as {
        order: (c: string, o: { ascending: boolean }) => {
          range: (a: number, b: number) => Resposta
        }
      }
    )
      .order("id", { ascending: true })
      .range(de, de + LOTE - 1)
  }

  // O primeiro lote traz a contagem exata junto, o que permite disparar os
  // demais EM PARALELO. Em série, as 14 idas ao PostgREST necessárias para
  // 13 mil CATs custavam ~10s só para montar o painel.
  const primeiro = await lote(0, true)
  if (primeiro.error) {
    if (esquemaAusente(primeiro.error)) return { linhas: [], disponivel: false }
    throw primeiro.error
  }

  const acumulado = (primeiro.data ?? []) as T[]
  const total = primeiro.count ?? acumulado.length
  if (total <= LOTE) return { linhas: acumulado, disponivel: true }

  const restantes = Math.min(Math.ceil(total / LOTE) - 1, MAX_LOTES - 1)
  const respostas = await Promise.all(
    Array.from({ length: restantes }, (_, i) => lote((i + 1) * LOTE, false))
  )
  for (const r of respostas) {
    if (r.error) {
      if (esquemaAusente(r.error)) return { linhas: [], disponivel: false }
      throw r.error
    }
    acumulado.push(...((r.data ?? []) as T[]))
  }
  return { linhas: acumulado, disponivel: true }
}

/** Colunas da listagem — o detalhe usa select('*'). */
const COLUNAS_LISTA =
  "id,numero_cat,data_acidente,trabalhador_nome,empregador_razao_social," +
  "tipo_acidente,local_municipio,local_uf,parte_atingida,parte_atingida_codigo," +
  "cid10,afastamento_durante_tratamento,houve_internacao,houve_morte," +
  "descricao_truncada,filiado_id"

export type CatLinha = {
  id: string
  numero_cat: string | null
  data_acidente: string | null
  trabalhador_nome: string | null
  empregador_razao_social: string | null
  tipo_acidente: string | null
  local_municipio: string | null
  local_uf: string | null
  parte_atingida: string | null
  parte_atingida_codigo: string | null
  cid10: string | null
  afastamento_durante_tratamento: boolean | null
  houve_internacao: boolean | null
  houve_morte: boolean | null
  descricao_truncada: boolean | null
  filiado_id: string | null
}

export type FiltrosCat = {
  busca: string
  ano: string
  tipo: string
  uf: string
  /** Chave normalizada do município (ver `chaveMunicipio`). */
  municipio: string
  /**
   * Grafias que a chave acima cobre. O município foi gravado com variantes
   * de caixa e acento ("Macaé", "MACAE", "Macae"), então filtrar por
   * igualdade simples esconderia registros.
   */
  municipioVariantes: string[]
  revisao: string
  /** "vinculados" | "sem_vinculo" | "" (indiferente) — ligação com filiado. */
  vinculo: string
  /** Cada booleano aceita "sim" | "nao" | "" (indiferente). */
  booleanos: Partial<Record<FiltroBooleano, string>>
}

export const FILTROS_CAT_VAZIOS: FiltrosCat = {
  busca: "",
  ano: "",
  tipo: "",
  uf: "",
  municipio: "",
  municipioVariantes: [],
  revisao: "todas",
  vinculo: "",
  booleanos: {},
}

/** 'MACAE', 'Macae' e 'Macaé' colapsam na mesma chave. */
export function chaveMunicipio(nome: string): string {
  return nome
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
}

/** Aplica os filtros comuns à listagem e à exportação. */
function aplicarFiltros<T>(consulta: T, f: FiltrosCat): T {
  // O tipo do query builder do supabase-js não é nominalmente encadeável
  // aqui; o cast mantém a montagem legível sem perder o comportamento.
  let q = consulta as unknown as {
    or: (s: string) => typeof q
    in: (c: string, v: string[]) => typeof q
    eq: (c: string, v: unknown) => typeof q
    is: (c: string, v: unknown) => typeof q
    not: (c: string, op: string, v: unknown) => typeof q
    gte: (c: string, v: string) => typeof q
    lte: (c: string, v: string) => typeof q
  }

  if (f.busca) {
    // Escapa vírgula e parênteses: quebrariam a sintaxe do .or() do PostgREST.
    const t = f.busca.replace(/[,()]/g, " ").trim()
    if (t) {
      q = q.or(
        [
          `numero_cat.ilike.*${t}*`,
          `trabalhador_nome.ilike.*${t}*`,
          `empregador_razao_social.ilike.*${t}*`,
          `cid10.ilike.*${t}*`,
          `parte_atingida.ilike.*${t}*`,
          `agente_causador.ilike.*${t}*`,
          `diagnostico_provavel.ilike.*${t}*`,
          `local_acidente.ilike.*${t}*`,
          `local_especificacao.ilike.*${t}*`,
        ].join(",")
      )
    }
  }

  if (/^\d{4}$/.test(f.ano)) {
    q = q.gte("data_acidente", `${f.ano}-01-01`).lte("data_acidente", `${f.ano}-12-31`)
  }

  const variantes = f.tipo ? variantesDoTipo(f.tipo) : null
  if (variantes) q = q.in("tipo_acidente", variantes)

  if (f.uf) q = q.eq("local_uf", f.uf)
  if (f.municipioVariantes.length > 0) {
    q = q.in("local_municipio", f.municipioVariantes)
  }

  if (f.revisao === "truncadas") q = q.is("descricao_truncada", true)
  else if (f.revisao === "completas") q = q.is("descricao_truncada", false)

  if (f.vinculo === "vinculados") q = q.not("filiado_id", "is", null)
  else if (f.vinculo === "sem_vinculo") q = q.is("filiado_id", null)

  for (const [chave, valor] of Object.entries(f.booleanos)) {
    if (valor !== "sim" && valor !== "nao") continue
    const coluna = FILTROS_BOOLEANOS[chave as FiltroBooleano]?.coluna
    if (coluna) q = q.is(coluna, valor === "sim")
  }

  return q as unknown as T
}

/** Listagem paginada da CAT. `total` alimenta o rodapé de paginação. */
export async function listarCats(
  filtros: FiltrosCat,
  ordem: OrdemCat,
  direcao: "asc" | "desc",
  pagina: number,
  porPagina: number
): Promise<{ linhas: CatLinha[]; total: number; disponivel: boolean }> {
  const admin = await createAdminClient()
  const de = (pagina - 1) * porPagina

  let consulta = admin
    .from("saude_cat")
    .select(COLUNAS_LISTA, { count: "exact" })
  consulta = aplicarFiltros(consulta, filtros)

  const { data, error, count } = await consulta
    .order(ORDENS_CAT[ordem].coluna, {
      ascending: direcao === "asc",
      nullsFirst: false,
    })
    // Desempate estável: sem isso, páginas diferentes podem repetir linhas
    // quando muitas compartilham a mesma data.
    .order("id", { ascending: true })
    .range(de, de + porPagina - 1)

  if (error) {
    if (esquemaAusente(error)) return { linhas: [], total: 0, disponivel: false }
    throw error
  }
  return {
    linhas: (data ?? []) as unknown as CatLinha[],
    total: count ?? 0,
    disponivel: true,
  }
}

/**
 * Mesma consulta sem paginação, para o CSV. Passa por buscarTodos porque o
 * PostgREST cortaria a exportação em 1.000 linhas.
 *
 * A ordenação final é feita em memória: `buscarTodos` precisa ordenar por
 * `id` para paginar com segurança, e uma segunda chave de ordenação no
 * servidor não sobreviveria à junção dos lotes.
 */
export async function listarCatsParaExportar(
  filtros: FiltrosCat,
  ordem: OrdemCat,
  direcao: "asc" | "desc"
): Promise<CatLinha[]> {
  const { linhas } = await buscarTodos<CatLinha>(COLUNAS_LISTA, (q) =>
    aplicarFiltros(q, filtros)
  )

  const coluna = ORDENS_CAT[ordem].coluna as keyof CatLinha
  const sinal = direcao === "asc" ? 1 : -1
  return linhas.sort((a, b) => {
    const x = a[coluna]
    const y = b[coluna]
    // Nulos sempre por último, independentemente da direção.
    if (x == null && y == null) return 0
    if (x == null) return 1
    if (y == null) return -1
    return sinal * String(x).localeCompare(String(y), "pt-BR", { numeric: true })
  })
}

export async function buscarCat(id: string) {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_cat")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw error
  }
  return data
}

/**
 * Valores distintos para os selects de filtro. UF (15) e município (138)
 * são poucos o bastante para virar select; empregador tem 1.569 valores
 * distintos e fica na busca por texto.
 */
export type FacetaMunicipio = {
  /** Chave normalizada, usada na URL. */
  chave: string
  /** Grafia mais frequente, exibida no select. */
  rotulo: string
  /** Todas as grafias do grupo, para o `.in()` da consulta. */
  variantes: string[]
}

export type Facetas = {
  ufs: string[]
  municipios: FacetaMunicipio[]
  anos: string[]
}

/**
 * Montar os selects exige varrer a base inteira, e isso pesava ~3s em toda
 * abertura da listagem. Como a CAT só muda em carga (importação em massa),
 * um cache em memória de 10 minutos resolve — mesmo desenho de
 * `listarTodosProntuarios`. Chamar `invalidarCacheFacetas()` após importar.
 */
let cacheFacetas: { expira: number; dados: Facetas } | null = null

export function invalidarCacheFacetas() {
  cacheFacetas = null
}

export async function facetasCat(): Promise<Facetas> {
  if (cacheFacetas && cacheFacetas.expira > Date.now()) return cacheFacetas.dados

  const { linhas, disponivel } = await buscarTodos<{
    local_uf: string | null
    local_municipio: string | null
    data_acidente: string | null
  }>("local_uf,local_municipio,data_acidente")

  if (!disponivel) return { ufs: [], municipios: [], anos: [] }

  const ufs = new Set<string>()
  const anos = new Set<string>()
  // chave -> grafia -> ocorrências (a mais frequente vira o rótulo)
  const grupos = new Map<string, Map<string, number>>()

  for (const r of linhas) {
    if (r.local_uf) ufs.add(r.local_uf.toUpperCase())
    if (r.data_acidente) anos.add(r.data_acidente.slice(0, 4))
    const m = r.local_municipio?.trim()
    if (!m) continue
    const chave = chaveMunicipio(m)
    if (!chave) continue
    const grafias = grupos.get(chave) ?? new Map<string, number>()
    grafias.set(m, (grafias.get(m) ?? 0) + 1)
    grupos.set(chave, grafias)
  }

  const municipios: FacetaMunicipio[] = [...grupos.entries()].map(
    ([chave, grafias]) => {
      const ordenadas = [...grafias.entries()].sort((a, b) => b[1] - a[1])
      return {
        chave,
        rotulo: ordenadas[0][0],
        variantes: ordenadas.map(([g]) => g),
      }
    }
  )

  const dados: Facetas = {
    ufs: [...ufs].sort((a, b) => a.localeCompare(b, "pt-BR")),
    municipios: municipios.sort((a, b) =>
      a.rotulo.localeCompare(b.rotulo, "pt-BR")
    ),
    anos: [...anos].sort().reverse(),
  }
  cacheFacetas = { expira: Date.now() + 10 * 60_000, dados }
  return dados
}

/** Registro pronto para gravar — chaves são colunas de saude_cat. */
export type RegistroCat = Record<string, string | number | boolean | null>

/**
 * Números de CAT já existentes, entre os informados. A importação usa isto
 * para recusar duplicata antes de gravar qualquer linha.
 */
export async function numerosCatExistentes(
  numeros: string[]
): Promise<Set<string>> {
  const encontrados = new Set<string>()
  const limpos = [...new Set(numeros.filter(Boolean))]
  if (limpos.length === 0) return encontrados

  const admin = await createAdminClient()
  // `.in()` com milhares de valores estoura a URL — vai em fatias.
  for (let i = 0; i < limpos.length; i += 200) {
    const fatia = limpos.slice(i, i + 200)
    const { data, error } = await admin
      .from("saude_cat")
      .select("numero_cat")
      .in("numero_cat", fatia)
    if (error) {
      if (esquemaAusente(error)) return encontrados
      throw error
    }
    for (const r of (data ?? []) as { numero_cat: string | null }[]) {
      if (r.numero_cat) encontrados.add(r.numero_cat)
    }
  }
  return encontrados
}

/** Grava uma CAT. Devolve o id novo. */
export async function criarCat(
  registro: RegistroCat
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("saude_cat")
    .insert({ ...registro, emp_proprietaria_id: await tenantAtual() })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: error.message }
  }
  invalidarCacheFacetas()
  return { id: (data as { id: string }).id }
}

export async function atualizarCat(
  id: string,
  registro: RegistroCat
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("saude_cat")
    .update({ ...registro, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: error.message }
  }
  invalidarCacheFacetas()
  return {}
}

/**
 * Liga (ou desliga, com `filiadoId = null`) a CAT a um filiado. A base migrada
 * veio quase toda sem CPF, então a ligação CAT↔filiado é feita à mão, com
 * confirmação humana — casar por nome geraria falso positivo em homônimo.
 */
export async function vincularFiliadoCat(
  catId: string,
  filiadoId: string | null
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("saude_cat")
    .update({ filiado_id: filiadoId, updated_at: new Date().toISOString() })
    .eq("id", catId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL }
    return { erro: error.message }
  }
  return {}
}

/**
 * Importação em massa — tudo ou nada.
 *
 * Grava em blocos de 500 porque um insert único com milhares de linhas
 * estoura o limite de payload do PostgREST. Se um bloco falhar, os
 * anteriores são removidos pelos ids já inseridos: sem transação do lado
 * do PostgREST, essa é a forma de não deixar carga pela metade.
 */
export async function importarCats(
  registros: RegistroCat[]
): Promise<{ gravados: number; erro?: string }> {
  if (registros.length === 0) return { gravados: 0, erro: "Nada a importar." }

  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const comEmpresa = registros.map((r) => ({
    ...r,
    emp_proprietaria_id: empId,
  }))
  const inseridos: string[] = []

  for (let i = 0; i < comEmpresa.length; i += 500) {
    const bloco = comEmpresa.slice(i, i + 500)
    const { data, error } = await admin
      .from("saude_cat")
      .insert(bloco)
      .select("id")

    if (error) {
      if (inseridos.length > 0) {
        await admin.from("saude_cat").delete().in("id", inseridos)
      }
      return {
        gravados: 0,
        erro: esquemaAusente(error)
          ? AVISO_SQL
          : `Falha na linha ${i + 1} em diante: ${error.message}. Nenhum registro foi gravado.`,
      }
    }
    for (const r of (data ?? []) as { id: string }[]) inseridos.push(r.id)
  }

  invalidarCacheFacetas()
  return { gravados: inseridos.length }
}

export type ResumoSaude = {
  disponivel: boolean
  total: number
  comAfastamento: number
  comInternacao: number
  obitos: number
  aRevisar: number
  empregadores: number
  ultimoAcidente: string | null
  /** Últimos 6 anos com registro, do mais recente para o mais antigo. */
  porAno: { ano: string; total: number }[]
  topEmpregadores: { nome: string; total: number }[]
  topMunicipios: { nome: string; total: number }[]
  porTipo: { rotulo: string; total: number }[]
}

/** Indicadores macro da tela principal do módulo. */
export async function resumoSaude(): Promise<ResumoSaude> {
  const vazio: ResumoSaude = {
    disponivel: false,
    total: 0,
    comAfastamento: 0,
    comInternacao: 0,
    obitos: 0,
    aRevisar: 0,
    empregadores: 0,
    ultimoAcidente: null,
    porAno: [],
    topEmpregadores: [],
    topMunicipios: [],
    porTipo: [],
  }

  // Uma varredura das colunas de agregação, em vez de um count por
  // indicador: os top-N (empregadores, municípios, anos) precisam das
  // linhas de qualquer forma, então tudo sai da mesma leitura.
  type Linha = {
    data_acidente: string | null
    tipo_acidente: string | null
    empregador_razao_social: string | null
    local_municipio: string | null
    afastamento_durante_tratamento: boolean | null
    houve_internacao: boolean | null
    houve_morte: boolean | null
    descricao_truncada: boolean | null
  }
  const { linhas, disponivel } = await buscarTodos<Linha>(
    "data_acidente,tipo_acidente,empregador_razao_social,local_municipio," +
      "afastamento_durante_tratamento,houve_internacao,houve_morte,descricao_truncada"
  )
  if (!disponivel) return vazio

  const contar = (mapa: Map<string, number>, chave: string | null) => {
    if (!chave) return
    mapa.set(chave, (mapa.get(chave) ?? 0) + 1)
  }
  const anos = new Map<string, number>()
  const empregadores = new Map<string, number>()
  const municipios = new Map<string, number>()
  const tipos = new Map<string, number>()

  let comAfastamento = 0
  let comInternacao = 0
  let obitos = 0
  let aRevisar = 0
  let ultimoAcidente: string | null = null

  for (const r of linhas) {
    if (r.afastamento_durante_tratamento === true) comAfastamento++
    if (r.houve_internacao === true) comInternacao++
    if (r.houve_morte === true) obitos++
    if (r.descricao_truncada === true) aRevisar++
    if (r.data_acidente) {
      contar(anos, r.data_acidente.slice(0, 4))
      if (!ultimoAcidente || r.data_acidente > ultimoAcidente) {
        ultimoAcidente = r.data_acidente
      }
    }
    contar(empregadores, r.empregador_razao_social)
    contar(municipios, r.local_municipio)
    contar(tipos, r.tipo_acidente)
  }

  const top = (m: Map<string, number>, n: number) =>
    [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([nome, total]) => ({ nome, total }))

  // Agrupa as variantes de caixa/digitação do legado sob o rótulo limpo.
  const porTipo = new Map<string, number>()
  for (const [bruto, n] of tipos) {
    const rotulo = rotuloTipoAcidente(bruto) ?? bruto
    porTipo.set(rotulo, (porTipo.get(rotulo) ?? 0) + n)
  }

  return {
    disponivel: true,
    total: linhas.length,
    comAfastamento,
    comInternacao,
    obitos,
    aRevisar,
    empregadores: empregadores.size,
    ultimoAcidente,
    porAno: [...anos.entries()]
      .sort((a, b) => b[0].localeCompare(a[0]))
      .slice(0, 6)
      .map(([ano, total]) => ({ ano, total })),
    topEmpregadores: top(empregadores, 5),
    topMunicipios: top(municipios, 5),
    porTipo: [...porTipo.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([rotulo, total]) => ({ rotulo, total })),
  }
}
