import "server-only"

import { esquemaAusente, texto } from "@/lib/db/comum"
import { funcionariosDaArea } from "@/lib/db/pessoal-area"
import { dependentesDoCadastro, obterContratoSaude, salvarBeneficiario, salvarCoparticipacao } from "@/lib/db/plano-saude"
import { type EsquemaJsonIA, gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"
import { imagemNaoSuportada, mimeDeImagem, textoDoArquivo } from "@/lib/ia-arquivo"
import {
  casarLinhas,
  linhaDaEntidade,
  sugerirPessoa,
  valorDaIA,
  type Candidato,
  type ComoCasou,
  type LinhaFatura,
  type LinhaLida,
  type PessoaParaIncluir,
} from "@/lib/plano-saude-fatura"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * FATURA DA OPERADORA (Fase 3 do plano de saúde, 25/11/2026): a IA transcreve
 * a fatura (PDF digital ou escaneado, planilha, CSV ou foto) numa linha por
 * beneficiário; o sistema casa cada linha com um beneficiário do contrato e
 * grava em pessoal_saude_faturas — sem o arquivo e sem CPF (o CPF só serve
 * para casar). O procedimento da coparticipação nunca é pedido à IA.
 */

type Linha = Record<string, unknown>

async function ctx() {
  return { admin: await createAdminClient(), emp: await tenantAtual() }
}

export type FaturaSaude = {
  id: string
  contratoId: string
  competencia: string
  arquivoNome: string | null
  total: number | null
  linhas: LinhaFatura[]
  conferidaEm: string | null
  conferidaPorNome: string | null
  observacao: string | null
  criadaEm: string
}

const COMO: ComoCasou[] = ["carteirinha", "cpf", "nome", "nome_parcial", "manual"]

function linhaGravada(l: Linha): LinhaFatura {
  const casou = texto(l.casou) as ComoCasou | null
  return {
    nome: texto(l.nome) ?? "",
    carteirinha: texto(l.carteirinha),
    mensalidade: Number(l.mensalidade ?? 0) || 0,
    coparticipacao: Number(l.coparticipacao ?? 0) || 0,
    outros: Number(l.outros ?? 0) || 0,
    outrosDescricao: texto(l.outrosDescricao),
    beneficiarioId: texto(l.beneficiarioId),
    casou: casou && COMO.includes(casou) ? casou : null,
  }
}

/** A fatura do contrato no mês (null: ainda não lida; disponivel=false: falta a migração). */
export async function obterFatura(contratoId: string, competencia: string): Promise<{ disponivel: boolean; fatura: FaturaSaude | null }> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin
    .from("pessoal_saude_faturas")
    .select("*")
    .eq("emp_proprietaria_id", emp)
    .eq("contrato_id", contratoId)
    .eq("competencia", competencia)
    .maybeSingle()
  if (error) {
    if (esquemaAusente(error)) return { disponivel: false, fatura: null }
    throw new Error(error.message)
  }
  if (!data) return { disponivel: true, fatura: null }
  let conferidaPorNome: string | null = null
  if (data.conferida_por) {
    const { data: u } = await admin.from("usuarios").select("nome_completo, nome_guerra").eq("id", data.conferida_por).maybeSingle()
    conferidaPorNome = texto(u?.nome_completo) ?? texto(u?.nome_guerra)
  }
  return {
    disponivel: true,
    fatura: {
      id: String(data.id),
      contratoId: String(data.contrato_id),
      competencia: String(data.competencia),
      arquivoNome: texto(data.arquivo_nome),
      total: data.total === null || data.total === undefined ? null : Number(data.total),
      linhas: Array.isArray(data.linhas) ? (data.linhas as Linha[]).map(linhaGravada) : [],
      conferidaEm: texto(data.conferida_em),
      conferidaPorNome,
      observacao: texto(data.observacao),
      criadaEm: String(data.created_at),
    },
  }
}

