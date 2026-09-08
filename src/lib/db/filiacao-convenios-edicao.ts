import "server-only"

import { randomUUID } from "node:crypto"

import { ehDoBubble } from "@/lib/db/filiacao-documentos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Edição de convênios pelo painel — chegou em 09/09; antes disso a carteira
 * era só a que veio do sistema antigo (leitura em `filiacao-convenios.ts`).
 *
 * Regras: o convênio pertence ao tenant; categoria e conveniador são
 * referências conferidas no mesmo tenant; as unidades somem junto com o
 * convênio (FK em cascata) e levam o endereço próprio; arquivos ficam no
 * bucket `filiacao`, em convenios/<id>/.
 */

const BUCKET = "filiacao"

export type CategoriaConvenio = { id: string; categoria: string | null; total: number }
export type OpcaoConveniador = { id: string; nome: string; conveniador: boolean }

export type EnderecoUnidade = {
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  estado: string | null
}

export type UnidadeEditavel = {
  id: string
  nome: string | null
  site: string | null
  online: boolean
  presencial: boolean
  telefones: string[]
  emails: string[]
  enderecoId: string | null
  endereco: EnderecoUnidade
}

export type ConvenioEditavel = {
  id: string
  categoriaId: string | null
  conveniadorId: string | null
  conveniador: string | null
  ativo: boolean
  dataTermino: string | null
  infoSumarias: string | null
  infoVantagens: string | null
  arquivoConvenio: string | null
  arquivoUrl: string | null
  fotoPrincipal: string | null
  fotoUrl: string | null
  unidades: UnidadeEditavel[]
}

export type DadosConvenio = {
  categoriaId: string | null
  conveniadorId: string
  ativo: boolean
  dataTermino: string | null
  infoSumarias: string | null
  infoVantagens: string | null
}

export type DadosUnidade = {
  nome: string
  site: string | null
  online: boolean
  presencial: boolean
  telefones: string[]
  emails: string[]
  endereco: EnderecoUnidade
}

type Resultado = { ok: true; id: string } | { erro: string }

async function urlAssinada(valor: string | null): Promise<string | null> {
  if (!valor) return null
  if (ehDoBubble(valor)) return valor.startsWith("//") ? `https:${valor}` : valor
  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrl(valor, 3600)
  return data?.signedUrl ?? null
}

const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

// ── Leitura para edição ────────────────────────────────────────────────────

export async function listarCategoriasConvenio(): Promise<CategoriaConvenio[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const [{ data: cats }, { data: usos }] = await Promise.all([
    admin.from("filiacao_convenios_categorias").select("id, categoria").eq("emp_proprietaria_id", emp),
    admin.from("filiacao_convenios").select("categoria_id").eq("emp_proprietaria_id", emp),
  ])
  const contagem = new Map<string, number>()
  for (const u of usos ?? []) {
    const k = u.categoria_id as string | null
    if (k) contagem.set(k, (contagem.get(k) ?? 0) + 1)
  }
  return (cats ?? [])
    .map((c) => ({
      id: c.id as string,
      categoria: (c.categoria as string | null) ?? null,
      total: contagem.get(c.id as string) ?? 0,
    }))
    .sort((a, b) => (a.categoria ?? "").localeCompare(b.categoria ?? "", "pt-BR"))
}

/**
 * Empresas que podem ser conveniadoras. As já marcadas como conveniador vêm
 * primeiro; as demais entram também, porque a marca é consequência de ter
 * convênio — salvar um convênio marca a empresa.
 */
export async function listarConveniadores(): Promise<OpcaoConveniador[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("empresa")
    .select("id, nome_fantasia, nome_razao, conveniador, inativa")
    .eq("emp_proprietaria_id", emp)
    .or("inativa.is.null,inativa.eq.false")
    .limit(3000)
  return (data ?? [])
    .map((e) => ({
      id: e.id as string,
      nome: ((e.nome_fantasia as string | null) ?? (e.nome_razao as string | null) ?? "").trim(),
      conveniador: e.conveniador === true,
    }))
    .filter((e) => e.nome !== "")
    .sort(
      (a, b) =>
        Number(b.conveniador) - Number(a.conveniador) || a.nome.localeCompare(b.nome, "pt-BR")
    )
}

