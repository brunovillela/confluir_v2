import "server-only"
import { tenantAtual } from "@/lib/tenant"

import { hojeSP } from "@/lib/db/compras"
import { AVISO_SQL_PATRIMONIO, type SituacaoItem } from "@/lib/patrimonio-constantes"
import { createAdminClient } from "@/lib/supabase/admin"

/**
 * Patrimônio — itens, recintos, notas fiscais e cautelas (mapeado do Bubble,
 * supabase/patrimonio.sql). Modelo:
 * • `patrimonio_recinto` é o local; `patrimonio_item` é o bem (aponta para
 *   recinto + NF de entrada/saída + detentor atual da cautela).
 * • `patrimonio_item_responsavel` é a CAUTELA (histórico de guarda temporária,
 *   com início/término); em aberto = sem término.
 *
 * As tabelas `patrimonio_recinto` e `patrimonio_nota_fiscal` vieram VAZIAS da
 * migração; as 3 restantes foram criadas pelo SQL. As leituras degradam com
 * `disponivel: false` quando o esquema ainda não rodou. Tudo é escopado por
 * `emp_proprietaria_id` (RLS do tenant).
 */

/** PGRST205/42P01 = tabela ausente; PGRST204/42703 = coluna ausente. */
function esquemaAusente(erro: { code?: string } | null): boolean {
  return ["PGRST205", "42P01", "PGRST204", "42703"].includes(erro?.code ?? "")
}

const BUCKET = "patrimonio"

/**
 * Resolve o caminho de um arquivo para URL exibível. Caminhos do bucket
 * privado viram URL assinada (1h); URLs legadas do Bubble (CDN, `//host/…`)
 * passam direto.
 */
export async function urlArquivoPatrimonio(
  caminho: string | null
): Promise<string | null> {
  if (!caminho) return null
  if (/^(https?:)?\/\//.test(caminho)) {
    return caminho.startsWith("//") ? `https:${caminho}` : caminho
  }
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(caminho, 3600)
  return data?.signedUrl ?? null
}

/** Sobe um arquivo no bucket privado e retorna o caminho gravável. */
async function subirArquivo(
  prefixo: string,
  id: string,
  arquivo: File
): Promise<{ caminho?: string; erro?: string }> {
  const admin = await createAdminClient()
  const caminho = `${prefixo}/${id}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, "_")}`
  const { error } = await admin.storage
    .from(BUCKET)
    .upload(caminho, arquivo, {
      contentType: arquivo.type || "application/octet-stream",
      upsert: false,
    })
  if (error) return { erro: `Falha no upload: ${error.message}` }
  return { caminho }
}

function texto(v: unknown): string | null {
  return typeof v === "string" && v.trim() !== "" ? v : null
}

async function nomesDosUsuarios(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra")
    .in("id", unicos)
  for (const u of data ?? []) {
    const nome = [u.nome_completo, u.nome_guerra].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(u.id, nome)
  }
  return nomes
}

// ── Resumo (KPIs do hub) ─────────────────────────────────────────────────────

export type ResumoPatrimonio = {
  disponivel: boolean
  totalItens: number
  ativos: number
  emCautela: number
  recintos: number
  notas: number
}

export async function resumoPatrimonio(): Promise<ResumoPatrimonio> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const itens = await admin
    .from("patrimonio_item")
    .select("id, ativo, responsavel_cautela_id", { count: "exact", head: false })
    .eq("emp_proprietaria_id", emp)
  if (itens.error) {
    if (esquemaAusente(itens.error)) {
      return {
        disponivel: false,
        totalItens: 0,
        ativos: 0,
        emCautela: 0,
        recintos: 0,
        notas: 0,
      }
    }
    throw new Error(`Falha no resumo de patrimônio: ${itens.error.message}`)
  }
  const linhas = (itens.data ?? []) as Record<string, unknown>[]

  const [recintos, notas] = await Promise.all([
    admin
      .from("patrimonio_recinto")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp),
    admin
      .from("patrimonio_nota_fiscal")
      .select("id", { count: "exact", head: true })
      .eq("emp_proprietaria_id", emp),
  ])

  return {
    disponivel: true,
    totalItens: linhas.length,
    ativos: linhas.filter((i) => i.ativo === true).length,
    emCautela: linhas.filter((i) => texto(i.responsavel_cautela_id)).length,
    recintos: recintos.count ?? 0,
    notas: notas.count ?? 0,
  }
}