/** Beneficiários do contrato com carteirinha e CPF, para casar as linhas. */
async function candidatosDoContrato(contratoId: string): Promise<Candidato[]> {
  const completo = await obterContratoSaude(contratoId)
  if (!completo) return []
  const { admin, emp } = await ctx()
  const titulares = [...new Set(completo.beneficiarios.filter((b) => b.tipo === "titular").map((b) => b.titularId))]
  const deps = completo.beneficiarios.map((b) => b.dependenteId).filter((x): x is string => Boolean(x))
  const [us, ds] = await Promise.all([
    titulares.length ? admin.from("usuarios").select("id, cpf").in("id", titulares) : Promise.resolve({ data: [] as Linha[] }),
    deps.length ? admin.from("pessoal_dependentes").select("id, cpf").eq("emp_proprietaria_id", emp).in("id", deps) : Promise.resolve({ data: [] as Linha[] }),
  ])
  const cpfU = new Map(((us.data ?? []) as Linha[]).map((u) => [String(u.id), texto(u.cpf)]))
  const cpfD = new Map(((ds.data ?? []) as Linha[]).map((d) => [String(d.id), texto(d.cpf)]))
  return completo.beneficiarios.map((b) => ({
    id: b.id,
    nome: b.nome,
    carteirinha: b.carteirinha,
    cpf: b.tipo === "titular" ? (cpfU.get(b.titularId) ?? null) : b.dependenteId ? (cpfD.get(b.dependenteId) ?? b.cpf) : b.cpf,
  }))
}

// ── Leitura por IA ──────────────────────────────────────────────────────────

const ESQUEMA: EsquemaJsonIA = {
  nome: "fatura_plano_saude",
  schema: {
    type: "object",
    additionalProperties: false,
    required: ["competencia", "total", "linhas"],
    properties: {
      competencia: { type: ["string", "null"], description: "Mês de referência da fatura, AAAA-MM." },
      total: { type: ["number", "null"], description: "Valor total da fatura." },
      linhas: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: ["nome", "carteirinha", "cpf", "mensalidade", "coparticipacao", "outros", "outros_descricao"],
          properties: {
            nome: { type: "string" },
            carteirinha: { type: ["string", "null"] },
            cpf: { type: ["string", "null"] },
            mensalidade: { type: "number" },
            coparticipacao: { type: "number" },
            outros: { type: "number" },
            outros_descricao: { type: ["string", "null"] },
          },
        },
      },
    },
  },
}

const SISTEMA = `Você transcreve a FATURA de uma operadora de plano de saúde coletivo, cobrada de uma entidade empregadora.
Devolva UMA linha por beneficiário (titular, dependente ou agregado), com:
- nome: como está na fatura;
- carteirinha: o número da carteirinha/cartão/código do beneficiário, se houver (senão null);
- cpf: o CPF do beneficiário, se houver (senão null);
- mensalidade: o valor da mensalidade/prêmio do beneficiário no mês (some o pró-rata da mensalidade se vier junto);
- coparticipacao: o TOTAL de coparticipação/franquia do beneficiário no mês (some as linhas de procedimentos; 0 se não houver);
- outros: a soma de outros valores do beneficiário (taxas, pró-rata em separado, ajustes; desconto vai negativo; 0 se não houver);
- outros_descricao: uma descrição curta desses outros valores (ex.: "Pró-rata de inclusão", "Taxa de cartão"), ou null.
NUNCA transcreva o nome do procedimento, exame, consulta, médico ou prestador da coparticipação: só o valor total.
Se o mesmo beneficiário aparecer em mais de um lugar, junte numa linha só.
Linhas da entidade que não são de um beneficiário (taxa administrativa geral, por exemplo) vão como uma linha com nome "Entidade" e o valor em outros.
Valores em número com ponto decimal (1234.56). competencia: o mês de referência (AAAA-MM) e total: o valor total da fatura, se aparecerem.`

const MAX_VISAO = 20 * 1024 * 1024
const BLOCO = 14000

