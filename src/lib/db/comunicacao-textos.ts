import "server-only"

import { esquemaAusente, nomesDosUsuarios } from "@/lib/db/comum"
import { lerPaginaWeb } from "@/lib/db/comunicacao"
import { gerarJsonIA, gerarTextoIA, type ResultadoIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Comunicação › Assistente de redação.
 *
 * A IA recebe TRÊS camadas, e a qualidade do texto vem de manter as três
 * separadas:
 *   1. POLÍTICA EDITORIAL — quem é a entidade, como ela fala. Estável, escrita
 *      uma vez, melhorável por IA a partir de textos já publicados.
 *   2. CANAL — as convenções do meio (legenda de Instagram não é notícia de
 *      site nem cartaz de mural). Vem do cadastro do tenant.
 *   3. SOLICITAÇÃO — os fatos e o recorte deste texto específico.
 *
 * Os FATOS são obrigatórios porque sem eles a IA preenche o vazio inventando.
 * Numa denúncia isso é risco jurídico, então a exigência está aqui e no banco
 * (check constraint), não só na tela.
 *
 * SQL: supabase/comunicacao-assistente-textos.sql
 */

// ── Objetivos ────────────────────────────────────────────────────────────────
//
// Lista fixa (como TAMANHOS no resumo): são gêneros do jornalismo sindical,
// não a composição de um sindicato específico. A `orientacao` de cada um é o
// que mais muda a qualidade do resultado — é onde entra o cuidado editorial
// que um redator experiente aplicaria sem pensar.

export type Objetivo = {
  valor: string
  rotulo: string
  orientacao: string
}

export const OBJETIVOS: Objetivo[] = [
  {
    valor: "denuncia",
    rotulo: "Denúncia",
    orientacao:
      "Rigor factual absoluto. Afirme APENAS o que está nos fatos fornecidos. Não atribua intenção, dolo ou culpa que os fatos não sustentem; descreva a conduta e deixe a conclusão para o leitor. Prefira dados, datas e documentos a adjetivos. Se algo for alegação e não fato provado, escreva que é alegação.",
  },
  {
    valor: "informe",
    rotulo: "Informe",
    orientacao:
      "Informação primeiro, contexto depois. O leitor precisa entender o que muda para ele já na abertura. Sem retórica de mobilização.",
  },
  {
    valor: "convite",
    rotulo: "Convite",
    orientacao:
      "Data, horário e local são o coração do texto e não podem faltar nem ficar diluídos. Diga também por que vale a pena ir.",
  },
  {
    valor: "convocacao_assembleia",
    rotulo: "Convocação de assembleia",
    orientacao:
      "Peça formal: data, horário, local, e a pauta em itens. Use linguagem de convocação sindical. Não omita nenhum item de pauta informado.",
  },
  {
    valor: "cobertura",
    rotulo: "Cobertura de evento",
    orientacao:
      "Narre o que aconteceu, no passado. Números de participação, falas marcantes e encaminhamentos concretos. Evite promessa de futuro que não foi anunciada.",
  },
  {
    valor: "repudio",
    rotulo: "Nota de repúdio",
    orientacao:
      "Firmeza sem agressão pessoal. Nomeie a conduta repudiada e o motivo, ancorado nos fatos. Termine com a posição da entidade.",
  },
  {
    valor: "pesar",
    rotulo: "Nota de pesar",
    orientacao:
      "Sobriedade e brevidade. Nada de chamada para ação, hashtag promocional ou emoji. Se houver informação sobre velório ou homenagem, ela vem ao final, com clareza.",
  },
  {
    valor: "homenagem",
    rotulo: "Homenagem",
    orientacao:
      "Concreto vence elogio genérico: cite feitos, datas e histórias em vez de adjetivos.",
  },
  {
    valor: "campanha_salarial",
    rotulo: "Campanha salarial",
    orientacao:
      "Números com precisão (índices, percentuais, datas-base). Deixe claro o que é reivindicação, o que é proposta patronal e o que já foi acordado — nunca misture os três.",
  },
  {
    valor: "orientacao_filiado",
    rotulo: "Orientação ao filiado",
    orientacao:
      "Instrucional. Passo a passo, na ordem em que a pessoa vai executar. Diga o que fazer, com que documento, onde e até quando.",
  },
]

export function objetivoPorValor(v: string | null): Objetivo | null {
  return OBJETIVOS.find((o) => o.valor === v) ?? null
}

// ── Tipos ────────────────────────────────────────────────────────────────────

export type PoliticaEditorial = {
  politica: string
  publico_padrao: string
  tom_padrao: string
  termos_evitar: string
  assinatura: string
  atualizadaPorNome: string | null
  updated_at: string | null
}

export type Canal = {
  id: string
  nome: string
  limite_caracteres: number | null
  orientacoes: string | null
  suporta_busca: boolean
  ativo: boolean
  ordem: number
}

export type TextoSolicitado = {
  id: string
  assunto: string | null
  objetivo: string | null
  canal_nome: string | null
  tamanho: number | null
  fatos: string | null
  publico: string | null
  tom: string | null
  chamada_acao: string | null
  restricoes: string | null
  palavras_chave: string | null
  otimizar_busca: boolean
  titulo: string | null
  texto_gerado: string | null
  texto_final: string | null
  caracteres: number | null
  meta_descricao: string | null
  slug_sugerido: string | null
  hashtags: string | null
  versao: number
  origem_id: string | null
  ajuste_pedido: string | null
  solicitadoPorNome: string | null
  created_at: string
}

const POLITICA_VAZIA: PoliticaEditorial = {
  politica: "",
  publico_padrao: "",
  tom_padrao: "",
  termos_evitar: "",
  assinatura: "",
  atualizadaPorNome: null,
  updated_at: null,
}

function str(v: unknown): string {
  return typeof v === "string" ? v : ""
}

// ── Leitura ──────────────────────────────────────────────────────────────────

/** `ativo: false` = o SQL ainda não foi rodado (mesma convenção dos QR Codes). */
export async function obterPolitica(): Promise<{
  ativo: boolean
  politica: PoliticaEditorial
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_politica")
    .select(
      "politica, publico_padrao, tom_padrao, termos_evitar, assinatura, atualizada_por, updated_at"
    )
    .eq("emp_proprietaria_id", emp)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, politica: POLITICA_VAZIA }
    throw new Error(`Falha ao ler a política editorial: ${error.message}`)
  }
  if (!data) return { ativo: true, politica: POLITICA_VAZIA }

  const nomes = await nomesDosUsuarios(
    data.atualizada_por ? [data.atualizada_por as string] : []
  )
  return {
    ativo: true,
    politica: {
      politica: str(data.politica),
      publico_padrao: str(data.publico_padrao),
      tom_padrao: str(data.tom_padrao),
      termos_evitar: str(data.termos_evitar),
      assinatura: str(data.assinatura),
      atualizadaPorNome: data.atualizada_por
        ? (nomes.get(data.atualizada_por as string) ?? null)
        : null,
      updated_at: (data.updated_at as string | null) ?? null,
    },
  }
}

