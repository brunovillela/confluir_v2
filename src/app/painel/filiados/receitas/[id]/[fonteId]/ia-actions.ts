"use server"

import { revalidatePath } from "next/cache"

import { requirePermissao } from "@/lib/auth"
import { limparCpf, validarCpf } from "@/lib/cpf"
import { grupoParaRecebimento } from "@/lib/db/grupos-empresariais"
import { regrasFiliacao } from "@/lib/db/organizacao"
import {
  invalidarCacheRemessa,
  registrarFormaNoCadastro,
  resolverParaGravar,
  type ViaCasamento,
} from "@/lib/db/receitas"
import { formaRecebimento } from "@/lib/filiacao"
import { gerarJsonIA, gerarJsonIADeImagem, gerarJsonIADePdf } from "@/lib/ia"
import { imagemNaoSuportada, mimeDeImagem, textoDoArquivo } from "@/lib/ia-arquivo"
import { emParalelo } from "@/lib/paralelo"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_ITENS = 20000
/** Segmento da URL dos lançamentos sem fonte pagadora (ver actions.ts). */
const SEM_FONTE = "sem-fonte"

/** uuid → a própria fonte; "sem-fonte" → null; outra coisa → undefined (inválido). */
function fonteDoSegmento(fonteId: string): string | null | undefined {
  if (fonteId === SEM_FONTE) return null
  return UUID.test(fonteId) ? fonteId : undefined
}
/**
 * Relações grandes (as fontes pagam milhares de pessoas) são lidas EM BLOCOS
 * de linhas, em paralelo: numa chamada só, o modelo teria de reescrever cada
 * linha em JSON e esbarrava no teto de saída (~500 a 1.000 linhas) — a
 * resposta era cortada ou a lista parava no meio. O texto também era cortado
 * em 120 mil caracteres antes de ir para a IA. (15/10/2026)
 */
const LINHAS_POR_BLOCO = 200
const BLOCOS_EM_PARALELO = 8
/** Linha que parece de pagamento: tem um valor com centavos. */
const COM_VALOR = /\d[.,]\d{2}(?!\d)/

/** '1.234,56' | '1234,56' | '1234.56' → número (ou null). */
function parseValor(bruto: string): number | null {
  const v = bruto.trim()
  if (!v) return null
  const normalizado = v.includes(",")
    ? v.replace(/\./g, "").replace(",", ".")
    : v
  const n = Number(normalizado.replace(/[^\d.-]/g, ""))
  return Number.isFinite(n) ? n : null
}

export type ItemContribuicao = {
  cpf: string | null
  matriculaFonte: string | null
  nome: string | null
  valor: number
}

/** Item enriquecido só para o preview (como o filiado foi casado). */
export type PreviewContribuicao = ItemContribuicao & {
  via: ViaCasamento
}

export type EstadoExtracaoContrib = {
  itens?: PreviewContribuicao[]
  totalValor?: number
  casados?: number
  naoCasados?: number
  descartadas?: number
  /** Linhas do arquivo que parecem de pagamento (têm valor com centavos). */
  linhasComValor?: number
  /** Trechos em que a IA leu bem menos linhas do que o arquivo tinha. */
  avisos?: string[]
  erro?: string
}

const SISTEMA = `Você extrai contribuições sindicais de um relatório enviado por uma empresa (fonte pagadora). O relatório pode vir em qualquer layout, tabular ou não.
Devolva um objeto JSON no formato: { "contribuicoes": [ { "nome": "...", "cpf": "...", "matricula": "...", "valor": 0 } ] }
Os relatórios normalmente trazem NOME + MATRÍCULA na empresa + VALOR (o CPF costuma não vir).
Regras:
- Uma entrada por EMPREGADO / linha de pagamento. NÃO inclua linhas de total, subtotal, cabeçalho ou rodapé.
- "nome": nome do empregado como aparece no relatório ("" se não houver).
- "cpf": apenas os dígitos do CPF do empregado ("" se não houver).
- "matricula": matrícula do empregado na empresa/fonte ("" se não houver).
- "valor": o valor da contribuição como número (ponto decimal). NÃO invente valores.
- Inclua a linha se ela tiver ao menos NOME, CPF ou matrícula. Ignore apenas cabeçalho, total, subtotal e rodapé.
- Extraia TODAS as linhas de empregado do relatório.
- Responda APENAS com o objeto JSON.`

