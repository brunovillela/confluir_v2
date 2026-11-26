/**
 * Arquivo que vai DENTRO do envio de uma server action. O corpo do envio tem
 * teto de 4 MB NO TOTAL (next.config.ts `bodySizeLimit`; a Vercel corta em
 * ~4,5 MB) e passar dele dá um erro genérico antes de a action rodar. Por
 * isso fotos grandes são reduzidas no navegador antes de ir, e o que ainda
 * passa do teto é recusado ali mesmo, sem enviar. A redução em si mora em
 * lib/reducao-imagem.ts (a mesma do redutor global de todos os campos).
 *
 * Nasceu na aquisição direta (nota e boleto: PDF ou foto) e serve a qualquer
 * formulário: o anexo do Atendimento do portal usa com a sua própria lista de
 * tipos e o seu teto.
 */

import { avisarArquivoTrocado } from "@/components/ui/campo-arquivo"
import { aceitoPor, aguardarReducao, reduzirFoto } from "@/lib/reducao-imagem"

export const ACEITA_NOTA = "application/pdf,image/jpeg,image/png,image/webp"
// Corpo da server action vai até 4 MB; foto de celular costuma passar disso.
export const LIMITE_ARQUIVO = 4 * 1024 * 1024
/** Soma dos arquivos de um envio, com folga para os demais campos. */
export const LIMITE_ENVIO = 3.8 * 1024 * 1024
/** Mesmo arquivo que o input tinha quando a preparação começou? */
function mesmoArquivo(a: File | undefined, b: File): boolean {
  return !!a && a.name === b.name && a.size === b.size && a.lastModified === b.lastModified
}

/** Troca o arquivo do input. false = navegador sem DataTransfer (fica o original). */
function trocarArquivo(input: HTMLInputElement, arquivo: File): boolean {
  try {
    const dt = new DataTransfer()
    dt.items.add(arquivo)
    input.files = dt.files
    return true
  } catch {
    return false
  }
}

export type OpcoesPreparo = {
  /** Tipos aceitos, no formato do `accept`. Padrão: ACEITA_NOTA (PDF ou foto). */
  aceita?: string
  /** Mensagem para tipo fora da lista. */
  erroTipo?: string
  /** Teto do arquivo já reduzido, em bytes. Padrão: LIMITE_ARQUIVO (4 MB). */
  limite?: number
  /** Mensagem para arquivo acima do teto. */
  erroLimite?: string
}

/**
 * Prepara o arquivo escolhido no input: reduz foto grande e troca o arquivo do
 * próprio input (é ele que vai no envio do formulário). Devolve o arquivo
 * final ou uma mensagem de erro — nesse caso o input fica vazio.
 */
export async function prepararArquivo(
  input: HTMLInputElement,
  opcoes: OpcoesPreparo = {}
): Promise<{ arquivo?: File; erro?: string }> {
  const {
    aceita = ACEITA_NOTA,
    erroTipo = "Envie um PDF ou uma imagem (JPG, PNG ou WEBP).",
    limite = LIMITE_ARQUIVO,
    erroLimite = "O arquivo deve ter no máximo 4 MB.",
  } = opcoes
  // A redução global (components/layout/reducao-arquivos) pode já estar
  // trocando a foto deste input: espera por ela e segue com o resultado.
  await aguardarReducao(input)
  const original = input.files?.[0]
  if (!original) return {}
  if (!aceitoPor(original, aceita)) {
    input.value = ""
    avisarArquivoTrocado(input)
    return { erro: erroTipo }
  }
  let arquivo = original
  try {
    arquivo = await reduzirFoto(original, aceita)
  } catch {
    // Sem suporte a canvas/bitmap: segue com o original.
  }
  // Outro arquivo foi escolhido enquanto este era reduzido: vale o novo, que
  // tem a sua própria preparação em andamento.
  const atual = input.files?.[0]
  if (!mesmoArquivo(atual, original)) return { arquivo: atual }
  // Sem como trocar o arquivo do input, o envio levaria o original.
  if (arquivo !== original && !trocarArquivo(input, arquivo)) arquivo = original
  if (arquivo.size > limite) {
    input.value = ""
    avisarArquivoTrocado(input)
    return { erro: erroLimite }
  }
  if (arquivo !== original) avisarArquivoTrocado(input)
  return { arquivo }
}
