import "server-only"

import { hojeSP } from "@/lib/db/comum"
import { ehDoBubble } from "@/lib/db/filiacao-documentos"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Convênios — os descontos e serviços que a entidade negocia para o filiado
 * (ótica, hospedagem, cursos, aluguel de veículos, consórcios, saúde), com
 * as unidades onde ele é atendido.
 *
 * Estrutura criada em `supabase/filiacao-lacunas-modelo.sql` (08/09) e
 * carregada do sistema antigo (21 convênios, 6 categorias, 19 unidades). O
 * portal lê só os ativos e sem término vencido; o painel vê tudo.
 */

const BUCKET = "filiacao"

export type UnidadeConvenio = {
  id: string
  nome: string | null
  site: string | null
  online: boolean
  presencial: boolean
  telefones: string[]
  emails: string[]
  endereco: string | null
}

export type Convenio = {
  id: string
  categoria: string | null
  conveniador: string | null
  ativo: boolean
  vigente: boolean
  dataTermino: string | null
  infoSumarias: string | null
  infoVantagens: string | null
  /** Link do contrato/regulamento, assinado se estiver no nosso bucket. */
  arquivoUrl: string | null
  /**
   * Logo do conveniador — só com `{ logos: true }` e só quando o arquivo é
   * imagem (há "foto" cadastrada que é PDF). Sem pedido, fica null.
   */
  fotoUrl: string | null
  unidades: UnidadeConvenio[]
}

/**
 * URLs assinadas, em lote e com cache (A79). Antes eram duas chamadas ao
 * Storage por convênio, em série, a cada abertura de QUALQUER página do
 * portal (a casca pergunta se há convênio vigente) — e uma delas para um
 * logo que nenhuma tela mostrava.
 *
 * A assinatura vale 6 h e é reaproveitada enquanto faltar mais de 1 h: o
 * link na tela continua valendo ao menos 1 h depois de aberta a página,
 * como antes. O cache é por instância e por caminho; só devolve caminhos
 * que vieram de linhas lidas sob o tenant da requisição.
 */
const VALIDADE_S = 6 * 3600
const MARGEM_MS = 3600 * 1000
const assinadas = new Map<string, { url: string; expiraEm: number }>()