function lerResposta(d: Record<string, unknown>): { competencia: string | null; total: number | null; linhas: LinhaLida[] } {
  const linhas = (Array.isArray(d.linhas) ? d.linhas : []) as Linha[]
  return {
    competencia: texto(d.competencia),
    total: d.total === null || d.total === undefined ? null : valorDaIA(d.total),
    linhas: linhas
      .map((l) => ({
        nome: (texto(l.nome) ?? "").trim(),
        carteirinha: texto(l.carteirinha),
        cpf: texto(l.cpf),
        mensalidade: valorDaIA(l.mensalidade),
        coparticipacao: valorDaIA(l.coparticipacao),
        outros: valorDaIA(l.outros),
        outrosDescricao: texto(l.outros_descricao),
      }))
      .filter((l) => l.nome && (l.mensalidade || l.coparticipacao || l.outros)),
  }
}

/** Texto grande vai em blocos de linhas inteiras. */
function blocos(t: string): string[] {
  const saida: string[] = []
  let atual = ""
  for (const linha of t.split("\n")) {
    if (atual.length + linha.length > BLOCO && atual) {
      saida.push(atual)
      atual = ""
    }
    atual += linha + "\n"
  }
  if (atual.trim()) saida.push(atual)
  return saida
}

export type ResultadoLeitura = { erro?: string; linhas?: number; casadas?: number; competenciaLida?: string | null }

/** Lê a fatura, casa as linhas e grava (substitui a do mesmo contrato e mês). */
export async function lerEGravarFatura(
  contratoId: string,
  competencia: string,
  arquivo: File,
  usuarioId: string
): Promise<ResultadoLeitura> {
  const processo = "pessoal.plano_saude_fatura"
  const prompt = (trecho?: string) =>
    `Fatura do plano de saúde, mês esperado ${competencia}.${trecho ? `\n\nConteúdo:\n${trecho}` : ""}`
  let lido: { competencia: string | null; total: number | null; linhas: LinhaLida[] } | null = null
  const mime = mimeDeImagem(arquivo.type, arquivo.name)
  if (imagemNaoSuportada(arquivo.name)) return { erro: "Formato de imagem não suportado: envie PDF, planilha, CSV, JPG ou PNG." }
  if (mime) {
    if (arquivo.size > MAX_VISAO) return { erro: "Imagem grande demais: até 20 MB." }
    const r = await gerarJsonIADeImagem({
      processo,
      system: SISTEMA,
      prompt: prompt(),
      imagemBase64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"),
      mimeType: mime,
      esquema: ESQUEMA,
    })
    if (r.erro || !r.dados) return { erro: r.erro ?? "Falha na leitura." }
    lido = lerResposta(r.dados)
  } else {
    const { texto: t, ehPdf, pdf, erro } = await textoDoArquivo(arquivo)
    if (erro) return { erro }
    if (t.length >= 40) {
      const partes = blocos(t)
      const juntas: LinhaLida[] = []
      let total: number | null = null
      let comp: string | null = null
      for (const [i, b] of partes.entries()) {
        const r = await gerarJsonIA({ processo, system: SISTEMA, prompt: prompt(b), esquema: ESQUEMA })
        if (r.erro || !r.dados) return { erro: `${partes.length > 1 ? `Trecho ${i + 1} de ${partes.length}: ` : ""}${r.erro ?? "Falha na leitura."}` }
        const p = lerResposta(r.dados)
        juntas.push(...p.linhas)
        total = p.total ?? total
        comp = comp ?? p.competencia
      }
      lido = { competencia: comp, total, linhas: juntas }
    } else if (ehPdf && pdf) {
      if (arquivo.size > MAX_VISAO) return { erro: "PDF escaneado grande demais: até 20 MB." }
      const r = await gerarJsonIADePdf({
        processo,
        system: SISTEMA,
        prompt: prompt(),
        pdfBase64: Buffer.from(pdf).toString("base64"),
        esquema: ESQUEMA,
      })
      if (r.erro || !r.dados) return { erro: r.erro ?? "Falha na leitura." }
      lido = lerResposta(r.dados)
    } else {
      return { erro: "O arquivo está vazio ou não tem texto." }
    }
  }
  if (!lido.linhas.length) return { erro: "Não achei linhas de beneficiários na fatura. Confira o arquivo." }
  const linhas = casarLinhas(lido.linhas, await candidatosDoContrato(contratoId))
  const { admin, emp } = await ctx()
  const { error } = await admin.from("pessoal_saude_faturas").upsert(
    {
      emp_proprietaria_id: emp,
      contrato_id: contratoId,
      competencia,
      arquivo_nome: arquivo.name.slice(0, 200),
      total: lido.total,
      linhas,
      conferida_em: null,
      conferida_por: null,
      criado_por: usuarioId,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "contrato_id,competencia" }
  )
  if (error) return { erro: esquemaAusente(error) ? "A fatura ainda não está ligada nesta entidade (falta a atualização do banco)." : error.message }
  return { linhas: linhas.length, casadas: linhas.filter((l) => l.beneficiarioId).length, competenciaLida: lido.competencia }
}