// ── Itens ────────────────────────────────────────────────────────────────────

export type ItemLinha = {
  id: string
  nome: string | null
  numero_patrimonio: string | null
  descricao: string | null
  ativo: boolean
  recintoNome: string | null
  emCautela: boolean
  responsavelNome: string | null
}

export type FiltrosItens = {
  busca?: string
  situacao?: SituacaoItem
}

/** Mapa id → nome do recinto, do tenant (para juntar nas listagens). */
async function nomesDosRecintos(): Promise<Map<string, string>> {
  const admin = await createAdminClient()
  const { data } = await admin
    .from("patrimonio_recinto")
    .select("id, nome_recinto")
    .eq("emp_proprietaria_id", await tenantAtual())
  const mapa = new Map<string, string>()
  for (const r of (data ?? []) as Record<string, unknown>[]) {
    const nome = texto(r.nome_recinto)
    if (nome) mapa.set(String(r.id), nome)
  }
  return mapa
}

export async function listarItens(
  filtros: FiltrosItens = {}
): Promise<ItemLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const situacao = filtros.situacao ?? "ativos"
  const busca = (filtros.busca ?? "").trim().replace(/[,()]/g, " ").trim()

  // Lotes de 1000 (fura o teto do PostgREST) — completo p/ hub e exportação.
  const brutos: Record<string, unknown>[] = []
  const LOTE = 1000
  for (let de = 0; ; de += LOTE) {
    let q = admin
      .from("patrimonio_item")
      .select("*")
      .eq("emp_proprietaria_id", emp)
    if (situacao === "ativos") q = q.eq("ativo", true)
    if (situacao === "inativos") q = q.eq("ativo", false)
    if (busca) {
      q = q.or(
        `nome.ilike.%${busca}%,numero_patrimonio.ilike.%${busca}%,descricao.ilike.%${busca}%`
      )
    }
    const { data, error } = await q
      .order("ativo", { ascending: false })
      .order("nome", { ascending: true })
      .order("id", { ascending: true })
      .range(de, de + LOTE - 1)
    if (error) {
      if (esquemaAusente(error)) return []
      throw new Error(`Falha ao listar itens: ${error.message}`)
    }
    brutos.push(...((data ?? []) as Record<string, unknown>[]))
    if (!data || data.length < LOTE) break
  }

  const [recintos, nomes] = await Promise.all([
    nomesDosRecintos(),
    nomesDosUsuarios(
      brutos.map((i) => String(i.responsavel_cautela_id ?? "")).filter(Boolean)
    ),
  ])

  return brutos.map((i) => ({
    id: String(i.id),
    nome: texto(i.nome),
    numero_patrimonio: texto(i.numero_patrimonio),
    descricao: texto(i.descricao),
    ativo: i.ativo === true,
    recintoNome: i.recinto_id
      ? (recintos.get(String(i.recinto_id)) ?? null)
      : null,
    emCautela: Boolean(texto(i.responsavel_cautela_id)),
    responsavelNome: i.responsavel_cautela_id
      ? (nomes.get(String(i.responsavel_cautela_id)) ?? null)
      : null,
  }))
}

export type ItemDetalhe = ItemLinha & {
  numero_patrimonio_antigo: string | null
  numero_unico: string | null
  recinto_id: string | null
  legado: boolean
}

