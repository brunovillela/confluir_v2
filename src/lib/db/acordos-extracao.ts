import "server-only"

import { extractText, getDocumentProxy } from "unpdf"

import {
  categoriaDoTema,
  ROTULO_TEMA,
  TEMAS_CLAUSULA,
  temaClausula,
  type TemaClausula,
} from "@/lib/acordos-constantes"
import { separarClausulas, type ClausulaSeparada } from "@/lib/acordos-separar"
import { esquemaAusente } from "@/lib/db/comum"
import { gerarJsonIA } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"

/**
 * Fase 1 do comparador: o PDF do acordo vira texto e cláusulas. A separação é
 * por regra (texto literal do documento); a IA só sugere tema e resumo.
 * Ver supabase/acordos-texto-clausulas.sql.
 */

export const AVISO_SQL_TEXTO =
  "A extração de cláusulas usa colunas novas — rode supabase/acordos-texto-clausulas.sql no Supabase."

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

// ── Envio direto do PDF ao armazenamento (sem o limite de 4 MB da action) ───

export async function criarEnvioDocumento(
  acordoId: string
): Promise<{ caminho?: string; token?: string; erro?: string }> {
  const admin = await createAdminClient()
  const { data: a } = await admin
    .from("acordo_coletivo")
    .select("id")
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", await tenantAtual())
    .maybeSingle()
  if (!a) return { erro: "Acordo não encontrado." }
  const caminho = `${acordoId}/${Date.now()}.pdf`
  const { data, error } = await admin.storage.from("acordos").createSignedUploadUrl(caminho)
  if (error || !data) return { erro: `Não foi possível preparar o envio: ${error?.message ?? "?"}` }
  return { caminho, token: data.token }
}

export async function confirmarDocumento(acordoId: string, caminho: string): Promise<{ erro?: string }> {
  if (!caminho.startsWith(`${acordoId}/`) || !caminho.endsWith(".pdf")) return { erro: "Arquivo inválido." }
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: antes } = await admin
    .from("acordo_coletivo")
    .select("documento_url")
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  const { error } = await admin
    .from("acordo_coletivo")
    .update({ documento_url: caminho, updated_at: new Date().toISOString() })
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", empId)
  if (error) return { erro: `Não foi possível gravar o documento: ${error.message}` }
  // O PDF trocado não fica órfão no armazenamento.
  const anterior = typeof antes?.documento_url === "string" ? antes.documento_url : null
  if (anterior && anterior !== caminho) await admin.storage.from("acordos").remove([anterior])
  return {}
}

// ── Extração ─────────────────────────────────────────────────────────────────

async function textoPorPagina(pdf: Uint8Array): Promise<string[]> {
  const doc = await getDocumentProxy(pdf)
  const { text } = await extractText(doc, { mergePages: false })
  return Array.isArray(text) ? text : [text]
}

const SYSTEM_TEMAS = `Você classifica cláusulas de acordos coletivos de trabalho brasileiros (ACT/CCT).
Para cada cláusula, devolva o TEMA (uma das chaves abaixo) e um RESUMO de uma linha (até 160 caracteres), em português, citando os números que importam (percentuais, valores em R$, prazos) quando houver. Não invente: se a cláusula não traz número, não cite número.
Temas: ${TEMAS_CLAUSULA.map((t) => `${t.chave} = ${t.rotulo}`).join("; ")}.`

