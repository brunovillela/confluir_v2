/**
 * Por onde a pessoa entrou para votar (voto_assembleias_aptos.acesso_canal,
 * fase 4 do plano de 16/10/2026). Fica na participação, nunca no voto. Sem
 * "server-only": a tela e o PDF usam os rótulos.
 */
export const CANAIS_ACESSO = [
  "link_pessoal",
  "link_unico_email",
  "link_unico_telegram",
  "codigo_email",
  "portal",
] as const

export type CanalAcesso = (typeof CANAIS_ACESSO)[number]

/** Canal que aparece nos indicadores: os de acesso + urna + sem registro. */
export type CanalIndicador = CanalAcesso | "urna" | "nao_registrado"

export const ROTULOS_CANAL: Record<CanalIndicador, string> = {
  link_pessoal: "Link pessoal",
  link_unico_email: "Link geral (e-mail pessoal)",
  link_unico_telegram: "Link geral (Telegram)",
  codigo_email: "Código por e-mail",
  portal: "Portal do filiado",
  urna: "Urna presencial",
  nao_registrado: "Não registrado",
}

/** Rótulos curtos (coluna "canal" da relação de votantes no PDF). */
export const ROTULOS_CANAL_CURTOS: Record<CanalAcesso, string> = {
  link_pessoal: "Link pessoal",
  link_unico_email: "Link geral",
  link_unico_telegram: "Telegram",
  codigo_email: "Código",
  portal: "Portal",
}

/** Entrou sem depender de código por e-mail? (o que a SLB mostrou que funciona) */
export function semCodigo(c: CanalIndicador): boolean {
  return c === "link_pessoal" || c === "link_unico_telegram" || c === "portal" || c === "urna"
}

/** O canal de um apto que votou: o gravado, a urna pelo comprovante, ou "não registrado". */
export function canalDoApto(a: { acesso_canal?: string | null; comprovante_canal?: string | null }): CanalIndicador {
  if (a.acesso_canal && (CANAIS_ACESSO as readonly string[]).includes(a.acesso_canal)) {
    return a.acesso_canal as CanalAcesso
  }
  if (a.comprovante_canal?.startsWith("urna")) return "urna"
  return "nao_registrado"
}