export async function buscarItem(id: string): Promise<ItemDetalhe | null> {
  const admin = await createAdminClient()
  const { data: i, error } = await admin
    .from("patrimonio_item")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar o item: ${error.message}`)
  }
  if (!i) return null

  const recintos = await nomesDosRecintos()
  const nomes = await nomesDosUsuarios(
    [String(i.responsavel_cautela_id ?? "")].filter(Boolean)
  )

  return {
    id: String(i.id),
    nome: texto(i.nome),
    numero_patrimonio: texto(i.numero_patrimonio),
    numero_patrimonio_antigo: texto(i.numero_patrimonio_antigo),
    numero_unico: texto(i.numero_unico),
    descricao: texto(i.descricao),
    ativo: i.ativo === true,
    recinto_id: texto(i.recinto_id),
    recintoNome: i.recinto_id
      ? (recintos.get(String(i.recinto_id)) ?? null)
      : null,
    emCautela: Boolean(texto(i.responsavel_cautela_id)),
    responsavelNome: i.responsavel_cautela_id
      ? (nomes.get(String(i.responsavel_cautela_id)) ?? null)
      : null,
    legado: Boolean(i.bubble_id),
  }
}

export type DadosItem = {
  nome: string
  descricao: string | null
  numero_patrimonio: string | null
  numero_patrimonio_antigo: string | null
  numero_unico: string | null
  recinto_id: string | null
}

export async function criarItem(
  dados: DadosItem
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("patrimonio_item")
    .insert({
      nome: dados.nome,
      descricao: dados.descricao,
      numero_patrimonio: dados.numero_patrimonio,
      numero_patrimonio_antigo: dados.numero_patrimonio_antigo,
      numero_unico: dados.numero_unico,
      recinto_id: dados.recinto_id,
      ativo: true,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível cadastrar o item: ${error.message}` }
  }
  return { id: data.id }
}

export async function atualizarItem(
  id: string,
  dados: Partial<DadosItem> & { ativo?: boolean }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const mudancas: Record<string, unknown> = {}
  if (dados.nome !== undefined) mudancas.nome = dados.nome
  if (dados.descricao !== undefined) mudancas.descricao = dados.descricao
  if (dados.numero_patrimonio !== undefined)
    mudancas.numero_patrimonio = dados.numero_patrimonio
  if (dados.numero_patrimonio_antigo !== undefined)
    mudancas.numero_patrimonio_antigo = dados.numero_patrimonio_antigo
  if (dados.numero_unico !== undefined) mudancas.numero_unico = dados.numero_unico
  if (dados.recinto_id !== undefined) mudancas.recinto_id = dados.recinto_id
  if (dados.ativo !== undefined) mudancas.ativo = dados.ativo

  const { data, error } = await admin
    .from("patrimonio_item")
    .update(mudancas)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  if ((data ?? []).length === 0) return { erro: "Item não encontrado." }
  return {}
}

// ── Cautelas (histórico de guarda do item) ──────────────────────────────────

export type CautelaLinha = {
  id: string
  responsavelNome: string | null
  inicio: string | null
  termino: string | null
  aberta: boolean
  arquivoUrl: string | null
}