export async function extrairContribuicoesIa(
  _prev: EstadoExtracaoContrib,
  formData: FormData
): Promise<EstadoExtracaoContrib> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])

  const remessaId = String(formData.get("remessa_id") ?? "")
  const fonteDb = fonteDoSegmento(String(formData.get("fonte_id") ?? ""))
  if (!UUID.test(remessaId) || fonteDb === undefined) {
    return { erro: "Remessa ou fonte inválida." }
  }

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo (CSV, TXT, Excel, PDF ou imagem)." }
  }

  const mimeImagem = mimeDeImagem(arquivo.type, arquivo.name)
  if (mimeImagem) {
    // Foto/print da relação → VISÃO direto sobre a imagem.
    if (arquivo.size > 20 * 1024 * 1024) {
      return { erro: "Imagem grande demais — máximo de 20 MB." }
    }
    const extracao = await gerarJsonIADeImagem({
      system: SISTEMA,
      prompt:
        "Leia o relatório de contribuições desta empresa (foto ou print) e extraia as linhas de empregado.",
      imagemBase64: Buffer.from(await arquivo.arrayBuffer()).toString("base64"),
      mimeType: mimeImagem,
    })
    return montarPreview(extracao, fonteDb, remessaId, String(formData.get("grupo_id") ?? ""))
  }
  if (imagemNaoSuportada(arquivo.name)) {
    return {
      erro: "Formato de imagem não suportado — use JPG, PNG, WebP ou GIF.",
    }
  }

  // Planilha, CSV/TXT ou PDF digital → texto; PDF escaneado volta sem texto
  // e com os bytes, para a visão.
  const { texto, ehPdf, pdf: pdfBuffer, erro: erroLeitura } = await textoDoArquivo(arquivo)
  if (erroLeitura) return { erro: erroLeitura }

  // Digital/planilha → extrai do texto. PDF escaneado (sem texto) → VISÃO
  // nativa do modelo sobre o próprio PDF.
  let extracao
  let conferencia: Conferencia | undefined
  if (texto.length >= 20) {
    ;({ extracao, conferencia } = await extrairDoTexto(texto))
  } else if (ehPdf && pdfBuffer) {
    if (arquivo.size > 20 * 1024 * 1024) {
      return { erro: "PDF escaneado grande demais — máximo de 20 MB." }
    }
    extracao = await gerarJsonIADePdf({
      system: SISTEMA,
      prompt:
        "Leia o relatório de contribuições desta empresa (o PDF pode ser escaneado/imagem) e extraia as linhas de empregado.",
      pdfBase64: Buffer.from(pdfBuffer).toString("base64"),
    })
  } else {
    return { erro: "O arquivo está vazio ou não tem dados legíveis." }
  }

  return montarPreview(extracao, fonteDb, remessaId, String(formData.get("grupo_id") ?? ""), conferencia)
}

type Conferencia = { linhasComValor: number; avisos: string[] }

/**
 * Texto do arquivo → contribuições. Até LINHAS_POR_BLOCO linhas vai numa
 * chamada; acima disso, em blocos paralelos, cada um com as primeiras linhas
 * do arquivo só como contexto das colunas. Um bloco que falha derruba a
 * leitura inteira — melhor do que registrar uma relação pela metade.
 */