/** Tema e resumo sugeridos pela IA, em lotes. Falha na IA → segue sem (tema "outro"). */
async function classificar(
  clausulas: ClausulaSeparada[]
): Promise<{ porIndice: Map<number, { tema: TemaClausula; resumo: string | null }>; aviso: string | null }> {
  const porIndice = new Map<number, { tema: TemaClausula; resumo: string | null }>()
  const LOTE = 20
  const lotes: number[][] = []
  for (let de = 0; de < clausulas.length; de += LOTE) {
    lotes.push(clausulas.slice(de, de + LOTE).map((_, k) => de + k))
  }
  const falhas: string[] = []
  await Promise.all(
    lotes.map(async (indices) => {
      const itens = indices.map((i) => ({
        i,
        titulo: clausulas[i].titulo,
        grupo: clausulas[i].grupo,
        // Texto longo: o começo basta para tema e resumo.
        texto: clausulas[i].texto.slice(0, 2500),
      }))
      const { dados, erro } = await gerarJsonIA({
        system: SYSTEM_TEMAS,
        prompt: `Classifique estas cláusulas. Responda {"itens":[{"i":<número>,"tema":"<chave>","resumo":"<texto>"}]}.\n\n${JSON.stringify(itens)}`,
      })
      if (erro || !dados) {
        falhas.push(erro ?? "sem resposta")
        return
      }
      const lista = Array.isArray(dados.itens) ? (dados.itens as Record<string, unknown>[]) : []
      for (const it of lista) {
        const i = Number(it.i)
        if (!indices.includes(i)) continue
        porIndice.set(i, {
          tema: temaClausula(it.tema) ?? "outro",
          resumo: typeof it.resumo === "string" && it.resumo.trim() ? it.resumo.trim().slice(0, 240) : null,
        })
      }
    })
  )
  return {
    porIndice,
    aviso: falhas.length
      ? `A IA não classificou ${falhas.length} de ${lotes.length} lote(s) (${falhas[0]}). Essas cláusulas ficaram com tema "${ROTULO_TEMA.outro}".`
      : null,
  }
}

export type ResultadoExtracao = {
  erro?: string
  clausulas?: number
  avisos?: string[]
}

/**
 * Lê o PDF guardado do acordo, separa as cláusulas, classifica e GRAVA —
 * substituindo as cláusulas atuais do acordo.
 */
export async function extrairClausulasDoAcordo(acordoId: string): Promise<ResultadoExtracao> {
  if (!UUID.test(acordoId)) return { erro: "Acordo inválido." }
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: a } = await admin
    .from("acordo_coletivo")
    .select("id, documento_url")
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!a) return { erro: "Acordo não encontrado." }
  if (!a.documento_url) return { erro: "Envie o PDF do acordo antes de extrair as cláusulas." }

  const { data: arquivo, error: erroDown } = await admin.storage.from("acordos").download(String(a.documento_url))
  if (erroDown || !arquivo) return { erro: `Não foi possível abrir o PDF: ${erroDown?.message ?? "?"}` }

  let paginas: string[]
  try {
    paginas = await textoPorPagina(new Uint8Array(await arquivo.arrayBuffer()))
  } catch (e) {
    return { erro: `Não foi possível ler o PDF: ${e instanceof Error ? e.message : "?"}` }
  }
  const total = paginas.join("").trim().length
  if (total < 150 * paginas.length) {
    return {
      erro: "Este PDF parece escaneado (imagem, sem texto selecionável). A leitura de PDF escaneado ainda não está disponível — se tiver a versão digital do acordo, envie ela.",
    }
  }

  const sep = separarClausulas(paginas)
  if (sep.clausulas.length === 0) {
    return {
      erro: "Não encontrei cláusulas no documento (nenhum cabeçalho “CLÁUSULA …” nem seções numeradas). Confira se é o acordo mesmo.",
    }
  }

  const avisos: string[] = []
  if (sep.lacunas.length) {
    avisos.push(
      `O documento pula a numeração em: ${sep.lacunas.join(", ")}. Confira no PDF se essas cláusulas não existem mesmo.`
    )
  }
  const { porIndice, aviso } = await classificar(sep.clausulas)
  if (aviso) avisos.push(aviso)

  // Substitui as cláusulas do acordo pelas extraídas.
  const { error: erroDel } = await admin
    .from("acordo_clausulas")
    .delete()
    .eq("acordo_id", acordoId)
    .eq("emp_proprietaria_id", empId)
  if (erroDel) return { erro: `Não foi possível limpar as cláusulas atuais: ${erroDel.message}` }

  const linhas = sep.clausulas.map((c, i) => {
    const tema = porIndice.get(i)?.tema ?? "outro"
    return {
      acordo_id: acordoId,
      emp_proprietaria_id: empId,
      numero: c.rotuloNumero,
      numero_ordem: c.numero,
      titulo: c.titulo || null,
      texto: c.texto,
      grupo: c.grupo,
      tema,
      categoria: categoriaDoTema(tema),
      resumo: porIndice.get(i)?.resumo ?? null,
      origem: "extracao",
      ordem: i,
    }
  })
  for (let de = 0; de < linhas.length; de += 200) {
    const { error } = await admin.from("acordo_clausulas").insert(linhas.slice(de, de + 200))
    if (error) {
      return { erro: esquemaAusente(error) ? AVISO_SQL_TEXTO : `Não foi possível gravar as cláusulas: ${error.message}` }
    }
  }

  const { error: erroAcordo } = await admin
    .from("acordo_coletivo")
    .update({
      texto_integral: paginas.join("\n"),
      preambulo: sep.preambulo || null,
      anexos: sep.anexos || null,
      extracao_em: new Date().toISOString(),
      extracao_avisos: avisos.length ? avisos.join("\n") : null,
      clausulas_revisadas_em: null,
      clausulas_revisadas_por_id: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", empId)
  if (erroAcordo) return { erro: esquemaAusente(erroAcordo) ? AVISO_SQL_TEXTO : erroAcordo.message }

  return { clausulas: linhas.length, avisos }
}

// ── Revisão ──────────────────────────────────────────────────────────────────

export async function salvarClausula(
  id: string,
  dados: { numero: string | null; titulo: string | null; texto: string; tema: TemaClausula }
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const numeroOrdem = Number((dados.numero ?? "").replace(/\D/g, "")) || null
  const { error, count } = await admin
    .from("acordo_clausulas")
    .update(
      {
        numero: dados.numero,
        titulo: dados.titulo,
        texto: dados.texto,
        tema: dados.tema,
        categoria: categoriaDoTema(dados.tema),
        ...(numeroOrdem ? { numero_ordem: numeroOrdem } : {}),
      },
      { count: "exact" }
    )
    .eq("id", id)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_TEXTO : error.message }
  if (count === 0) return { erro: "Cláusula não encontrada." }
  return {}
}