export async function listarCautelas(itemId: string): Promise<CautelaLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("patrimonio_item_responsavel")
    .select("*")
    .eq("item_id", itemId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("inicio", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar cautelas: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(
    brutos.map((c) => String(c.responsavel_id ?? "")).filter(Boolean)
  )
  return Promise.all(
    brutos.map(async (c) => ({
      id: String(c.id),
      responsavelNome: c.responsavel_id
        ? (nomes.get(String(c.responsavel_id)) ?? null)
        : null,
      inicio: texto(c.inicio),
      termino: texto(c.termino),
      aberta: !texto(c.termino),
      arquivoUrl: await urlArquivoPatrimonio(texto(c.arquivo_cautela)),
    }))
  )
}

export type OpcaoUsuario = { id: string; nome: string }

/** Usuários do sistema (com permissão) para o seletor de responsável pela cautela. */
export async function listarUsuariosParaCautela(): Promise<OpcaoUsuario[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin.from("permissoes").select("usuario_id")
  if (error) return []
  const ids = [
    ...new Set(
      ((data ?? []) as Record<string, unknown>[])
        .map((p) => String(p.usuario_id ?? ""))
        .filter(Boolean)
    ),
  ]
  if (ids.length === 0) return []
  const { data: usuarios } = await admin
    .from("usuarios")
    .select("id, nome_completo, nome_guerra, inativo, deletado")
    .in("id", ids)
  return ((usuarios ?? []) as Record<string, unknown>[])
    .filter((u) => u.inativo !== true && u.deletado !== true)
    .map((u) => ({
      id: String(u.id),
      nome:
        [u.nome_completo, u.nome_guerra].find(
          (v): v is string => typeof v === "string" && v.trim() !== ""
        ) ?? "(sem nome)",
    }))
    .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/**
 * Registra uma cautela (guarda temporária) do item a um responsável. Guarda:
 * o item não pode já estar sob cautela em aberto. Além de inserir o histórico,
 * grava o detentor atual em `patrimonio_item.responsavel_cautela_id`.
 */
export async function registrarCautela(dados: {
  itemId: string
  responsavelId: string
  inicio: string | null
}): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: item, error: eItem } = await admin
    .from("patrimonio_item")
    .select("id, responsavel_cautela_id")
    .eq("id", dados.itemId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (eItem) {
    if (esquemaAusente(eItem)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível registrar a cautela: ${eItem.message}` }
  }
  if (!item) return { erro: "Item não encontrado." }
  if (texto(item.responsavel_cautela_id)) {
    return {
      erro: "Este item já está sob cautela. Encerre a cautela atual antes de registrar outra.",
    }
  }

  const inicio = dados.inicio ?? hojeSP()
  const { data: nova, error } = await admin
    .from("patrimonio_item_responsavel")
    .insert({
      item_id: dados.itemId,
      responsavel_id: dados.responsavelId,
      inicio,
      emp_proprietaria_id: emp,
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível registrar a cautela: ${error.message}` }
  }

  const { error: eUp } = await admin
    .from("patrimonio_item")
    .update({ responsavel_cautela_id: dados.responsavelId })
    .eq("id", dados.itemId)
    .eq("emp_proprietaria_id", emp)
  if (eUp) return { erro: `Cautela registrada, mas falhou ao marcar o detentor: ${eUp.message}` }
  return { id: nova.id }
}

/** Anexa (ou substitui) o arquivo da cautela no bucket privado. */
export async function gravarArquivoCautela(
  cautelaId: string,
  arquivo: File
): Promise<{ erro?: string }> {
  const { caminho, erro } = await subirArquivo("cautela", cautelaId, arquivo)
  if (erro) return { erro }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("patrimonio_item_responsavel")
    .update({ arquivo_cautela: caminho })
    .eq("id", cautelaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Arquivo enviado, mas falhou ao vincular: ${error.message}` }
  return {}
}

/** Encerra a cautela (data de término) e limpa o detentor atual do item. */
export async function encerrarCautela(dados: {
  cautelaId: string
  termino: string | null
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: c, error } = await admin
    .from("patrimonio_item_responsavel")
    .select("id, item_id, termino")
    .eq("id", dados.cautelaId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível encerrar a cautela: ${error.message}` }
  }
  if (!c) return { erro: "Cautela não encontrada." }
  if (texto(c.termino)) return { erro: "Esta cautela já foi encerrada." }

  const termino = dados.termino ?? hojeSP()
  const { error: eUp } = await admin
    .from("patrimonio_item_responsavel")
    .update({ termino })
    .eq("id", dados.cautelaId)
    .eq("emp_proprietaria_id", emp)
  if (eUp) {
    if (esquemaAusente(eUp)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível encerrar a cautela: ${eUp.message}` }
  }

  await admin
    .from("patrimonio_item")
    .update({ responsavel_cautela_id: null })
    .eq("id", String(c.item_id))
    .eq("emp_proprietaria_id", emp)
  return {}
}

// ── Recintos ─────────────────────────────────────────────────────────────────

export type RecintoLinha = {
  id: string
  nome: string | null
  codigo: string | null
  descricao_fisica: string | null
  sede: string | null
  totalItens: number
}

export async function listarRecintos(): Promise<RecintoLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("patrimonio_recinto")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .order("nome_recinto", { ascending: true })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar recintos: ${error.message}`)
  }
  const recintos = (data ?? []) as Record<string, unknown>[]

  // Contagem de itens por recinto (uma leitura só).
  const { data: itens } = await admin
    .from("patrimonio_item")
    .select("recinto_id")
    .eq("emp_proprietaria_id", emp)
  const contagem = new Map<string, number>()
  for (const it of (itens ?? []) as Record<string, unknown>[]) {
    const rid = texto(it.recinto_id)
    if (rid) contagem.set(rid, (contagem.get(rid) ?? 0) + 1)
  }

  return recintos.map((r) => ({
    id: String(r.id),
    nome: texto(r.nome_recinto),
    codigo: texto(r.codigo),
    descricao_fisica: texto(r.descricao_fisica),
    sede: texto(r.sede),
    totalItens: contagem.get(String(r.id)) ?? 0,
  }))
}