async function extrairDoTexto(
  texto: string
): Promise<{ extracao: Awaited<ReturnType<typeof gerarJsonIA>>; conferencia: Conferencia }> {
  const linhas = texto.split(/\r?\n/).filter((l) => l.trim())
  const blocos: string[][] = []
  for (let de = 0; de < linhas.length && de < MAX_ITENS; de += LINHAS_POR_BLOCO) {
    blocos.push(linhas.slice(de, de + LINHAS_POR_BLOCO))
  }
  const contexto = linhas.slice(0, 3).join("\n")

  const resultados = await emParalelo(blocos, BLOCOS_EM_PARALELO, (bloco, i) =>
    gerarJsonIA({
      system: SISTEMA,
      prompt:
        blocos.length === 1
          ? `Relatório da empresa:\n\n${bloco.join("\n")}`
          : i === 0
            ? `Trecho 1 de ${blocos.length} de um relatório maior. Extraia todas as linhas de empregado DESTE trecho:\n\n${bloco.join("\n")}`
            : `Trecho ${i + 1} de ${blocos.length} de um relatório maior.\n\nPRIMEIRAS LINHAS DO ARQUIVO — só para entender as colunas; NÃO extraia nada daqui:\n${contexto}\n\nLINHAS DESTE TRECHO — extraia todas as linhas de empregado:\n${bloco.join("\n")}`,
    })
  )

  const contribuicoes: unknown[] = []
  const avisos: string[] = []
  let linhasComValor = 0
  for (let i = 0; i < resultados.length; i++) {
    const r = resultados[i]
    const trecho = blocos.length > 1 ? `Trecho ${i + 1} de ${blocos.length}: ` : ""
    if (r.erro || !r.dados) {
      return {
        extracao: { erro: `${trecho}${r.erro ?? "Falha na extração."}` },
        conferencia: { linhasComValor: 0, avisos: [] },
      }
    }
    const lidas = Array.isArray(r.dados.contribuicoes) ? (r.dados.contribuicoes as unknown[]) : []
    contribuicoes.push(...lidas)
    const comValor = blocos[i].filter((l) => COM_VALOR.test(l)).length
    linhasComValor += comValor
    // Linhas de total também têm valor, daí a folga de 10%.
    if (comValor >= 10 && lidas.length < comValor * 0.9) {
      const primeira = i * LINHAS_POR_BLOCO + 1
      avisos.push(
        `Linhas ${primeira} a ${primeira + blocos[i].length - 1} do arquivo: a IA leu ${lidas.length} de cerca de ${comValor} linhas com valor.`
      )
    }
  }
  return { extracao: { dados: { contribuicoes } }, conferencia: { linhasComValor, avisos } }
}

/** Higieniza o JSON da IA e casa cada linha com o filiado (preview). */
async function montarPreview(
  extracao: Awaited<ReturnType<typeof gerarJsonIA>>,
  fonteDb: string | null,
  remessaId: string,
  grupoId = "",
  conferencia?: Conferencia
): Promise<EstadoExtracaoContrib> {
  const { dados, erro } = extracao
  if (erro || !dados) return { erro: erro ?? "Falha na extração." }

  const bruto = Array.isArray(dados.contribuicoes)
    ? (dados.contribuicoes as unknown[])
    : []
  if (bruto.length === 0) {
    return { erro: "A IA não encontrou contribuições neste arquivo." }
  }

  const base: ItemContribuicao[] = []
  let descartadas = 0
  for (const cru of bruto.slice(0, MAX_ITENS)) {
    const c = cru as Record<string, unknown>
    const nome = typeof c.nome === "string" ? c.nome.trim() : ""
    const cpfTxt =
      typeof c.cpf === "string" || typeof c.cpf === "number"
        ? limparCpf(String(c.cpf))
        : ""
    const cpf = cpfTxt && validarCpf(cpfTxt) ? cpfTxt : ""
    const matricula =
      typeof c.matricula === "string" || typeof c.matricula === "number"
        ? String(c.matricula).replace(/\D/g, "")
        : ""
    const valor =
      typeof c.valor === "number" ? c.valor : parseValor(String(c.valor ?? ""))

    if ((!cpf && !matricula && !nome) || valor === null || !(valor > 0)) {
      descartadas++
      continue
    }
    base.push({
      cpf: cpf || null,
      matriculaFonte: matricula || null,
      nome: nome || null,
      valor,
    })
  }

  if (base.length === 0) {
    return {
      erro: "Nenhuma contribuição válida (linhas sem nome/matrícula/CPF ou sem valor).",
    }
  }

  // Relação do grupo empresarial: a prévia casa no grupo inteiro.
  const grupo = grupoId && UUID.test(grupoId) ? await grupoParaRecebimento(grupoId) : null
  if (grupo && "erro" in grupo) return { erro: grupo.erro }
  const resolvidos = await resolverParaGravar(fonteDb, grupo, remessaId, base)
  const itens: PreviewContribuicao[] = base.map((b, i) => ({
    ...b,
    via: resolvidos[i]?.via ?? null,
  }))
  const casados = itens.filter((i) => i.via !== null).length
  const totalValor = itens.reduce((s, i) => s + i.valor, 0)

  return {
    itens,
    totalValor,
    casados,
    naoCasados: itens.length - casados,
    descartadas,
    linhasComValor: conferencia?.linhasComValor,
    avisos: conferencia?.avisos.length ? conferencia.avisos : undefined,
  }
}

