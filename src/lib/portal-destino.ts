/**
 * Para onde o associado volta depois de entrar no portal (achado A30). O
 * link "Abrir no portal" dos avisos por e-mail aponta para o ITEM (a reserva,
 * a cédula, a solicitação); sem sessão, o proxy manda para `/portal?next=…`
 * e a tela de entrada devolve a pessoa a esse caminho, em vez do Início.
 *
 * O `next` vem do cliente (URL e campo oculto do formulário), então passa
 * sempre por aqui — no proxy, na página e de novo nas actions: só caminhos
 * DENTRO do portal (`/portal/…`), nunca outro host. `//evil.com` e
 * `/\evil.com` começam com barra, mas o navegador os lê como outro endereço
 * (mesma regra do /auth/confirm, achado S8); `..` e `%2e%2e` saem pela
 * normalização da URL. Sem imports: roda no proxy, no servidor e no cliente.
 */

const BASE = "http://portal.invalido"

/** Caminho + busca dentro do portal, ou null quando não serve de destino. */
export function destinoDoPortal(bruto: unknown): string | null {
  if (typeof bruto !== "string" || bruto.length > 512) return null
  if (!/^\/portal\/(?![/\\])/.test(bruto) || /[\s\\]/.test(bruto)) return null
  try {
    const url = new URL(bruto, BASE)
    // "/portal/" sozinho não é destino: é a própria tela de entrada.
    if (url.origin !== BASE || !url.pathname.startsWith("/portal/") || url.pathname === "/portal/") return null
    return url.pathname + url.search
  } catch {
    return null
  }
}