export async function listarCanais(apenasAtivos = false): Promise<Canal[]> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  let q = admin
    .from("comunicacao_canais")
    .select("id, nome, limite_caracteres, orientacoes, suporta_busca, ativo, ordem")
    .eq("emp_proprietaria_id", emp)
  if (apenasAtivos) q = q.eq("ativo", true)
  const { data, error } = await q.order("ordem").order("nome")
  if (error) {
    if (esquemaAusente(error)) return []
    throw new Error(`Falha ao listar os canais: ${error.message}`)
  }
  return (data ?? []).map((c) => ({
    id: c.id as string,
    nome: c.nome as string,
    limite_caracteres: (c.limite_caracteres as number | null) ?? null,
    orientacoes: (c.orientacoes as string | null) ?? null,
    suporta_busca: c.suporta_busca === true,
    ativo: c.ativo !== false,
    ordem: (c.ordem as number | null) ?? 0,
  }))
}

const CAMPOS_TEXTO =
  "id, assunto, objetivo, canal_nome, tamanho, fatos, publico, tom, chamada_acao, restricoes, palavras_chave, otimizar_busca, titulo, texto_gerado, texto_final, caracteres, meta_descricao, slug_sugerido, hashtags, versao, origem_id, ajuste_pedido, solicitado_por, created_at"