// ── Ajustes ─────────────────────────────────────────────────────────────────

async function regravarLinhas(faturaId: string, mudar: (ls: LinhaFatura[]) => LinhaFatura[] | string): Promise<{ erro?: string }> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin.from("pessoal_saude_faturas").select("linhas").eq("emp_proprietaria_id", emp).eq("id", faturaId).maybeSingle()
  if (error || !data) return { erro: error?.message ?? "Fatura não encontrada." }
  const novas = mudar(Array.isArray(data.linhas) ? (data.linhas as Linha[]).map(linhaGravada) : [])
  if (typeof novas === "string") return { erro: novas }
  const { error: e2 } = await admin
    .from("pessoal_saude_faturas")
    .update({ linhas: novas, updated_at: new Date().toISOString() })
    .eq("emp_proprietaria_id", emp)
    .eq("id", faturaId)
  return e2 ? { erro: e2.message } : {}
}

/** Casa à mão a linha `indice` com um beneficiário (null desfaz). */
export async function casarLinhaManual(faturaId: string, indice: number, beneficiarioId: string | null): Promise<{ erro?: string }> {
  return regravarLinhas(faturaId, (ls) => {
    if (!ls[indice]) return "Linha não encontrada."
    // O mesmo beneficiário pode ter mais de uma linha (mensalidade e
    // coparticipação separadas): a comparação soma.
    ls[indice] = { ...ls[indice], beneficiarioId, casou: beneficiarioId ? "manual" : null }
    return ls
  })
}

export async function marcarFaturaConferida(faturaId: string, usuarioId: string, observacao: string | null, desfazer: boolean): Promise<{ erro?: string }> {
  const { admin, emp } = await ctx()
  const { error } = await admin
    .from("pessoal_saude_faturas")
    .update(
      desfazer
        ? { conferida_em: null, conferida_por: null, updated_at: new Date().toISOString() }
        : { conferida_em: new Date().toISOString(), conferida_por: usuarioId, observacao, updated_at: new Date().toISOString() }
    )
    .eq("emp_proprietaria_id", emp)
    .eq("id", faturaId)
  return error ? { erro: error.message } : {}
}

export async function apagarFatura(faturaId: string): Promise<{ erro?: string }> {
  const { admin, emp } = await ctx()
  const { error } = await admin.from("pessoal_saude_faturas").delete().eq("emp_proprietaria_id", emp).eq("id", faturaId)
  return error ? { erro: error.message } : {}
}

/** Lança a coparticipação da fatura em cada titular (substitui o valor do mês). */
export async function lancarCopartDaFatura(
  contratoId: string,
  competencia: string,
  porTitular: Map<string, number>,
  usuarioId: string
): Promise<{ erro?: string; lancados: number }> {
  let lancados = 0
  for (const [titularId, valor] of porTitular) {
    const r = await salvarCoparticipacao(contratoId, titularId, competencia, valor > 0 ? valor : null, usuarioId)
    if (r.erro) return { erro: r.erro, lancados }
    lancados++
  }
  return { lancados }
}

// ── Carga inicial: incluir no plano quem está na fatura ─────────────────────