async function assinarEmLote(valores: (string | null)[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>()
  const agora = Date.now()
  const faltam: string[] = []
  for (const v of new Set(valores)) {
    if (!v) continue
    if (ehDoBubble(v)) {
      urls.set(v, v.startsWith("//") ? `https:${v}` : v)
      continue
    }
    const guardada = assinadas.get(v)
    if (guardada && guardada.expiraEm - agora > MARGEM_MS) urls.set(v, guardada.url)
    else faltam.push(v)
  }
  if (faltam.length === 0) return urls

  const admin = await createAdminClient()
  const { data } = await admin.storage.from(BUCKET).createSignedUrls(faltam, VALIDADE_S)
  if (assinadas.size > 1000) assinadas.clear()
  for (const item of data ?? []) {
    if (!item.path || !item.signedUrl) continue
    assinadas.set(item.path, { url: item.signedUrl, expiraEm: agora + VALIDADE_S * 1000 })
    urls.set(item.path, item.signedUrl)
  }
  return urls
}

/**
 * O arquivo é imagem? Pela extensão, ignorando a query de URL do Bubble. SVG
 * fica de fora: sem tamanho próprio, pode chegar com largura natural zero e
 * o portal o esconderia como imagem quebrada.
 */
function ehImagem(valor: string | null): boolean {
  return !!valor && /\.(png|jpe?g|webp|gif|avif)$/i.test(valor.split(/[?#]/)[0])
}

function enderecoEmLinha(a: Record<string, unknown> | null): string | null {
  if (!a) return null
  const l1 = [a.logradouro, a.numero, a.complemento].filter((x) => typeof x === "string" && x.trim()).join(", ")
  const l2 = [a.bairro, [a.cidade, a.estado].filter(Boolean).join("/")].filter((x) => typeof x === "string" && x.trim()).join(" · ")
  return [l1, l2].filter(Boolean).join(" — ") || null
}

export async function listarConvenios(
  opcoes: {
    somenteVigentes?: boolean
    /** Assina o link do regulamento (padrão: sim — o painel e o portal mostram). */
    arquivos?: boolean
    /** Assina o logo do conveniador (padrão: não — só quem exibe paga). */
    logos?: boolean
  } = {}
): Promise<Convenio[]> {
  const { arquivos = true, logos = false } = opcoes
  const admin = await createAdminClient()
  const emp = await tenantAtual()

  const { data, error } = await admin
    .from("filiacao_convenios")
    .select(
      "id, ativo, data_termino, info_sumarias, info_vantagens, arquivo_convenio, foto_principal, categoria:categoria_id(categoria), conveniador:empresa!fk_filiacao_convenios_conveniador(nome_fantasia, nome_razao), unidades:filiacao_convenios_unidades(id, nome, site, atendimento_online, atendimento_presencial, telefones, emails, endereco:endereco_id(logradouro, numero, complemento, bairro, cidade, estado))"
    )
    .eq("emp_proprietaria_id", emp)
    .order("created_at", { ascending: true })
  if (error) {
    if (/does not exist|schema cache/i.test(error.message)) return []
    throw new Error(`Falha ao ler convênios: ${error.message}`)
  }

  // Dia de São Paulo: em UTC, das 21h à meia-noite o convênio que termina
  // hoje já sairia da lista.
  const hoje = hojeSP()
  const um = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

  const linhas = (data ?? []).filter((c) => {
    const termino = (c.data_termino as string | null) ?? null
    return !opcoes.somenteVigentes || (c.ativo === true && (!termino || termino >= hoje))
  })
  // Uma ida ao Storage para a lista inteira, e só do que vai aparecer.
  const urls = await assinarEmLote([
    ...(arquivos ? linhas.map((c) => (c.arquivo_convenio as string | null) ?? null) : []),
    ...(logos
      ? linhas.map((c) => (c.foto_principal as string | null) ?? null).filter(ehImagem)
      : []),
  ]).catch(() => new Map<string, string>())

  const lista: Convenio[] = []
  for (const c of linhas) {
    const ativo = c.ativo === true
    const termino = (c.data_termino as string | null) ?? null
    const vigente = ativo && (!termino || termino >= hoje)
    const arquivo = (c.arquivo_convenio as string | null) ?? null
    const foto = (c.foto_principal as string | null) ?? null
    const categoria = um(c.categoria as { categoria: string | null } | { categoria: string | null }[] | null)
    const conveniador = um(c.conveniador as Record<string, string | null> | Record<string, string | null>[] | null)
    const unidades = ((c.unidades as Record<string, unknown>[] | null) ?? []).map((u) => ({
      id: u.id as string,
      nome: (u.nome as string | null) ?? null,
      site: (u.site as string | null) ?? null,
      online: u.atendimento_online === true,
      presencial: u.atendimento_presencial === true,
      telefones: (u.telefones as string[] | null) ?? [],
      emails: (u.emails as string[] | null) ?? [],
      endereco: enderecoEmLinha(um(u.endereco as Record<string, unknown> | Record<string, unknown>[] | null)),
    }))
    lista.push({
      id: c.id as string,
      categoria: categoria?.categoria ?? null,
      conveniador: conveniador?.nome_fantasia ?? conveniador?.nome_razao ?? null,
      ativo,
      vigente,
      dataTermino: termino,
      infoSumarias: (c.info_sumarias as string | null) ?? null,
      infoVantagens: (c.info_vantagens as string | null) ?? null,
      arquivoUrl: arquivos && arquivo ? (urls.get(arquivo) ?? null) : null,
      fotoUrl: logos && foto && ehImagem(foto) ? (urls.get(foto) ?? null) : null,
      unidades,
    })
  }

  // Por categoria, e dentro dela pelo nome do conveniador: é como o filiado
  // procura ("tem ótica?"), não pela ordem de cadastro. Sem categoria vai
  // para o FIM (A164): com "" na chave, o grupo "Outros" abria a página no
  // portal e no painel, antes de tudo que tem nome. U+FFFF tem o maior peso
  // na ordenação por idioma; nome em branco conta como sem categoria, como
  // no agrupamento do portal.
  const SEM_CATEGORIA = "\uffff"
  const chave = (c: Convenio) => c.categoria?.trim() || SEM_CATEGORIA
  return lista.sort(
    (a, b) =>
      chave(a).localeCompare(chave(b), "pt-BR") ||
      (a.conveniador ?? "").localeCompare(b.conveniador ?? "", "pt-BR")
  )
}