function mapTexto(
  t: Record<string, unknown>,
  nomes: Map<string, string>
): TextoSolicitado {
  const por = t.solicitado_por as string | null
  return {
    id: t.id as string,
    assunto: (t.assunto as string | null) ?? null,
    objetivo: (t.objetivo as string | null) ?? null,
    canal_nome: (t.canal_nome as string | null) ?? null,
    tamanho: (t.tamanho as number | null) ?? null,
    fatos: (t.fatos as string | null) ?? null,
    publico: (t.publico as string | null) ?? null,
    tom: (t.tom as string | null) ?? null,
    chamada_acao: (t.chamada_acao as string | null) ?? null,
    restricoes: (t.restricoes as string | null) ?? null,
    palavras_chave: (t.palavras_chave as string | null) ?? null,
    otimizar_busca: t.otimizar_busca === true,
    titulo: (t.titulo as string | null) ?? null,
    texto_gerado: (t.texto_gerado as string | null) ?? null,
    texto_final: (t.texto_final as string | null) ?? null,
    caracteres: (t.caracteres as number | null) ?? null,
    meta_descricao: (t.meta_descricao as string | null) ?? null,
    slug_sugerido: (t.slug_sugerido as string | null) ?? null,
    hashtags: (t.hashtags as string | null) ?? null,
    versao: (t.versao as number | null) ?? 1,
    origem_id: (t.origem_id as string | null) ?? null,
    ajuste_pedido: (t.ajuste_pedido as string | null) ?? null,
    solicitadoPorNome: por ? (nomes.get(por) ?? null) : null,
    created_at: t.created_at as string,
  }
}

/**
 * Lista para o controle de textos. Mostra só a versão MAIS RECENTE de cada
 * pedido (as regerações ficam agrupadas sob a original), para a lista não
 * inchar quando alguém itera cinco vezes no mesmo texto.
 */
export async function listarTextos(limite = 100): Promise<{
  ativo: boolean
  linhas: TextoSolicitado[]
}> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_textos")
    .select(CAMPOS_TEXTO)
    .eq("emp_proprietaria_id", emp)
    .order("created_at", { ascending: false })
    .limit(limite)
  if (error) {
    if (esquemaAusente(error)) return { ativo: false, linhas: [] }
    throw new Error(`Falha ao listar os textos: ${error.message}`)
  }
  const linhas = data ?? []
  const nomes = await nomesDosUsuarios(
    linhas.map((t) => t.solicitado_por).filter((v): v is string => !!v)
  )
  // uma linha por pedido: a de maior versão dentro de cada família
  const porFamilia = new Map<string, Record<string, unknown>>()
  for (const t of linhas) {
    const familia = (t.origem_id as string | null) ?? (t.id as string)
    const atual = porFamilia.get(familia)
    if (!atual || Number(t.versao ?? 1) > Number(atual.versao ?? 1)) {
      porFamilia.set(familia, t)
    }
  }
  return {
    ativo: true,
    linhas: [...porFamilia.values()]
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))
      .map((t) => mapTexto(t, nomes)),
  }
}