/** Funcionários ativos e os dependentes ativos deles, para incluir no plano a partir da fatura. */
export async function pessoasParaIncluir(): Promise<PessoaParaIncluir[]> {
  const area = (await funcionariosDaArea()).filter((f) => f.ativo)
  const deps = await dependentesDoCadastro(area.map((f) => f.usuarioId))
  const nomeDe = new Map(area.map((f) => [f.usuarioId, f.nome]))
  return [
    ...area.map((f) => ({ chave: `titular:${f.usuarioId}`, nome: f.nome, rotulo: "funcionário" })),
    ...deps
      .filter((d) => d.ativo)
      .map((d) => ({
        chave: `dependente:${d.id}:${d.funcionarioId}`,
        nome: d.nome,
        rotulo: `${d.grau ?? "dependente"} de ${nomeDe.get(d.funcionarioId) ?? "funcionário"}`,
      })),
  ].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"))
}

/** Inclui no plano a pessoa da chave (titular:… ou dependente:…) e casa a linha `indice` com ela. */
export async function incluirLinhaNoPlano(
  faturaId: string,
  indice: number,
  pessoa: string,
  produtoId: string,
  inclusao: string,
  usuarioId: string
): Promise<{ erro?: string }> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin.from("pessoal_saude_faturas").select("linhas").eq("emp_proprietaria_id", emp).eq("id", faturaId).maybeSingle()
  if (error || !data) return { erro: error?.message ?? "Fatura não encontrada." }
  const linha = (Array.isArray(data.linhas) ? (data.linhas as Linha[]) : []).map(linhaGravada)[indice]
  if (!linha) return { erro: "Linha não encontrada." }
  if (linha.beneficiarioId) return { erro: "Esta linha já está casada com alguém do plano." }
  const [tipo, a, b] = pessoa.split(":")
  const base = { produto_id: produtoId, carteirinha: linha.carteirinha, inclusao }
  const dados =
    tipo === "titular" && a
      ? { ...base, titular_id: a, tipo: "titular", condicao: "ativo" }
      : tipo === "dependente" && a && b
        ? { ...base, titular_id: b, tipo: "dependente", dependente_id: a }
        : null
  if (!dados) return { erro: "Escolha quem é." }
  const r = await salvarBeneficiario(null, dados, usuarioId)
  if (r.erro || !r.id) return { erro: r.erro ?? "Não consegui incluir." }
  return casarLinhaManual(faturaId, indice, r.id)
}

/** Inclui de uma vez todas as linhas sem beneficiário que têm uma pessoa sugerida pelo nome. */
export async function incluirSugeridosNoPlano(
  faturaId: string,
  produtoId: string,
  inclusao: string,
  usuarioId: string
): Promise<{ erro?: string; incluidos: number; semSugestao: number }> {
  const { admin, emp } = await ctx()
  const { data, error } = await admin.from("pessoal_saude_faturas").select("linhas").eq("emp_proprietaria_id", emp).eq("id", faturaId).maybeSingle()
  if (error || !data) return { erro: error?.message ?? "Fatura não encontrada.", incluidos: 0, semSugestao: 0 }
  const linhas = (Array.isArray(data.linhas) ? (data.linhas as Linha[]) : []).map(linhaGravada)
  const pessoas = await pessoasParaIncluir()
  const usadas = new Set<string>()
  let incluidos = 0
  let semSugestao = 0
  for (const [i, l] of linhas.entries()) {
    if (l.beneficiarioId || linhaDaEntidade(l)) continue
    const chave = sugerirPessoa(l.nome, pessoas.filter((p) => !usadas.has(p.chave)))
    if (!chave) {
      semSugestao++
      continue
    }
    const r = await incluirLinhaNoPlano(faturaId, i, chave, produtoId, inclusao, usuarioId)
    if (r.erro) return { erro: `${l.nome}: ${r.erro}`, incluidos, semSugestao }
    usadas.add(chave)
    incluidos++
  }
  return { incluidos, semSugestao }
}
