import {
  BedDouble,
  Bell,
  CalendarDays,
  CircleHelp,
  ClipboardCheck,
  HandCoins,
  Handshake,
  HeartPulse,
  Home,
  IdCard,
  Landmark,
  MessagesSquare,
  Newspaper,
  ScrollText,
  ShieldCheck,
  UserPen,
  UserRound,
  Vote,
  type LucideIcon,
} from "lucide-react"

import { opcoesPadrao } from "@/lib/portal-partes-constantes"

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
  // Canais oficiais e diretoria vigente (A63, A155).
  { titulo: "O sindicato", href: "/portal/sindicato", grupo: "Falar com o sindicato", icone: Landmark },
  { titulo: "Avisos", href: "/portal/avisos", grupo: "Falar com o sindicato", icone: Bell },
  // A Oposição é da contribuição ASSISTENCIAL — "Oposição à contribuição"
  // soava como deixar de pagar a mensalidade (A116).
  { titulo: "Contribuição assistencial", href: "/portal/oposicao", grupo: "Mais", icone: ScrollText },
  { titulo: "Privacidade e dados", href: "/portal/lgpd", grupo: "Mais", icone: ShieldCheck },
  { titulo: "Ajuda", href: "/portal/ajuda", grupo: "Mais", icone: CircleHelp },
]

/**
 * Os quatro atalhos padrão da barra inferior (A57): o que quem paga mais
 * procura. Avisos não entra — o sino com o selo fica no cabeçalho em toda
 * largura. A entidade troca a lista em Filiados › Área do associado (opção
 * "atalhos" do Portal inteiro), cujo padrão é este.
 */
export const FIXOS_INFERIOR: readonly string[] = opcoesPadrao("portal").atalhos

/**
 * Os atalhos que a barra mostra: os escolhidos, na ordem escolhida, sem os
 * que saíram do menu (parte desabilitada, Hospedagem sem hotel, Oposição de
 * quem não tem a ver com ela). Sobrando nenhum, fica o Início, que nunca sai.
 */
export function atalhosDaBarra(atalhos: readonly string[], ocultos: readonly string[]): ItemNavPortal[] {
  const itens = atalhos
    .filter((href) => !ocultos.includes(href))
    .map((href) => NAV_PORTAL.find((i) => i.href === href))
    .filter((i): i is ItemNavPortal => Boolean(i))
  return itens.length > 0 ? itens : NAV_PORTAL.filter((i) => i.href === "/portal/inicio")
}

/**
 * Portal inteiro fora do ar (Filiados › Área do associado): o que continua
 * abrindo para quem já estava dentro — direito com prazo (contribuição
 * assistencial, desistência da filiação coletiva), os direitos do titular
 * (LGPD), o desligar dos avisos por e-mail e celular e o cancelamento do que
 * já foi pedido (reservas de hospedagem, que viram falta, e inscrições em
 * eventos, que prendem a vaga). Hospedagem e Eventos abrem em modo de
 * consulta: o bloqueioDaParte devolve a mensagem do portal, e somem pedido,
 * fila, confirmação, inscrição e resposta de presença — ficam os botões de
 * cancelar. O resto mostra a página de manutenção.
 */
export const ABERTOS_COM_PORTAL_FORA_DO_AR: readonly { href: string; titulo: string }[] = [
  { href: "/portal/oposicao", titulo: "Contribuição assistencial" },
  { href: "/portal/desfiliacao", titulo: "Minha filiação" },
  { href: "/portal/lgpd", titulo: "Privacidade e dados" },
  { href: "/portal/avisos/preferencias", titulo: "Preferências de avisos" },
  // O prefixo cobre também /portal/hospedagem/reserva/<id>.
  { href: "/portal/hospedagem", titulo: "Minhas reservas de hospedagem" },
  { href: "/portal/eventos", titulo: "Minhas inscrições em eventos" },
]

/**
 * Páginas fora do menu que ainda assim dão nome ao cabeçalho do celular e
 * ícone ao cabeçalho da página. "Minha filiação" é o título da própria página
 * (A160): a rota é /desfiliacao, mas a página mostra a filiação toda.
 */
const TITULOS_FORA_DO_MENU: { href: string; titulo: string; icone: LucideIcon }[] = [
  { href: "/portal/desfiliacao", titulo: "Minha filiação", icone: UserRound },
  // O mesmo ícone do portão do primeiro acesso (GuardaPrimeiroAcesso).
  { href: "/portal/primeiro-acesso", titulo: "Primeiro acesso", icone: ClipboardCheck },
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

/**
 * Ícone da seção atual — o mesmo da lateral e da folha "Mais" —, para o
 * cabeçalho das páginas (A184). Subpágina leva o ícone da seção pai.
 */
export function iconeDaSecao(pathname: string): LucideIcon | null {
  const item = [...NAV_PORTAL, ...TITULOS_FORA_DO_MENU].find((i) => ativo(pathname, i.href))
  return item?.icone ?? null
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