/** Um texto com todas as suas versões (a original e as regerações). */
export async function obterTexto(id: string): Promise<{
  texto: TextoSolicitado
  versoes: TextoSolicitado[]
} | null> {
  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data } = await admin
    .from("comunicacao_textos")
    .select(CAMPOS_TEXTO)
    .eq("emp_proprietaria_id", emp)
    .eq("id", id)
    .maybeSingle()
  if (!data) return null

  const familia = (data.origem_id as string | null) ?? (data.id as string)
  const { data: irmas } = await admin
    .from("comunicacao_textos")
    .select(CAMPOS_TEXTO)
    .eq("emp_proprietaria_id", emp)
    .or(`id.eq.${familia},origem_id.eq.${familia}`)
    .order("versao", { ascending: false })

  const todas = irmas ?? [data]
  const nomes = await nomesDosUsuarios(
    todas.map((t) => t.solicitado_por).filter((v): v is string => !!v)
  )
  return {
    texto: mapTexto(data, nomes),
    versoes: todas.map((t) => mapTexto(t, nomes)),
  }
}

// ── Montagem do pedido à IA ──────────────────────────────────────────────────

export type Solicitacao = {
  assunto: string
  objetivo: string
  canal: Canal | null
  tamanho: number
  fatos: string
  publico: string
  tom: string
  chamada_acao: string
  restricoes: string
  palavras_chave: string
  otimizar_busca: boolean
  /** Preenchido só nas regerações: o que a pessoa pediu para mudar. */
  ajuste?: string
  /** Versão anterior, para a IA ajustar em vez de recomeçar. */
  textoAnterior?: string
}

/** Bloco só entra no prompt se tiver conteúdo — ruído vazio atrapalha a IA. */
function bloco(rotulo: string, valor: string): string {
  const v = valor.trim()
  return v ? `${rotulo}: ${v}\n` : ""
}

function instrucoesDeBusca(canal: Canal | null, palavras: string): string {
  const chaves = palavras.trim()
  if (canal?.suporta_busca === false) {
    // peça impressa: "otimizar" não faz sentido, mas as palavras-chave sim
    return chaves
      ? `\nUse naturalmente estes termos ao longo do texto: ${chaves}.`
      : ""
  }
  const nome = (canal?.nome ?? "").toLowerCase()
  const ehRede = /instagram|facebook|linkedin|twitter|x\b|tiktok|threads/.test(nome)
  if (ehRede) {
    return `
OTIMIZAÇÃO PARA DESCOBERTA NESTA REDE:
- Use os termos de busca${chaves ? ` (${chaves})` : ""} nas primeiras linhas, onde a rede indexa com mais peso.
- Devolva também "hashtags": de 5 a 10, específicas do assunto e da categoria, sem repetir palavra do texto só para encher.
- Nada de hashtag no meio das frases.`
  }
  return `
OTIMIZAÇÃO PARA BUSCA (SEO):
- Palavra-chave principal${chaves ? ` (${chaves})` : ""} no título e na primeira frase, de forma natural — nunca forçada.
- Divida o corpo com intertítulos curtos que também carreguem os termos.
- Devolva "meta_descricao": resumo de 150 a 160 caracteres que dê vontade de clicar.
- Devolva "slug_sugerido": o endereço da página, em minúsculas, sem acento, palavras separadas por hífen, no máximo seis palavras.`
}

