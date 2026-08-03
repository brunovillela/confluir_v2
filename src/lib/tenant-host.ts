/**
 * Helper puro de resolução de tenant pelo host — sem `server-only` nem
 * `next/headers`, para poder ser importado tanto pelo proxy (middleware)
 * quanto pelo servidor.
 */

/** Subdomínios que NÃO são tenants (infra/plataforma). */
const RESERVADOS = ["www", "admin", "app", "api"]

export function subdominioReservado(sub: string): boolean {
  return RESERVADOS.includes(sub.toLowerCase())
}

/**
 * Subdomínio de tenant a partir do host, ou null quando não há um
 * (localhost, IP, apex/www, ou hosts reservados como `admin`/`app`).
 */
export function subdominioDoHost(host: string | null | undefined): string | null {
  if (!host) return null
  const nome = host.split(":")[0].toLowerCase()
  if (/^\d+\.\d+\.\d+\.\d+$/.test(nome)) return null
  // Deploys da Vercel (`*.vercel.app`, produção e previews) NÃO são subdomínios
  // de tenant — caem no tenant dono (EMP_PROPRIETARIA_ID). Domínio próprio com
  // subdomínio de tenant (`<slug>.dominio.tld`) continua resolvendo normalmente.
  if (nome.endsWith(".vercel.app")) return null
  const partes = nome.split(".")

  // Dev: `<slug>.localhost` (o navegador resolve *.localhost para loopback).
  if (partes.length === 2 && partes[1] === "localhost") {
    return subdominioReservado(partes[0]) ? null : partes[0]
  }
  if (nome === "localhost") return null

  // Prod: precisa de pelo menos <sub>.<dominio>.<tld> para haver subdomínio.
  if (partes.length < 3) return null
  const sub = partes[0]
  if (subdominioReservado(sub)) return null
  return sub
}
