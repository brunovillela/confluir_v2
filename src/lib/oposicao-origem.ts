/**
 * ORIGEM DO ACESSO À OPOSIÇÃO (15/11/2026): os links divulgados levam
 * `?origem=<canal>` (QR code, WhatsApp, boletim, e-mail, link copiado, aviso
 * da área do associado), e o link geral leva o prefixo `geral-`. O portal
 * guarda a origem num cookie (COOKIE_ORIGEM) e ela vai, sem dado pessoal,
 * para a trilha em `ciencia_registrada` e `origem_registrada` — o funil mostra
 * de onde vem quem lê e quem registra.
 */

export const CANAIS_ORIGEM = [
  { chave: "qr", rotulo: "QR code" },
  { chave: "whatsapp", rotulo: "WhatsApp" },
  { chave: "boletim", rotulo: "Boletim e site" },
  { chave: "email", rotulo: "E-mail (mala direta)" },
  { chave: "link", rotulo: "Link copiado" },
  { chave: "banner", rotulo: "Aviso na área do associado" },
] as const

export type CanalOrigem = (typeof CANAIS_ORIGEM)[number]["chave"]

export const COOKIE_ORIGEM = "op_origem"
/** 30 dias: dá tempo de a pessoa abrir hoje e voltar para registrar depois. */
export const DURACAO_ORIGEM_S = 30 * 24 * 3600

const CHAVES = new Set<string>(CANAIS_ORIGEM.map((c) => c.chave))

/** A origem lida da URL ou do cookie, ou null se não for uma conhecida. */
export function origemValida(v: string | null | undefined): string | null {
  const t = (v ?? "").trim().toLowerCase()
  const canal = t.startsWith("geral-") ? t.slice(6) : t
  return CHAVES.has(canal) ? t : null
}

/** "geral-qr" → "QR code · link geral". */
export function rotuloOrigem(origem: string | null): string {
  if (!origem) return "Sem origem marcada"
  const geral = origem.startsWith("geral-")
  const canal = geral ? origem.slice(6) : origem
  const r = CANAIS_ORIGEM.find((c) => c.chave === canal)?.rotulo ?? origem
  return geral ? `${r} · link geral` : `${r} · link da campanha`
}

/** O link com a marca da origem. */
export function linkComOrigem(link: string, origem: string): string {
  return `${link}${link.includes("?") ? "&" : "?"}origem=${encodeURIComponent(origem)}`
}