export async function obterConvenio(id: string): Promise<ConvenioEditavel | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("filiacao_convenios")
    .select(
      "id, categoria_id, conveniador_id, ativo, data_termino, info_sumarias, info_vantagens, arquivo_convenio, foto_principal, conveniador:empresa!fk_filiacao_convenios_conveniador(nome_fantasia, nome_razao), unidades:filiacao_convenios_unidades(id, nome, site, atendimento_online, atendimento_presencial, telefones, emails, endereco_id, created_at, endereco:endereco_id(cep, logradouro, numero, complemento, bairro, cidade, estado))"
    )
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (!data) return null

  const conveniador = um(data.conveniador as Record<string, string | null> | Record<string, string | null>[] | null)
  const unidades: UnidadeEditavel[] = ((data.unidades as Record<string, unknown>[] | null) ?? [])
    .sort((a, b) => String(a.created_at ?? "").localeCompare(String(b.created_at ?? "")))
    .map((u) => {
      const e = um(u.endereco as Record<string, string | null> | Record<string, string | null>[] | null)
      return {
        id: u.id as string,
        nome: (u.nome as string | null) ?? null,
        site: (u.site as string | null) ?? null,
        online: u.atendimento_online === true,
        presencial: u.atendimento_presencial === true,
        telefones: (u.telefones as string[] | null) ?? [],
        emails: (u.emails as string[] | null) ?? [],
        enderecoId: (u.endereco_id as string | null) ?? null,
        endereco: {
          cep: e?.cep ?? null,
          logradouro: e?.logradouro ?? null,
          numero: e?.numero ?? null,
          complemento: e?.complemento ?? null,
          bairro: e?.bairro ?? null,
          cidade: e?.cidade ?? null,
          estado: e?.estado ?? null,
        },
      }
    })

  return {
    id: data.id as string,
    categoriaId: (data.categoria_id as string | null) ?? null,
    conveniadorId: (data.conveniador_id as string | null) ?? null,
    conveniador: conveniador?.nome_fantasia ?? conveniador?.nome_razao ?? null,
    ativo: data.ativo === true,
    dataTermino: (data.data_termino as string | null) ?? null,
    infoSumarias: (data.info_sumarias as string | null) ?? null,
    infoVantagens: (data.info_vantagens as string | null) ?? null,
    arquivoConvenio: (data.arquivo_convenio as string | null) ?? null,
    arquivoUrl: await urlAssinada((data.arquivo_convenio as string | null) ?? null),
    fotoPrincipal: (data.foto_principal as string | null) ?? null,
    fotoUrl: await urlAssinada((data.foto_principal as string | null) ?? null),
    unidades,
  }
}

// ── Convênio ───────────────────────────────────────────────────────────────

export async function salvarConvenio(dados: DadosConvenio, id?: string): Promise<Resultado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: empresa } = await admin
    .from("empresa")
    .select("id, conveniador")
    .eq("emp_proprietaria_id", emp)
    .eq("id", dados.conveniadorId)
    .maybeSingle()
  if (!empresa) return { erro: "Conveniador não encontrado." }

  if (dados.categoriaId) {
    const { data: cat } = await admin
      .from("filiacao_convenios_categorias")
      .select("id")
      .eq("emp_proprietaria_id", emp)
      .eq("id", dados.categoriaId)
      .maybeSingle()
    if (!cat) return { erro: "Categoria não encontrada." }
  }

  const registro = {
    categoria_id: dados.categoriaId,
    conveniador_id: dados.conveniadorId,
    ativo: dados.ativo,
    data_termino: dados.dataTermino,
    info_sumarias: dados.infoSumarias,
    info_vantagens: dados.infoVantagens,
  }

  let convenioId = id ?? null
  if (convenioId) {
    const { error, count } = await admin
      .from("filiacao_convenios")
      .update({ ...registro, updated_at: new Date().toISOString() }, { count: "exact" })
      .eq("emp_proprietaria_id", emp)
      .eq("id", convenioId)
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
    if (count === 0) return { erro: "Convênio não encontrado." }
  } else {
    const { data, error } = await admin
      .from("filiacao_convenios")
      .insert({ ...registro, emp_proprietaria_id: emp })
      .select("id")
      .single()
    if (error || !data) return { erro: `Não foi possível criar: ${error?.message}` }
    convenioId = data.id as string
  }

  // A empresa passa a ser conveniadora — é o que o Compras espera e o que
  // põe a empresa no topo da lista da próxima vez.
  if (empresa.conveniador !== true) {
    await admin
      .from("empresa")
      .update({ conveniador: true })
      .eq("emp_proprietaria_id", emp)
      .eq("id", dados.conveniadorId)
  }
  return { ok: true, id: convenioId }
}