/** Opções de recinto para o dropdown do formulário de item. */
export async function listarRecintosOpcoes(): Promise<
  { id: string; rotulo: string }[]
> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("patrimonio_recinto")
    .select("id, nome_recinto, codigo")
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("nome_recinto", { ascending: true })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: String(r.id),
    rotulo:
      texto(r.nome_recinto) ??
      texto(r.codigo) ??
      "(recinto sem nome)",
  }))
}

export type RecintoDetalhe = {
  id: string
  nome: string | null
  codigo: string | null
  descricao_fisica: string | null
  sede: string | null
  legado: boolean
}

export async function buscarRecinto(id: string): Promise<RecintoDetalhe | null> {
  const admin = await createAdminClient()
  const { data: r, error } = await admin
    .from("patrimonio_recinto")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar o recinto: ${error.message}`)
  }
  if (!r) return null
  return {
    id: String(r.id),
    nome: texto(r.nome_recinto),
    codigo: texto(r.codigo),
    descricao_fisica: texto(r.descricao_fisica),
    sede: texto(r.sede),
    legado: Boolean(r.bubble_id),
  }
}

export type DadosRecinto = {
  nome: string
  codigo: string | null
  descricao_fisica: string | null
  sede: string | null
}

export async function criarRecinto(
  dados: DadosRecinto
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("patrimonio_recinto")
    .insert({
      nome_recinto: dados.nome,
      codigo: dados.codigo,
      descricao_fisica: dados.descricao_fisica,
      sede: dados.sede,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível cadastrar o recinto: ${error.message}` }
  }
  return { id: data.id }
}

export async function atualizarRecinto(
  id: string,
  dados: Partial<DadosRecinto>
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const mudancas: Record<string, unknown> = {}
  if (dados.nome !== undefined) mudancas.nome_recinto = dados.nome
  if (dados.codigo !== undefined) mudancas.codigo = dados.codigo
  if (dados.descricao_fisica !== undefined)
    mudancas.descricao_fisica = dados.descricao_fisica
  if (dados.sede !== undefined) mudancas.sede = dados.sede

  const { data, error } = await admin
    .from("patrimonio_recinto")
    .update(mudancas)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  if ((data ?? []).length === 0) return { erro: "Recinto não encontrado." }
  return {}
}

/** Itens alocados no recinto (para a página de detalhe). */
export async function listarItensDoRecinto(
  recintoId: string
): Promise<{ id: string; nome: string | null; numero_patrimonio: string | null; ativo: boolean }[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("patrimonio_item")
    .select("id, nome, numero_patrimonio, ativo")
    .eq("recinto_id", recintoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("ativo", { ascending: false })
    .order("nome", { ascending: true })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((i) => ({
    id: String(i.id),
    nome: texto(i.nome),
    numero_patrimonio: texto(i.numero_patrimonio),
    ativo: i.ativo === true,
  }))
}

export type ResponsavelRecintoLinha = {
  id: string
  funcionarioNome: string | null
  inicio: string | null
  termino: string | null
  atual: boolean
}

export async function listarResponsaveisRecinto(
  recintoId: string
): Promise<ResponsavelRecintoLinha[]> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("patrimonio_recinto_responsavel")
    .select("*")
    .eq("recinto_id", recintoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .order("atual", { ascending: false })
    .order("inicio", { ascending: false })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar responsáveis: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]
  const nomes = await nomesDosUsuarios(
    brutos.map((r) => String(r.funcionario_id ?? "")).filter(Boolean)
  )
  return brutos.map((r) => ({
    id: String(r.id),
    funcionarioNome: r.funcionario_id
      ? (nomes.get(String(r.funcionario_id)) ?? null)
      : null,
    inicio: texto(r.inicio),
    termino: texto(r.termino),
    atual: r.atual === true,
  }))
}

/**
 * Define o responsável ATUAL de um recinto: encerra o responsável atual
 * vigente (atual=false + término hoje se em aberto) e insere o novo (atual=true).
 */
