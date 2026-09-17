"use server"

import { extractText, getDocumentProxy } from "unpdf"

import { requirePermissao } from "@/lib/auth"
import { TIPOS_REUNIAO } from "@/lib/atas-constantes"
import { gerarJsonIA, gerarJsonIADePdf } from "@/lib/ia"

export type ExtracaoAta = {
  valores?: Partial<Record<CampoAta, string>>
  erro?: string
}

const CAMPOS = ["titulo", "tipo", "orgao", "data", "hora", "local", "pauta", "deliberacoes", "presentes", "observacoes"] as const
type CampoAta = (typeof CAMPOS)[number]

const SISTEMA = `Você lê a ata de uma reunião de sindicato e devolve um objeto JSON com os campos abaixo.
Regras:
- Use só o que está no documento; campo ausente = "" (string vazia). NÃO invente.
- "titulo": curto, no estilo "Reunião ordinária da diretoria — julho/2026".
- "tipo": exatamente um de ${TIPOS_REUNIAO.map((t) => `"${t.chave}"`).join(", ")} (reunião de diretoria/diretoria colegiada/executiva = "diretoria"; conselho fiscal = "conselho_fiscal"; assembleia = "assembleia"; qualquer outra = "outra").
- "orgao": só quando o tipo for "outra" — o nome do órgão que se reuniu.
- "data": AAAA-MM-DD. "hora": como no documento, ex. "14h00".
- "local": onde a reunião aconteceu.
- "pauta": os itens de pauta, um por linha.
- "deliberacoes": o que foi decidido, um item por linha, com a decisão e (se houver) o resultado da votação.
- "presentes": os nomes dos presentes, um por linha, sem cargos.
- "observacoes": encaminhamentos, prazos ou registros que não caibam nos outros campos; senão "".
- Responda APENAS com o objeto JSON.`

/**
 * Lê o PDF da ata e devolve os campos do formulário. PDF digital vai pelo
 * texto (mais barato); escaneado, pela leitura de imagem do próprio PDF.
 */
export async function extrairAtaDePdf(formData: FormData): Promise<ExtracaoAta> {
  await requirePermissao("diretoria_reunioes")
  const arquivo = formData.get("documento")
  if (!(arquivo instanceof File) || arquivo.size === 0) return { erro: "Selecione o PDF da ata." }
  if (arquivo.type && arquivo.type !== "application/pdf") return { erro: "A ata precisa ser um PDF." }

  const buffer = new Uint8Array(await arquivo.arrayBuffer())
  let texto = ""
  try {
    const pdf = await getDocumentProxy(buffer)
    texto = (await extractText(pdf, { mergePages: true })).text.trim()
  } catch {
    // PDF só-imagem: segue para a leitura visual.
  }

  const { dados, erro } =
    texto.length >= 80
      ? await gerarJsonIA({ system: SISTEMA, prompt: `Texto da ata:\n\n${texto.slice(0, 60000)}` })
      : arquivo.size > 20 * 1024 * 1024
        ? { dados: undefined, erro: "PDF escaneado grande demais para a leitura por IA (máximo 20 MB)." }
        : await gerarJsonIADePdf({
            system: SISTEMA,
            prompt: "Leia a ata de reunião contida neste PDF (pode ser escaneada) e extraia os campos.",
            pdfBase64: Buffer.from(buffer).toString("base64"),
          })
  if (erro || !dados) return { erro: erro ?? "A IA não conseguiu ler a ata." }

  const valores: Partial<Record<CampoAta, string>> = {}
  for (const campo of CAMPOS) {
    const bruto = dados[campo]
    const valor = Array.isArray(bruto) ? bruto.map(String).join("\n") : typeof bruto === "string" ? bruto.trim() : ""
    if (!valor) continue
    if (campo === "data" && !/^\d{4}-\d{2}-\d{2}$/.test(valor)) continue
    if (campo === "tipo" && !TIPOS_REUNIAO.some((t) => t.chave === valor)) continue
    valores[campo] = valor
  }
  if (Object.keys(valores).length === 0) return { erro: "A IA não encontrou os dados da reunião neste PDF." }
  return { valores }
}