/** Apaga o convênio, as unidades (cascata), os endereços delas e os arquivos do bucket. */
export async function excluirConvenio(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const atual = await obterConvenio(id)
  if (!atual) return { erro: "Convênio não encontrado." }

  const { error } = await admin
    .from("filiacao_convenios")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }

  const enderecos = atual.unidades.map((u) => u.enderecoId).filter((x): x is string => Boolean(x))
  if (enderecos.length > 0) {
    await admin.from("enderecos").delete().eq("emp_proprietaria_id", emp).in("id", enderecos)
  }

  const nossos = [atual.arquivoConvenio, atual.fotoPrincipal].filter(
    (v): v is string => Boolean(v) && !ehDoBubble(v)
  )
  if (nossos.length > 0) await admin.storage.from(BUCKET).remove(nossos)
  return {}
}

// ── Unidades ───────────────────────────────────────────────────────────────

export async function salvarUnidade(
  convenioId: string,
  dados: DadosUnidade,
  id?: string
): Promise<Resultado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data: conv } = await admin
    .from("filiacao_convenios")
    .select("id, conveniador_id")
    .eq("emp_proprietaria_id", emp)
    .eq("id", convenioId)
    .maybeSingle()
  if (!conv) return { erro: "Convênio não encontrado." }

  let enderecoId: string | null = null
  if (id) {
    const { data: atual } = await admin
      .from("filiacao_convenios_unidades")
      .select("id, endereco_id")
      .eq("emp_proprietaria_id", emp)
      .eq("id", id)
      .eq("convenio_id", convenioId)
      .maybeSingle()
    if (!atual) return { erro: "Unidade não encontrada." }
    enderecoId = (atual.endereco_id as string | null) ?? null
  }

  const e = dados.endereco
  const temEndereco = [e.cep, e.logradouro, e.numero, e.bairro, e.cidade, e.estado].some(
    (v) => v && v.trim()
  )
  const endereco = {
    cep: e.cep,
    logradouro: e.logradouro,
    numero: e.numero,
    complemento: e.complemento,
    bairro: e.bairro,
    cidade: e.cidade,
    estado: e.estado,
    nome_endereco: dados.nome,
    tipo_endereco: "Comercial",
    empresa_id: (conv.conveniador_id as string | null) ?? null,
  }
  if (temEndereco && enderecoId) {
    const { error } = await admin
      .from("enderecos")
      .update(endereco)
      .eq("emp_proprietaria_id", emp)
      .eq("id", enderecoId)
    if (error) return { erro: `Não foi possível salvar o endereço: ${error.message}` }
  } else if (temEndereco) {
    const { data, error } = await admin
      .from("enderecos")
      .insert({ ...endereco, emp_proprietaria_id: emp })
      .select("id")
      .single()
    if (error || !data) return { erro: `Não foi possível salvar o endereço: ${error?.message}` }
    enderecoId = data.id as string
  } else if (enderecoId) {
    await admin.from("enderecos").delete().eq("emp_proprietaria_id", emp).eq("id", enderecoId)
    enderecoId = null
  }

  const registro = {
    nome: dados.nome,
    site: dados.site,
    atendimento_online: dados.online,
    atendimento_presencial: dados.presencial,
    telefones: dados.telefones,
    emails: dados.emails,
    endereco_id: enderecoId,
  }
  if (id) {
    const { error } = await admin
      .from("filiacao_convenios_unidades")
      .update(registro)
      .eq("emp_proprietaria_id", emp)
      .eq("id", id)
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
    return { ok: true, id }
  }
  const { data, error } = await admin
    .from("filiacao_convenios_unidades")
    .insert({ ...registro, convenio_id: convenioId, emp_proprietaria_id: emp })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível criar: ${error?.message}` }
  return { ok: true, id: data.id as string }
}

export async function excluirUnidade(convenioId: string, id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data: atual } = await admin
    .from("filiacao_convenios_unidades")
    .select("id, endereco_id")
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .eq("convenio_id", convenioId)
    .maybeSingle()
  if (!atual) return { erro: "Unidade não encontrada." }
  const { error } = await admin
    .from("filiacao_convenios_unidades")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  if (atual.endereco_id) {
    await admin
      .from("enderecos")
      .delete()
      .eq("emp_proprietaria_id", emp)
      .eq("id", atual.endereco_id as string)
  }
  return {}
}

// ── Categorias ─────────────────────────────────────────────────────────────

export async function salvarCategoriaConvenio(nome: string, id?: string): Promise<Resultado> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const categoria = nome.trim()
  if (!categoria) return { erro: "Informe o nome da categoria." }
  if (id) {
    const { error, count } = await admin
      .from("filiacao_convenios_categorias")
      .update({ categoria }, { count: "exact" })
      .eq("emp_proprietaria_id", emp)
      .eq("id", id)
    if (error) return { erro: `Não foi possível salvar: ${error.message}` }
    if (count === 0) return { erro: "Categoria não encontrada." }
    return { ok: true, id }
  }
  const { data, error } = await admin
    .from("filiacao_convenios_categorias")
    .insert({ categoria, emp_proprietaria_id: emp })
    .select("id")
    .single()
  if (error || !data) return { erro: `Não foi possível criar: ${error?.message}` }
  return { ok: true, id: data.id as string }
}

/** Só apaga categoria sem convênio — senão a carteira perderia a organização. */
export async function excluirCategoriaConvenio(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { count } = await admin
    .from("filiacao_convenios")
    .select("id", { count: "exact", head: true })
    .eq("emp_proprietaria_id", emp)
    .eq("categoria_id", id)
  if ((count ?? 0) > 0) {
    return { erro: `Há ${count} convênio(s) nesta categoria. Mova-os antes de excluir.` }
  }
  const { error } = await admin
    .from("filiacao_convenios_categorias")
    .delete()
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Não foi possível excluir: ${error.message}` }
  return {}
}