export async function definirResponsavelRecinto(dados: {
  recintoId: string
  funcionarioId: string
  inicio: string | null
}): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: rec, error: eRec } = await admin
    .from("patrimonio_recinto")
    .select("id")
    .eq("id", dados.recintoId)
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (eRec) {
    if (esquemaAusente(eRec)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível definir o responsável: ${eRec.message}` }
  }
  if (!rec) return { erro: "Recinto não encontrado." }

  const inicio = dados.inicio ?? hojeSP()
  // Encerra os responsáveis "atuais" vigentes.
  const { error: eEnc } = await admin
    .from("patrimonio_recinto_responsavel")
    .update({ atual: false, termino: inicio })
    .eq("recinto_id", dados.recintoId)
    .eq("emp_proprietaria_id", emp)
    .eq("atual", true)
  if (eEnc) return { erro: `Não foi possível encerrar o responsável anterior: ${eEnc.message}` }

  const { error } = await admin.from("patrimonio_recinto_responsavel").insert({
    recinto_id: dados.recintoId,
    funcionario_id: dados.funcionarioId,
    inicio,
    atual: true,
    emp_proprietaria_id: emp,
  })
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível definir o responsável: ${error.message}` }
  }
  return {}
}

// ── Notas fiscais ────────────────────────────────────────────────────────────

/** Mapa id → nome de empresa (fornecedor), para juntar nas notas. */
async function nomesDasEmpresas(ids: string[]): Promise<Map<string, string>> {
  const nomes = new Map<string, string>()
  const unicos = [...new Set(ids.filter(Boolean))]
  if (unicos.length === 0) return nomes
  const admin = await createAdminClient()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao")
    .in("id", unicos)
  for (const e of (data ?? []) as Record<string, unknown>[]) {
    const nome = [e.nome_fantasia, e.nome_razao].find(
      (v): v is string => typeof v === "string" && v.trim() !== ""
    )
    if (nome) nomes.set(String(e.id), nome)
  }
  return nomes
}

export type NotaLinha = {
  id: string
  numero_nota: string | null
  entrada: boolean | null
  data_emissao: string | null
  fornecedorNome: string | null
  totalItens: number
}

export async function listarNotas(): Promise<NotaLinha[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("patrimonio_nota_fiscal")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .order("data_emissao", { ascending: false, nullsFirst: false })
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar notas fiscais: ${error.message}`)
  }
  const brutos = (data ?? []) as Record<string, unknown>[]

  const nomes = await nomesDasEmpresas(
    brutos.map((n) => String(n.fornecedor_id ?? "")).filter(Boolean)
  )
  // Contagem de itens por NF (entrada ou saída) — uma leitura só.
  const { data: itens } = await admin
    .from("patrimonio_item")
    .select("nota_fiscal_entrada_id, nota_fiscal_saida_id")
    .eq("emp_proprietaria_id", emp)
  const contagem = new Map<string, number>()
  for (const it of (itens ?? []) as Record<string, unknown>[]) {
    for (const k of [it.nota_fiscal_entrada_id, it.nota_fiscal_saida_id]) {
      const id = texto(k)
      if (id) contagem.set(id, (contagem.get(id) ?? 0) + 1)
    }
  }

  return brutos.map((n) => ({
    id: String(n.id),
    numero_nota: texto(n.numero_nota),
    entrada: n.entrada === null || n.entrada === undefined ? null : n.entrada === true,
    data_emissao: texto(n.data_emissao),
    fornecedorNome: n.fornecedor_id
      ? (nomes.get(String(n.fornecedor_id)) ?? null)
      : null,
    totalItens: contagem.get(String(n.id)) ?? 0,
  }))
}

export type NotaDetalhe = {
  id: string
  numero_nota: string | null
  entrada: boolean | null
  data_emissao: string | null
  arquivo_nota: string | null
  fornecedor_id: string | null
  fornecedorNome: string | null
  legado: boolean
}

export async function buscarNota(id: string): Promise<NotaDetalhe | null> {
  const admin = await createAdminClient()
  const { data: n, error } = await admin
    .from("patrimonio_nota_fiscal")
    .select("*")
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return null
    throw new Error(`Falha ao buscar a nota fiscal: ${error.message}`)
  }
  if (!n) return null
  const fornecedor_id = texto(n.fornecedor_id)
  const nomes = fornecedor_id ? await nomesDasEmpresas([fornecedor_id]) : new Map()
  return {
    id: String(n.id),
    numero_nota: texto(n.numero_nota),
    entrada: n.entrada === null || n.entrada === undefined ? null : n.entrada === true,
    data_emissao: texto(n.data_emissao),
    arquivo_nota: texto(n.arquivo_nota),
    fornecedor_id,
    fornecedorNome: fornecedor_id ? (nomes.get(fornecedor_id) ?? null) : null,
    legado: Boolean(n.bubble_id),
  }
}

export type DadosNota = {
  numero_nota: string | null
  entrada: boolean
  data_emissao: string | null
  /** Gerido pelo upload (gravarArquivoNota); opcional aqui. */
  arquivo_nota?: string | null
  fornecedor_id: string | null
}

export async function criarNota(
  dados: DadosNota
): Promise<{ id?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data, error } = await admin
    .from("patrimonio_nota_fiscal")
    .insert({
      numero_nota: dados.numero_nota,
      entrada: dados.entrada,
      data_emissao: dados.data_emissao,
      arquivo_nota: dados.arquivo_nota ?? null,
      fornecedor_id: dados.fornecedor_id,
      emp_proprietaria_id: await tenantAtual(),
    })
    .select("id")
    .single()
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível cadastrar a nota fiscal: ${error.message}` }
  }
  return { id: data.id }
}