export async function registrarContribuicoesIa(
  remessaId: string,
  fonteId: string,
  itens: ItemContribuicao[],
  formaEscolhida: string,
  /** Relação do grupo empresarial (contribuição centralizada). */
  grupoId?: string
): Promise<{ identificados?: number; naoEncontrados?: number; erro?: string }> {
  await requirePermissao("filiacao_receitas", ["filiacao_gestao"])
  const fonteDb = fonteDoSegmento(fonteId)
  if (!UUID.test(remessaId) || fonteDb === undefined) {
    return { erro: "Remessa ou fonte inválida." }
  }
  const forma = formaRecebimento(formaEscolhida)
  if (!forma) return { erro: "Escolha a forma de recebimento desta lista." }
  if (!fonteDb && (await regrasFiliacao()).exigeFonte) {
    return {
      erro: "Pela regra da entidade, todo recebimento fica vinculado a uma fonte pagadora — envie a lista pela fonte.",
    }
  }
  if (!Array.isArray(itens) || itens.length === 0) {
    return { erro: "Nada para registrar." }
  }

  // Re-higieniza o que veio do cliente antes de gravar.
  const limpos: ItemContribuicao[] = []
  for (const i of itens.slice(0, MAX_ITENS)) {
    const cpf = i.cpf ? limparCpf(String(i.cpf)) || null : null
    const matriculaFonte = i.matriculaFonte
      ? String(i.matriculaFonte).replace(/\D/g, "") || null
      : null
    const nome =
      typeof i.nome === "string" && i.nome.trim() ? i.nome.trim() : null
    const valor = typeof i.valor === "number" ? i.valor : NaN
    if ((!cpf && !matriculaFonte && !nome) || !(valor > 0)) continue
    limpos.push({ cpf, matriculaFonte, nome, valor })
  }
  if (limpos.length === 0) return { erro: "Nada válido para registrar." }

  const grupo = grupoId ? (UUID.test(grupoId) ? await grupoParaRecebimento(grupoId) : { erro: "Grupo inválido." }) : null
  if (grupo && "erro" in grupo) return { erro: grupo.erro }
  const resolvidos = await resolverParaGravar(fonteDb, grupo, remessaId, limpos)

  const admin = await createAdminClient()
  const empId = await tenantAtual()
  let identificados = 0
  let naoEncontrados = 0
  for (let de = 0; de < limpos.length; de += 300) {
    const lote = limpos.slice(de, de + 300)
    const { error } = await admin.from("filiacao_recebe").insert(
      lote.map((item, j) => {
        const filiadoId = resolvidos[de + j]?.filiadoId ?? null
        if (filiadoId) identificados++
        else naoEncontrados++
        return {
          remessa_id: remessaId,
          fonte_pg_id: resolvidos[de + j]?.fonteId ?? fonteDb,
          ...(grupo ? { grupo_empresarial_id: grupo.id } : {}),
          filiado_id: filiadoId,
          cpf: item.cpf,
          fonte_pg_matricula: item.matriculaFonte,
          nome: item.nome,
          valor: item.valor,
          forma_recebimento: forma,
          emp_proprietaria_id: empId,
        }
      })
    )
    if (error) return { erro: `Falha ao gravar os lançamentos: ${error.message}` }
  }
  await registrarFormaNoCadastro(
    remessaId,
    resolvidos.map((r) => r?.filiadoId ?? null),
    forma
  )

  invalidarCacheRemessa(remessaId)
  revalidatePath(`/painel/filiados/receitas/${remessaId}`)
  revalidatePath(`/painel/filiados/receitas/${remessaId}/${fonteId}`)
  if (grupo) {
    for (const f of grupo.fonteIds) revalidatePath(`/painel/filiados/receitas/${remessaId}/${f}`)
    revalidatePath(`/painel/filiados/receitas/${remessaId}/grupo/${grupo.id}`)
  }
  return { identificados, naoEncontrados }
}
