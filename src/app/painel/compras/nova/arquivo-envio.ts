/**
 * Arquivos da aquisição direta (nota e boleto): PDF ou foto. O envio da
 * server action tem teto de ~4 MB NO TOTAL (limite do corpo na Vercel), então
 * fotos grandes são reduzidas no navegador antes de ir.
 */

export const ACEITA_NOTA = "application/pdf,image/jpeg,image/png,image/webp"
// Corpo da server action vai até 4 MB; foto de celular costuma passar disso.
export const LIMITE_ARQUIVO = 4 * 1024 * 1024
/** Soma dos arquivos de um envio, com folga para os demais campos. */
export const LIMITE_ENVIO = 3.8 * 1024 * 1024
const REDUZIR_ACIMA = 1.5 * 1024 * 1024

/** Reduz foto grande (lado maior 2400 px, JPEG) para caber no envio. */
async function reduzirImagem(arquivo: File): Promise<File> {
  if (!arquivo.type.startsWith("image/") || arquivo.size <= REDUZIR_ACIMA) {
    return arquivo
  }
  const bitmap = await createImageBitmap(arquivo)
  const escala = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * escala)
  canvas.height = Math.round(bitmap.height * escala)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((ok) =>
    canvas.toBlob(ok, "image/jpeg", 0.85)
  )
  if (!blob) return arquivo
  const nome = arquivo.name.replace(/\.[^.]+$/, "") + ".jpg"
  return new File([blob], nome, { type: "image/jpeg" })
}

/**
 * Prepara o arquivo escolhido no input: reduz foto grande e troca o arquivo do
 * próprio input (é ele que vai no envio do formulário). Devolve o arquivo
 * final ou uma mensagem de erro.
 */
export async function prepararArquivo(
  input: HTMLInputElement
): Promise<{ arquivo?: File; erro?: string }> {
  const original = input.files?.[0]
  if (!original) return {}
  if (!ACEITA_NOTA.split(",").includes(original.type)) {
    input.value = ""
    return { erro: "Envie um PDF ou uma imagem (JPG, PNG ou WEBP)." }
  }
  let arquivo = original
  try {
    arquivo = await reduzirImagem(original)
  } catch {
    // Sem suporte a canvas/bitmap: segue com o original.
  }
  if (arquivo.size > LIMITE_ARQUIVO) {
    input.value = ""
    return { erro: "O arquivo deve ter no máximo 4 MB." }
  }
  if (arquivo !== original) {
    const dt = new DataTransfer()
    dt.items.add(arquivo)
    input.files = dt.files
  }
  return { arquivo }
}