/** Junta a cláusula com a seguinte (a separação cortou onde não devia). */
export async function juntarComProxima(id: string): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const empId = await tenantAtual()
  const { data: c } = await admin
    .from("acordo_clausulas")
    .select("id, acordo_id, ordem, texto")
    .eq("id", id)
    .eq("emp_proprietaria_id", empId)
    .maybeSingle()
  if (!c) return { erro: "Cláusula não encontrada." }
  const { data: prox } = await admin
    .from("acordo_clausulas")
    .select("id, numero, titulo, texto")
    .eq("acordo_id", c.acordo_id)
    .eq("emp_proprietaria_id", empId)
    .gt("ordem", c.ordem)
    .order("ordem", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!prox) return { erro: "Esta é a última cláusula." }
  const cabecalho = [prox.numero ? `CLÁUSULA ${prox.numero}` : null, prox.titulo].filter(Boolean).join(" – ")
  const texto = [c.texto ?? "", cabecalho, prox.texto ?? ""].filter((t) => t.trim()).join("\n\n")
  const { error } = await admin.from("acordo_clausulas").update({ texto }).eq("id", id).eq("emp_proprietaria_id", empId)
  if (error) return { erro: error.message }
  await admin.from("acordo_clausulas").delete().eq("id", prox.id).eq("emp_proprietaria_id", empId)
  return {}
}

export async function marcarClausulasRevisadas(
  acordoId: string,
  usuarioId: string,
  revisadas: boolean
): Promise<{ erro?: string }> {
  const admin = await createAdminClient()
  const { error } = await admin
    .from("acordo_coletivo")
    .update({
      clausulas_revisadas_em: revisadas ? new Date().toISOString() : null,
      clausulas_revisadas_por_id: revisadas ? usuarioId : null,
    })
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  if (error) return { erro: esquemaAusente(error) ? AVISO_SQL_TEXTO : error.message }
  return {}
}
