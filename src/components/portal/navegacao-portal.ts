import {
  BedDouble,
  Bell,
  CalendarDays,
  CircleHelp,
  HandCoins,
  Handshake,
  HeartPulse,
  Home,
  IdCard,
  MessagesSquare,
  Newspaper,
  ScrollText,
  ShieldCheck,
  UserPen,
  Vote,
  type LucideIcon,
} from "lucide-react"

/**
 * Menu do portal do associado em grupos, na linguagem de quem paga (A116,
 * A118). UMA definição alimenta a lateral (lg+), a folha "Mais" do celular e
 * o título da seção no cabeçalho — para não voltarem a divergir. As rotas não
 * mudaram; só rótulos e ordem.
 */
export const GRUPOS_NAV_PORTAL = ["Eu", "Serviços", "Participar", "Falar com o sindicato", "Mais"] as const
export type GrupoNavPortal = (typeof GRUPOS_NAV_PORTAL)[number]

export type ItemNavPortal = {
  titulo: string
  href: string
  /** null = topo do menu, sem rótulo de grupo (só o Início). */
  grupo: GrupoNavPortal | null
  icone: LucideIcon
}

export const NAV_PORTAL: ItemNavPortal[] = [
  { titulo: "Início", href: "/portal/inicio", grupo: null, icone: Home },
  { titulo: "Meu cadastro", href: "/portal/cadastro", grupo: "Eu", icone: UserPen },
  { titulo: "Carteirinha", href: "/portal/carteirinha", grupo: "Eu", icone: IdCard },
  { titulo: "Contribuição", href: "/portal/contribuicao", grupo: "Eu", icone: HandCoins },
  { titulo: "Hospedagem", href: "/portal/hospedagem", grupo: "Serviços", icone: BedDouble },
  { titulo: "Convênios", href: "/portal/convenios", grupo: "Serviços", icone: Handshake },
  { titulo: "Saúde", href: "/portal/saude", grupo: "Serviços", icone: HeartPulse },
  { titulo: "Votação", href: "/portal/votacao", grupo: "Participar", icone: Vote },
  { titulo: "Eventos", href: "/portal/eventos", grupo: "Participar", icone: CalendarDays },
  { titulo: "Notícias", href: "/portal/noticias", grupo: "Participar", icone: Newspaper },
  { titulo: "Atendimento", href: "/portal/atendimento", grupo: "Falar com o sindicato", icone: MessagesSquare },
  { titulo: "Avisos", href: "/portal/avisos", grupo: "Falar com o sindicato", icone: Bell },
  // A Oposição é da contribuição ASSISTENCIAL — "Oposição à contribuição"
  // soava como deixar de pagar a mensalidade (A116).
  { titulo: "Contribuição assistencial", href: "/portal/oposicao", grupo: "Mais", icone: ScrollText },
  { titulo: "Privacidade e dados", href: "/portal/lgpd", grupo: "Mais", icone: ShieldCheck },
  { titulo: "Ajuda", href: "/portal/ajuda", grupo: "Mais", icone: CircleHelp },
]

/**
 * Os quatro atalhos da barra inferior (A57): o que quem paga mais procura.
 * Avisos não entra — o sino com o selo fica no cabeçalho em toda largura.
 */
export const FIXOS_INFERIOR = ["/portal/inicio", "/portal/contribuicao", "/portal/carteirinha", "/portal/atendimento"]

/** Páginas fora do menu que ainda assim dão nome ao cabeçalho do celular. */
const TITULOS_FORA_DO_MENU: { href: string; titulo: string }[] = [
  { href: "/portal/desfiliacao", titulo: "Desfiliação" },
]

/** A página atual é a do item (ou uma subpágina dele: cédula, reserva, solicitação…). */
export function ativo(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}

/** Nome da seção atual, a partir do menu completo (inclusive itens ocultos). */
export function tituloDaSecao(pathname: string): string | null {
  const item = [...NAV_PORTAL, ...TITULOS_FORA_DO_MENU].find((i) => ativo(pathname, i.href))
  return item?.titulo ?? null
}

/** Itens visíveis em grupos, na ordem do menu; grupo vazio some. */
export function agruparNav(itens: ItemNavPortal[]): { grupo: GrupoNavPortal | null; itens: ItemNavPortal[] }[] {
  const grupos: (GrupoNavPortal | null)[] = [null, ...GRUPOS_NAV_PORTAL]
  return grupos
    .map((grupo) => ({ grupo, itens: itens.filter((i) => i.grupo === grupo) }))
    .filter((g) => g.itens.length > 0)
}

/** Formata o selo de não lidos (99+ a partir de 100). */
export function seloNaoLidos(n: number): string {
  return n > 99 ? "99+" : String(n)
}