// ── Arquivos ───────────────────────────────────────────────────────────────

export type ArquivoConvenio = "contrato" | "foto"
const COLUNA_ARQUIVO: Record<ArquivoConvenio, "arquivo_convenio" | "foto_principal"> = {
  contrato: "arquivo_convenio",
  foto: "foto_principal",
}
const MAX_ARQUIVO = 10 * 1024 * 1024

export async function enviarArquivoConvenio(
  id: string,
  tipo: ArquivoConvenio,
  arquivo: File
): Promise<{ erro?: string }> {
  if (arquivo.size === 0) return { erro: "Escolha o arquivo." }
  if (arquivo.size > MAX_ARQUIVO) return { erro: "O arquivo deve ter no máximo 10 MB." }
  const TIPOS: Record<string, string> =
    tipo === "contrato"
      ? { "application/pdf": "pdf", "image/jpeg": "jpg", "image/png": "png" }
      : { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }
  const extensao = TIPOS[arquivo.type]
  if (!extensao) {
    return {
      erro: tipo === "contrato" ? "Envie em PDF, JPG ou PNG." : "Envie uma imagem JPG, PNG ou WebP.",
    }
  }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const coluna = COLUNA_ARQUIVO[tipo]
  const { data: atual } = await admin
    .from("filiacao_convenios")
    .select("id, arquivo_convenio, foto_principal")
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (!atual) return { erro: "Convênio não encontrado." }

  const caminho = `convenios/${id}/${tipo}-${randomUUID()}.${extensao}`
  const { error: erroUpload } = await admin.storage
    .from(BUCKET)
    .upload(caminho, arquivo, { contentType: arquivo.type })
  if (erroUpload) return { erro: `Falha ao enviar: ${erroUpload.message}` }

  const { error } = await admin
    .from("filiacao_convenios")
    .update({ [coluna]: caminho })
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) {
    await admin.storage.from(BUCKET).remove([caminho])
    return { erro: `Falha ao registrar: ${error.message}` }
  }
  const anterior = atual[coluna] as string | null
  if (anterior && !ehDoBubble(anterior)) await admin.storage.from(BUCKET).remove([anterior])
  return {}
}

export async function removerArquivoConvenio(
  id: string,
  tipo: ArquivoConvenio
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const coluna = COLUNA_ARQUIVO[tipo]
  const { data: atual } = await admin
    .from("filiacao_convenios")
    .select("id, arquivo_convenio, foto_principal")
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (!atual) return { erro: "Convênio não encontrado." }
  const valor = atual[coluna] as string | null
  const { error } = await admin
    .from("filiacao_convenios")
    .update({ [coluna]: null })
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
  if (error) return { erro: `Falha ao remover: ${error.message}` }
  if (valor && !ehDoBubble(valor)) await admin.storage.from(BUCKET).remove([valor])
  return {}
}
