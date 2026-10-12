import { artigoAjudaPortal } from "@/lib/ajuda/manifesto-portal"

/**
 * AJUDA LIGADA À SEÇÃO DO PORTAL (A136): de que artigo da ajuda do associado
 * fala a página em que ele está — o "?" do cabeçalho da casca leva direto a
 * ele. No painel (rota.ts) a área sai do segmento do módulo; aqui o mapa é
 * EXPLÍCITO porque as áreas da ajuda não são 1:1 com o menu (o Início fica
 * no artigo de boas-vindas; a Desfiliação, fora do menu, num artigo da área
 * Contribuição). /portal/agenda só redireciona para Eventos e agenda, que fica
 * com o artigo de eventos — onde a agenda foi parar (A169). Subpáginas
 * (cédula, reserva, solicitação, preferências de avisos…) herdam o artigo da
 * seção pelo prefixo. Seção sem entrada — ou cujo artigo saiu do manifesto —
 * leva ao índice da ajuda.
 */

export const INDICE_AJUDA_PORTAL = "/portal/ajuda"

/** Seção do portal → "<área>" ou "<área>/<artigo>" de manifesto-portal.ts. */
const ARTIGO_DA_SECAO: Record<string, string> = {
  "/portal/inicio": "visao-geral",
  "/portal/cadastro": "cadastro",
  "/portal/carteirinha": "carteirinha",
  // A54: a contribuição ganhou área própria (antes caía na carteirinha).
  "/portal/contribuicao": "contribuicao",
  "/portal/hospedagem": "hospedagem",
  "/portal/convenios": "convenios",
  "/portal/saude": "saude",
  "/portal/votacao": "votacao",
  "/portal/eventos": "eventos",
  "/portal/noticias": "noticias",
  "/portal/atendimento": "atendimento",
  "/portal/avisos": "avisos",
  "/portal/oposicao": "oposicao",
  "/portal/lgpd": "lgpd",
  "/portal/desfiliacao": "contribuicao/desfiliacao",
}

export type EntradaAjudaPortal = {
  prefixo: string
  href: string
  /** Título da área (ou do artigo, quando não é o de abertura) — vai no aria-label. */
  titulo: string
}

/**
 * Pares (seção, artigo), do prefixo mais longo ao mais curto. Só entra o que
 * existe e está disponível no manifesto: slug renomeado lá vira índice aqui,
 * nunca link quebrado.
 */
export function mapaAjudaPortal(): EntradaAjudaPortal[] {
  const pares: EntradaAjudaPortal[] = []
  for (const [prefixo, destino] of Object.entries(ARTIGO_DA_SECAO)) {
    const [areaSlug, artigoSlug = "index"] = destino.split("/")
    const achado = artigoAjudaPortal(areaSlug, artigoSlug)
    // Slug que sumiu do manifesto não pode cair no índice calado: em
    // desenvolvimento o layout roda isto a cada carga e avisa no terminal.
    if (!achado && process.env.NODE_ENV === "development") {
      console.warn(`[ajuda do portal] ${prefixo} aponta para "${destino}", que não está no manifesto-portal.ts.`)
    }
    if (!achado?.area.disponivel) continue
    const { area, artigo } = achado
    const abertura = artigo.slug === "index"
    pares.push({
      prefixo,
      // O artigo de abertura mora em /portal/ajuda/<área> (a rota do tópico recusa "index").
      href: abertura ? `${INDICE_AJUDA_PORTAL}/${area.slug}` : `${INDICE_AJUDA_PORTAL}/${area.slug}/${artigo.slug}`,
      titulo: abertura ? area.titulo : artigo.titulo,
    })
  }
  return pares.sort((a, b) => b.prefixo.length - a.prefixo.length)
}

/** Artigo da página atual: o prefixo mais longo que casa; sem casamento, o índice (titulo null). */
export function ajudaDaRotaPortal(
  mapa: EntradaAjudaPortal[],
  pathname: string
): { href: string; titulo: string | null } {
  const entrada = mapa.find((e) => pathname === e.prefixo || pathname.startsWith(`${e.prefixo}/`))
  return entrada ? { href: entrada.href, titulo: entrada.titulo } : { href: INDICE_AJUDA_PORTAL, titulo: null }
}
