import "server-only"

import { randomUUID } from "node:crypto"

import { TIPOS_ACORDO, type TipoAcordo } from "@/lib/acordos-constantes"
import { separarClausulas } from "@/lib/acordos-separar"
import { textoPorPagina } from "@/lib/db/acordos-extracao"
import { listarFontesPagadoras } from "@/lib/db/fontes"
import { gerarJsonIA, gerarJsonIADePdf } from "@/lib/ia"
import { createAdminClient } from "@/lib/supabase/admin"
import { tenantAtual } from "@/lib/tenant"
import { semAcento } from "@/lib/texto"

/**
 * Novo acordo a partir do PDF (09/10/2026). O PDF sobe direto ao
 * armazenamento como RASCUNHO (sem o limite de 4 MB das actions); a IA lê o
 * documento e sugere os dados do acordo para o formulário; ao criar, o
 * rascunho vira o documento do acordo e as cláusulas são separadas pela
 * extração que já existe (acordos-extracao.ts).
 */

const PASTA = "rascunhos"
const MAX_TEXTO_IA = 14_000
/** Teto para mandar o PDF inteiro à IA quando ele é escaneado. */
const MAX_PDF_IA = 15 * 1024 * 1024

async function prefixoDoTenant(): Promise<string> {
  return `${PASTA}/${await tenantAtual()}/`
}

export async function criarEnvioRascunho(): Promise<{
  caminho?: string
  token?: string
  erro?: string
}> {
  const caminho = `${await prefixoDoTenant()}${randomUUID()}.pdf`
  const admin = await createAdminClient()
  const { data, error } = await admin.storage.from("acordos").createSignedUploadUrl(caminho)
  if (error || !data) return { erro: `Não foi possível preparar o envio: ${error?.message ?? "?"}` }
  return { caminho, token: data.token }
}

async function rascunhoValido(caminho: string): Promise<boolean> {
  return (
    caminho.startsWith(await prefixoDoTenant()) &&
    /^[0-9a-f-]{36}\.pdf$/i.test(caminho.split("/").pop() ?? "")
  )
}

export type DadosLidos = {
  tipo: TipoAcordo | null
  titulo: string | null
  numero_registro: string | null
  data_base: string | null
  vigencia_inicio: string | null
  vigencia_fim: string | null
  abrangencia: string | null
  /** Empregadores reconhecidos entre as fontes cadastradas. */
  fonteIds: string[]
  /** Empresas citadas que não estão cadastradas como fonte. */
  empresasSemCadastro: string[]
  /** Quantas cláusulas a separação encontrou (prévia; nada é gravado ainda). */
  clausulas: number
  escaneado: boolean
  avisos: string[]
}

const SISTEMA = `Você lê acordos coletivos de trabalho brasileiros (ACT — entre sindicato e empresa; CCT — entre sindicatos de trabalhadores e patronal) e extrai os dados do cadastro.
Devolva um JSON com:
- "tipo": "act" ou "cct" (ou null se não der para saber).
- "titulo": título curto para a lista, no padrão "ACT 2025/2027 — <empresa>" ou "CCT 2025/2026 — <categoria>"; aditivo/termo aditivo deixe claro no título.
- "numero_registro": número de registro no MTE / Mediador (ex.: "RJ001234/2025") se aparecer; senão null.
- "data_base": mês da data-base da categoria, por extenso ("Setembro"), se o documento disser; senão null.
- "vigencia_inicio" e "vigencia_fim": datas no formato AAAA-MM-DD, da cláusula de vigência; se só houver mês/ano, use o primeiro dia (início) e o último dia (término) do mês. null se não houver.
- "abrangencia": uma ou duas frases dizendo quem o acordo cobre (empresas, base territorial, categorias).
- "empresas": lista das EMPRESAS EMPREGADORAS signatárias/abrangidas (não inclua sindicatos nem federações), cada uma {"nome": "...", "cnpj": "só dígitos ou null"}.
Use só o que está no documento. Não invente.`

const s = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : null
const data = (v: unknown): string | null => {
  const t = s(v)
  return t && /^\d{4}-\d{2}-\d{2}$/.test(t) ? t : null
}

/** Trechos que importam para o cadastro: começo, cláusulas de vigência e fim. */
function trechosParaIA(paginas: string[]): string {
  const sep = separarClausulas(paginas)
  const chave = /vig[eê]ncia|data[- ]?base|abrang[eê]ncia|prazo de dura/i
  const clausulas = sep.clausulas
    .filter((c) => chave.test(c.titulo ?? "") || chave.test(c.texto.slice(0, 200)))
    .slice(0, 4)
    .map((c) => `CLÁUSULA ${c.rotuloNumero} — ${c.titulo}\n${c.texto.slice(0, 1500)}`)
  const inicio = (sep.preambulo || paginas.slice(0, 2).join("\n")).slice(0, 6000)
  const fim = paginas.slice(-2).join("\n").slice(-3000)
  return [
    "== INÍCIO DO DOCUMENTO ==",
    inicio,
    "== CLÁUSULAS DE VIGÊNCIA/ABRANGÊNCIA ==",
    clausulas.join("\n\n") || "(não encontradas)",
    "== FIM DO DOCUMENTO ==",
    fim,
  ]
    .join("\n")
    .slice(0, MAX_TEXTO_IA)
}