function montarSystem(
  politica: PoliticaEditorial,
  canal: Canal | null,
  objetivo: Objetivo | null
): string {
  const partes: string[] = [
    "Você é redator de comunicação de um sindicato de trabalhadores no Brasil. Escreve em português do Brasil, com clareza e sem jargão corporativo.",
  ]

  if (politica.politica.trim()) {
    partes.push(`POLÍTICA EDITORIAL DA ENTIDADE (a voz que você deve ter):\n${politica.politica.trim()}`)
  }
  if (politica.termos_evitar.trim()) {
    partes.push(`TERMOS E EXPRESSÕES QUE A ENTIDADE NÃO USA: ${politica.termos_evitar.trim()}`)
  }
  if (canal) {
    partes.push(
      `CANAL DE DISTRIBUIÇÃO — ${canal.nome}:\n${canal.orientacoes?.trim() || "Sem convenções específicas registradas."}`
    )
  }
  if (objetivo) {
    partes.push(`GÊNERO DO TEXTO — ${objetivo.rotulo}:\n${objetivo.orientacao}`)
  }

  partes.push(
    `REGRAS INEGOCIÁVEIS:
- Escreva SOMENTE com base nos fatos fornecidos. Não invente número, data, nome, cargo, valor ou declaração.
- Se um fato essencial ao gênero pedido estiver faltando, escreva o texto sem ele e liste o que falta em "faltou".
- Não use aspas de declaração que não estejam nos fatos.
- Nada de "neste momento delicado", "é com grande satisfação" e outros clichês de release.`
  )

  return partes.join("\n\n")
}

function montarPrompt(s: Solicitacao, politica: PoliticaEditorial): string {
  const publico = s.publico.trim() || politica.publico_padrao.trim()
  const tom = s.tom.trim() || politica.tom_padrao.trim()

  let p =
    bloco("ASSUNTO", s.assunto) +
    bloco("PÚBLICO", publico) +
    bloco("TOM", tom) +
    bloco("CHAMADA PARA AÇÃO", s.chamada_acao) +
    bloco("NÃO MENCIONAR", s.restricoes) +
    bloco("TERMOS QUE DEVEM APARECER", s.palavras_chave) +
    bloco("ASSINATURA/FECHO", politica.assinatura) +
    `\nFATOS (única fonte de verdade):\n${s.fatos.trim()}\n`

  p += `\nTAMANHO ALVO: aproximadamente ${s.tamanho} caracteres, com tolerância de 10% para mais ou para menos. Conte caracteres, não palavras.`

  if (s.otimizar_busca) p += "\n" + instrucoesDeBusca(s.canal, s.palavras_chave)

  if (s.ajuste?.trim() && s.textoAnterior?.trim()) {
    p += `\n\nVERSÃO ANTERIOR:\n${s.textoAnterior.trim()}\n\nAJUSTE PEDIDO: ${s.ajuste.trim()}\nReescreva atendendo ao ajuste e preservando o que já estava bom. Não recomece do zero.`
  }

  p += `\n\nResponda com um objeto JSON:
{"titulo": "...", "texto": "...", "meta_descricao": "...", "slug_sugerido": "...", "hashtags": "...", "faltou": "..."}
- "texto": o texto pronto para publicar, sem título repetido dentro dele.
- "meta_descricao" e "slug_sugerido": só quando pedida otimização para busca em site; caso contrário, deixe vazios.
- "hashtags": só para redes sociais, separadas por espaço; caso contrário, vazio.
- "faltou": informação que faltou e que melhoraria o texto — vazio se não faltou nada.`

  return p
}

// ── Geração ──────────────────────────────────────────────────────────────────

export type ResultadoGeracao = {
  erro?: string
  id?: string
  faltou?: string
}

