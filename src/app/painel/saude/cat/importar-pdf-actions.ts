"use server"

import { extractText, getDocumentProxy } from "unpdf"

import { requirePermissao } from "@/lib/auth"
import { gerarJsonIA, gerarJsonIADePdf } from "@/lib/ia"
import { CAMPOS_CAT, nomeCampo, type TipoCampo } from "@/lib/saude-campos"
import * as n from "@/lib/saude-normalizacao"

export type EstadoExtracaoCat = {
  valores?: Record<string, string>
  avisos?: string[]
  erro?: string
}

const DICA_TIPO: Partial<Record<TipoCampo, string>> = {
  data: "data no formato AAAA-MM-DD",
  bool: "responda apenas Sim ou Não",
  cpf: "CPF",
  cbo: "código CBO e a descrição, como no formulário",
  codigo: "código e descrição",
  cid: "código CID-10",
  inteiro: "número",
}
function dicaTipo(t: TipoCampo): string {
  return DICA_TIPO[t] ?? "texto"
}

const LISTA_CAMPOS = CAMPOS_CAT.map(
  (c) => `- "${c.coluna}" (campo ${c.n} — ${c.rotulo}): ${dicaTipo(c.tipo)}`
).join("\n")

const SISTEMA = `Você extrai os dados de um formulário oficial de CAT (Comunicação de Acidente de Trabalho) e devolve um objeto JSON.
Leia o formulário (texto ou imagem escaneada) e preencha CADA chave abaixo com o valor correspondente do documento.
Regras:
- Se um campo não aparecer ou estiver em branco, use "" (string vazia).
- NÃO invente dados que não estejam no documento.
- Datas em AAAA-MM-DD. Campos Sim/Não devem ser "Sim" ou "Não".
- Para CBO/código, escreva o código e a descrição juntos, como aparecem no formulário.
- Responda APENAS com o objeto JSON, sem comentários nem texto fora do JSON.

Chaves esperadas (use exatamente estes nomes):
${LISTA_CAMPOS}`

export async function extrairCatDePdf(
  _prev: EstadoExtracaoCat,
  formData: FormData
): Promise<EstadoExtracaoCat> {
  await requirePermissao("saude_cat", ["saude_gestao"])

  const arquivo = formData.get("arquivo")
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return { erro: "Selecione um arquivo PDF." }
  }
  if (arquivo.type && arquivo.type !== "application/pdf") {
    return { erro: "Envie um arquivo PDF." }
  }

  const buffer = new Uint8Array(await arquivo.arrayBuffer())

  // Tenta o texto selecionável (PDF digital) — mais barato e rápido.
  let texto = ""
  try {
    const pdf = await getDocumentProxy(buffer)
    const extraido = await extractText(pdf, { mergePages: true })
    texto = extraido.text.trim()
  } catch {
    // Pode ser um PDF só-imagem que o extrator não abre — segue para a visão.
  }

  // Digital: extrai do texto. Escaneado/imagem: usa a VISÃO nativa do Claude
  // sobre o próprio PDF (mais lento e mais caro, mas lê o formulário na imagem).
  const { dados, erro } =
    texto.length >= 40
      ? await gerarJsonIA({
          system: SISTEMA,
          prompt: `Texto do formulário de CAT:\n\n${texto}`,
        })
      : arquivo.size > 20 * 1024 * 1024
        ? { dados: undefined, erro: "PDF escaneado grande demais — máximo de 20 MB." }
        : await gerarJsonIADePdf({
            system: SISTEMA,
            prompt:
              "Leia o formulário de CAT contido neste PDF (que pode ser escaneado/imagem) e extraia os campos.",
            pdfBase64: Buffer.from(buffer).toString("base64"),
          })
  if (erro || !dados) return { erro: erro ?? "Falha na extração." }

  const valores: Record<string, string> = {}
  const avisos: string[] = []
  for (const campo of CAMPOS_CAT) {
    const cru = dados[campo.coluna]
    const bruto = typeof cru === "string" ? cru.trim() : ""
    if (!bruto) continue

    let valor = bruto
    if (campo.tipo === "data") {
      const iso = n.data(bruto)
      valor = iso ?? ""
      if (!iso) {
        avisos.push(`Campo ${campo.n} (${campo.rotulo}): data não reconhecida ("${bruto}").`)
      }
    } else if (campo.tipo === "bool") {
      const b = n.booleano(bruto)
      valor = b === true ? "Sim" : b === false ? "Não" : ""
    }
    if (valor) valores[nomeCampo(campo)] = valor
  }

  if (Object.keys(valores).length === 0) {
    return { erro: "A IA não conseguiu extrair campos deste PDF." }
  }
  return { valores, avisos: avisos.length ? avisos : undefined }
}
