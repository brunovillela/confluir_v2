import { AREAS_AJUDA_PORTAL, artigoAjudaPortal, type AreaAjuda } from "@/lib/ajuda/manifesto-portal"
import { parteDoLink, type ChaveParte } from "@/lib/portal-partes-constantes"

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
  // O artigo de boas-vindas tem a seção "Primeiro acesso" (#primeiro-acesso).
  // Depois do Início: a parte do artigo (parteDoArtigoPortal) segue a dele.
  "/portal/primeiro-acesso": "visao-geral",
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
 * A parte do portal de que um artigo fala (Filiados › Área do associado): a
 * da seção que aponta para ele no mapa acima — a Desfiliação, artigo da área
 * Contribuição, é de "Minha filiação" —; sem entrada no mapa, a da rota de
 * mesmo nome. null = de nenhuma parte: nunca sai da ajuda.
 */
export function parteDoArtigoPortal(areaSlug: string, artigoSlug = "index"): ChaveParte | null {
  const destino = artigoSlug === "index" ? areaSlug : `${areaSlug}/${artigoSlug}`
  const secao = Object.entries(ARTIGO_DA_SECAO).find(([, d]) => d === destino)?.[0]
  return parteDoLink(secao ?? `/portal/${areaSlug}`)
}

/** O artigo fala de uma parte desabilitada: sai do índice, da busca, da navegação e do "?". */
export function artigoForaDaAjuda(
  areaSlug: string,
  artigoSlug: string,
  desabilitadas: readonly ChaveParte[]
): boolean {
  const parte = parteDoArtigoPortal(areaSlug, artigoSlug)
  return parte !== null && desabilitadas.includes(parte)
}

/**
 * As áreas da ajuda sem os artigos das partes desabilitadas; área que fica sem
 * artigo sai. Pode sobrar área sem o artigo de abertura (Contribuição
 * desabilitada: fica a Desfiliação) — quem lista leva ao primeiro que restou.
 */
export function areasAjudaPortal(desabilitadas: readonly ChaveParte[] = []): AreaAjuda[] {
  if (desabilitadas.length === 0) return AREAS_AJUDA_PORTAL
  return AREAS_AJUDA_PORTAL.map((a) => ({
    ...a,
    artigos: a.artigos.filter((art) => !artigoForaDaAjuda(a.slug, art.slug, desabilitadas)),
  })).filter((a) => a.artigos.length > 0)
}

/**
 * Para onde vai quem não achou a resposta (A115): o Atendimento; com ele
 * desabilitado, os canais de "O sindicato". Os dois nunca ficam desabilitados
 * juntos (salvarParte recusa) — se ficassem, valeria o Atendimento.
 */
export function saidaDaAjudaPortal(desabilitadas: readonly ChaveParte[] = []): {
  canal: "atendimento" | "sindicato"
  href: string
  /** Na lista da busca, quando nada casa. */
  rotuloBusca: string
  /** No fim do índice. */
  texto: string
  botao: string
} {
  if (desabilitadas.includes("atendimento") && !desabilitadas.includes("sindicato")) {
    return {
      canal: "sindicato",
      href: "/portal/sindicato",
      rotuloBusca: "Fale com o sindicato pelos canais oficiais",
      texto: "Fale com o sindicato pelos canais oficiais: e-mail, telefones e endereço das sedes.",
      botao: "Ver os canais",
    }
  }
  return {
    canal: "atendimento",
    href: "/portal/atendimento?nova=1",
    rotuloBusca: "Pergunte ao sindicato pelo Atendimento",
    texto: "Pergunte ao sindicato: a resposta chega no Atendimento, com aviso no portal.",
    botao: "Abrir uma solicitação",
  }
}

/**
 * Pares (seção, artigo), do prefixo mais longo ao mais curto. Só entra o que
 * existe e está disponível no manifesto: slug renomeado lá vira índice aqui,
 * nunca link quebrado. Artigo de parte desabilitada (Filiados › Área do
 * associado) também fica de fora: o "?" daquela seção leva ao índice.
 */
export function mapaAjudaPortal(desabilitadas: readonly ChaveParte[] = []): EntradaAjudaPortal[] {
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
    if (artigoForaDaAjuda(areaSlug, artigoSlug, desabilitadas)) continue
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