const normal = (t: string) =>
  semAcento(t.toLowerCase())
    .replace(/\b(s\.?\s?a\.?|ltda\.?|me|epp|eireli|cia\.?)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim()

/** Casa as empresas citadas com as fontes cadastradas: CNPJ, depois nome. */
async function casarEmpresas(
  empresas: { nome: string; cnpj: string | null }[]
): Promise<{ fonteIds: string[]; semCadastro: string[] }> {
  if (empresas.length === 0) return { fonteIds: [], semCadastro: [] }
  const fontes = (await listarFontesPagadoras()).filter((f) => f.inativa !== true)
  const ids = new Set<string>()
  const semCadastro: string[] = []
  for (const e of empresas) {
    const cnpj = (e.cnpj ?? "").replace(/\D/g, "")
    const raiz = cnpj.length === 14 ? cnpj.slice(0, 8) : null
    const nome = normal(e.nome)
    const achada =
      (raiz && fontes.find((f) => (f.cnpj_cpf ?? "").replace(/\D/g, "").startsWith(raiz))) ||
      fontes.find((f) =>
        [f.nome_fantasia, f.nome_razao].some((n) => {
          const m = n ? normal(n) : ""
          return m.length >= 4 && nome.length >= 4 && (m === nome || nome.includes(m) || m.includes(nome))
        })
      )
    if (achada) ids.add(achada.id)
    else semCadastro.push(e.nome)
  }
  return { fonteIds: [...ids], semCadastro }
}

export async function lerDadosDoRascunho(
  caminho: string
): Promise<{ dados?: DadosLidos; erro?: string }> {
  if (!(await rascunhoValido(caminho))) return { erro: "Arquivo inválido." }
  const admin = await createAdminClient()
  const { data: arquivo, error } = await admin.storage.from("acordos").download(caminho)
  if (error || !arquivo) return { erro: `Não foi possível abrir o PDF: ${error?.message ?? "?"}` }
  const bytes = new Uint8Array(await arquivo.arrayBuffer())

  let paginas: string[]
  try {
    paginas = await textoPorPagina(bytes.slice())
  } catch (e) {
    return { erro: `Não foi possível ler o PDF: ${e instanceof Error ? e.message : "?"}` }
  }
  const escaneado = paginas.join("").trim().length < 150 * paginas.length
  const avisos: string[] = []

  let ia
  if (!escaneado) {
    ia = await gerarJsonIA({ system: SISTEMA, prompt: trechosParaIA(paginas) })
  } else if (bytes.byteLength <= MAX_PDF_IA) {
    // Sem texto selecionável: a IA lê a imagem do PDF só para o cadastro.
    ia = await gerarJsonIADePdf({
      system: SISTEMA,
      prompt: "Extraia os dados do cadastro deste acordo.",
      pdfBase64: Buffer.from(bytes).toString("base64"),
    })
    avisos.push(
      "O PDF é escaneado (imagem): a IA leu os dados do acordo, mas as cláusulas não podem ser separadas automaticamente."
    )
  } else {
    return {
      erro: "O PDF é escaneado (imagem) e grande demais para a IA ler. Preencha os dados à mão ou envie a versão digital.",
    }
  }
  if (ia.erro || !ia.dados) {
    return { erro: `A IA não conseguiu ler o acordo agora (${ia.erro ?? "sem resposta"}). Preencha os dados à mão.` }
  }
  const d = ia.dados

  const tipoBruto = s(d.tipo)?.toLowerCase()
  const empresas = (Array.isArray(d.empresas) ? d.empresas : [])
    .map((e) => (e && typeof e === "object" ? (e as Record<string, unknown>) : {}))
    .map((e) => ({ nome: s(e.nome) ?? "", cnpj: s(e.cnpj) }))
    .filter((e) => e.nome)
  const { fonteIds, semCadastro } = await casarEmpresas(empresas)

  const clausulas = escaneado ? 0 : separarClausulas(paginas).clausulas.length
  if (!escaneado && clausulas === 0) {
    avisos.push("Não encontrei cláusulas numeradas no documento — confira se é o acordo mesmo.")
  }

  return {
    dados: {
      tipo: TIPOS_ACORDO.some((t) => t.chave === tipoBruto) ? (tipoBruto as TipoAcordo) : null,
      titulo: s(d.titulo),
      numero_registro: s(d.numero_registro),
      data_base: s(d.data_base),
      vigencia_inicio: data(d.vigencia_inicio),
      vigencia_fim: data(d.vigencia_fim),
      abrangencia: s(d.abrangencia),
      fonteIds,
      empresasSemCadastro: semCadastro,
      clausulas,
      escaneado,
      avisos,
    },
  }
}

/** O rascunho vira o documento do acordo recém-criado. */
export async function adotarRascunho(
  acordoId: string,
  caminho: string
): Promise<{ erro?: string }> {
  if (!(await rascunhoValido(caminho))) return { erro: "Arquivo inválido." }
  const admin = await createAdminClient()
  const destino = `${acordoId}/${Date.now()}.pdf`
  const { error: erroMove } = await admin.storage.from("acordos").move(caminho, destino)
  if (erroMove) return { erro: `Não foi possível guardar o PDF: ${erroMove.message}` }
  const { error } = await admin
    .from("acordo_coletivo")
    .update({ documento_url: destino, updated_at: new Date().toISOString() })
    .eq("id", acordoId)
    .eq("emp_proprietaria_id", await tenantAtual())
  return error ? { erro: `Não foi possível gravar o documento: ${error.message}` } : {}
}