export async function atualizarNota(
  id: string,
  dados: Partial<DadosNota>
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const mudancas: Record<string, unknown> = {}
  if (dados.numero_nota !== undefined) mudancas.numero_nota = dados.numero_nota
  if (dados.entrada !== undefined) mudancas.entrada = dados.entrada
  if (dados.data_emissao !== undefined) mudancas.data_emissao = dados.data_emissao
  if (dados.arquivo_nota !== undefined) mudancas.arquivo_nota = dados.arquivo_nota
  if (dados.fornecedor_id !== undefined) mudancas.fornecedor_id = dados.fornecedor_id

  const { data, error } = await admin
    .from("patrimonio_nota_fiscal")
    .update(mudancas)
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
    .select("id")
  if (error) {
    if (esquemaAusente(error)) return { erro: AVISO_SQL_PATRIMONIO }
    return { erro: `Não foi possível salvar: ${error.message}` }
  }
  if ((data ?? []).length === 0) return { erro: "Nota fiscal não encontrada." }
  return {}
}

/** Anexa (ou substitui) o arquivo (PDF) da nota fiscal no bucket privado. */
export async function gravarArquivoNota(
  notaId: string,
  arquivo: File
): Promise<{ erro?: string }> {
  const { caminho, erro } = await subirArquivo("nota-fiscal", notaId, arquivo)
  if (erro) return { erro }
  const admin = await createAdminClient()
  const { error } = await admin
    .from("patrimonio_nota_fiscal")
    .update({ arquivo_nota: caminho })
    .eq("id", notaId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: `Arquivo enviado, mas falhou ao vincular: ${error.message}` }
  return {}
}

/** Itens vinculados a uma NF (como entrada ou saída), p/ a página de detalhe. */
export async function listarItensDaNota(
  nfId: string
): Promise<{ id: string; nome: string | null; numero_patrimonio: string | null; tipo: "entrada" | "saída" }[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("patrimonio_item")
    .select("id, nome, numero_patrimonio, nota_fiscal_entrada_id, nota_fiscal_saida_id")
    .eq("emp_proprietaria_id", emp)
    .or(`nota_fiscal_entrada_id.eq.${nfId},nota_fiscal_saida_id.eq.${nfId}`)
    .order("nome", { ascending: true })
  if (error) return []
  return ((data ?? []) as Record<string, unknown>[]).map((i) => ({
    id: String(i.id),
    nome: texto(i.nome),
    numero_patrimonio: texto(i.numero_patrimonio),
    tipo: texto(i.nota_fiscal_entrada_id) === nfId ? "entrada" : "saída",
  }))
}