export async function gerarTexto(
  s: Solicitacao,
  usuarioId: string,
  anterior?: { familiaId: string; versao: number }
): Promise<ResultadoGeracao> {
  const { politica } = await obterPolitica()
  const objetivo = objetivoPorValor(s.objetivo)

  const { dados, erro } = await gerarJsonIA({
    system: montarSystem(politica, s.canal, objetivo),
    prompt: montarPrompt(s, politica),
  })
  if (erro) return { erro }

  const texto = str(dados?.texto).trim()
  if (!texto) return { erro: "A IA não retornou um texto válido." }

  const admin = await createAdminClient()
  const emp = await tenantAtual()
  const { data, error } = await admin
    .from("comunicacao_textos")
    .insert({
      emp_proprietaria_id: emp,
      assunto: s.assunto || null,
      objetivo: s.objetivo || null,
      canal_id: s.canal?.id ?? null,
      canal_nome: s.canal?.nome ?? null,
      tamanho: s.tamanho,
      fatos: s.fatos,
      publico: s.publico || null,
      tom: s.tom || null,
      chamada_acao: s.chamada_acao || null,
      restricoes: s.restricoes || null,
      palavras_chave: s.palavras_chave || null,
      otimizar_busca: s.otimizar_busca,
      titulo: str(dados?.titulo).trim() || null,
      texto_gerado: texto,
      caracteres: texto.length,
      meta_descricao: str(dados?.meta_descricao).trim() || null,
      slug_sugerido: str(dados?.slug_sugerido).trim() || null,
      hashtags: str(dados?.hashtags).trim() || null,
      versao: anterior ? anterior.versao + 1 : 1,
      origem_id: anterior?.familiaId ?? null,
      ajuste_pedido: s.ajuste?.trim() || null,
      solicitado_por: usuarioId,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { erro: `Falha ao salvar o texto: ${error?.message ?? "?"}` }
  }
  return { id: data.id as string, faltou: str(dados?.faltou).trim() || undefined }
}

// ── Política editorial melhorada por IA ──────────────────────────────────────

const SISTEMA_POLITICA = `Você ajuda um sindicato a escrever a POLÍTICA EDITORIAL da sua comunicação: o documento que descreve a voz da entidade para quem for redigir em nome dela — inclusive uma IA.

Uma boa política editorial diz: como a entidade se refere a si mesma e à categoria; que tom usa em cada situação; que palavras usa e quais evita; se trata o leitor por "você" ou "vocês"; como lida com números, siglas e nomes de empresas; o que nunca faz.

Escreva em português do Brasil, em prosa direta, entre 1200 e 2500 caracteres. Sem títulos de seção em markdown, sem listas numeradas — texto corrido em parágrafos. Responda apenas com a política, sem comentários.`

/** Melhora a política escrita à mão, sem exemplos externos. */
export async function melhorarPolitica(atual: string): Promise<ResultadoIA> {
  return gerarTextoIA({
    system: SISTEMA_POLITICA,
    prompt: `Melhore a política editorial abaixo: preencha as lacunas, deixe as regras verificáveis e remova o que for vago demais para orientar alguém.\n\nPOLÍTICA ATUAL:\n${atual.trim()}`,
  })
}

/**
 * Deduz a política a partir de textos JÁ PUBLICADOS pela entidade — o pedido do
 * Bruno. Reusa o leitor de páginas do Resumo de notícias; páginas que não
 * abrirem são simplesmente ignoradas, e o que sobrar já serve.
 */
export async function politicaDeExemplos(
  urls: string[],
  atual: string
): Promise<ResultadoIA> {
  const lidas = (await Promise.all(urls.map(lerPaginaWeb))).filter(
    (v): v is { url: string; texto: string } => v !== null
  )
  if (lidas.length === 0) {
    return {
      erro: "Não foi possível ler nenhum dos endereços informados. Confira se as páginas estão públicas.",
    }
  }
  const exemplos = lidas
    .map((f, i) => `TEXTO ${i + 1} (${f.url}):\n${f.texto}`)
    .join("\n\n---\n\n")

  return gerarTextoIA({
    system: SISTEMA_POLITICA,
    prompt: `Abaixo estão textos REAIS já publicados por esta entidade. Deduza deles a voz da casa — vocabulário, tom, tratamento do leitor, recorrências de estrutura — e escreva a política editorial que descreve esse jeito de escrever.

Descreva o que os textos FAZEM, não o que você acha que deveriam fazer. Se identificar um vício recorrente que atrapalha (frase longa demais, jargão, clichê), registre-o como algo a evitar.

${atual.trim() ? `Aproveite o que já existe na política atual e não contradiga o que ela define:\n${atual.trim()}\n\n` : ""}${exemplos}`,
  })
}
