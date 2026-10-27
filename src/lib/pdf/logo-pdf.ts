import "server-only"

/**
 * Logo da entidade como data URI para o @react-pdf (só PNG/JPEG). Sem logo,
 * ou se o download falhar, o PDF sai só com o nome — nunca quebra por isso.
 * Usado pela carta e pelo comprovante em PDF da oposição.
 */
export async function logoDataUri(url: string | null): Promise<string | null> {
  if (!url) return null
  try {
    const r = await fetch(url)
    if (!r.ok) return null
    const tipo = r.headers.get("content-type") ?? ""
    if (!/image\/(png|jpe?g)/.test(tipo)) return null
    const buf = Buffer.from(await r.arrayBuffer())
    return `data:${tipo};base64,${buf.toString("base64")}`
  } catch {
    return null
  }
}
