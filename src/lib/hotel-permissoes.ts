/**
 * Permissões dos usuários do HOTEL por área da interface do hotel — regras
 * PURAS (o editor do painel e a casca do hotel usam). Como no painel
 * administrativo: "ver" e "editar" por área. Leitura/aplicação no servidor:
 * src/lib/hotel-acesso.ts. SQL: supabase/hotel-permissoes.sql.
 *
 * `null` (usuário ainda não configurado) = acesso completo, como era antes.
 */

export type NivelHotel = "ver" | "editar"
export type PermissoesHotel = Partial<Record<ChaveAreaHotel, NivelHotel>> | null

export type AreaHotel = {
  chave: ChaveAreaHotel
  titulo: string
  href: string
  /** Em que convênio a área existe. */
  em: "ambos" | "uso" | "garantida"
  /** Áreas só de consulta não têm "editar". */
  temEdicao: boolean
  descricao: string
}

export type ChaveAreaHotel =
  | "cupons"
  | "emergencial"
  | "reservas"
  | "hospedes"
  | "recepcao"
  | "avaliacoes"
  | "faturamento"
  | "contas"
  | "acordo"

/** Na ordem do menu. Início e Ajuda ficam fora: são sempre liberados. */
export const AREAS_HOTEL: AreaHotel[] = [
  { chave: "cupons", titulo: "Cupons", href: "/hotel/cupons", em: "uso", temEdicao: false, descricao: "Fila de cupons aguardando reserva" },
  { chave: "emergencial", titulo: "Cupom emergencial", href: "/hotel/emergencial", em: "ambos", temEdicao: true, descricao: "Reserva na hora para o hóspede sem cupom" },
  { chave: "reservas", titulo: "Reservas", href: "/hotel/reservas", em: "uso", temEdicao: true, descricao: "Registrar reservas, presença e relatório" },
  { chave: "hospedes", titulo: "Hóspedes por quarto", href: "/hotel/hospedes", em: "garantida", temEdicao: true, descricao: "Mapa da noite e anotações de quarto" },
  { chave: "recepcao", titulo: "Recepção", href: "/hotel/recepcao", em: "garantida", temEdicao: true, descricao: "Leitura do QR Code e entrada do hóspede" },
  { chave: "avaliacoes", titulo: "Avaliações", href: "/hotel/avaliacoes", em: "ambos", temEdicao: false, descricao: "Notas e comentários anônimos dos hóspedes" },
  { chave: "faturamento", titulo: "Faturamento", href: "/hotel/faturamento", em: "ambos", temEdicao: true, descricao: "Emitir e acompanhar as faturas" },
  { chave: "contas", titulo: "Dados bancários", href: "/hotel/contas", em: "ambos", temEdicao: true, descricao: "Contas para receber os pagamentos" },
  { chave: "acordo", titulo: "Acordo e orientações", href: "/hotel/acordo", em: "ambos", temEdicao: false, descricao: "O convênio e as orientações do sindicato" },
]

export function areaHotel(chave: ChaveAreaHotel): AreaHotel {
  return AREAS_HOTEL.find((a) => a.chave === chave)!
}

/** Nível efetivo do usuário na área (null = sem acesso). */
export function nivelNaArea(permissoes: PermissoesHotel, chave: ChaveAreaHotel): NivelHotel | null {
  const area = areaHotel(chave)
  if (permissoes === null) return area.temEdicao ? "editar" : "ver"
  const n = permissoes[chave]
  if (n === "editar") return area.temEdicao ? "editar" : "ver"
  return n === "ver" ? "ver" : null
}

export function podeVerArea(permissoes: PermissoesHotel, chave: ChaveAreaHotel): boolean {
  return nivelNaArea(permissoes, chave) !== null
}

export function podeEditarArea(permissoes: PermissoesHotel, chave: ChaveAreaHotel): boolean {
  return nivelNaArea(permissoes, chave) === "editar"
}

/** Lê o jsonb do banco tolerando lixo (chave/nível desconhecidos caem fora). */
export function lerPermissoesHotel(bruto: unknown): PermissoesHotel {
  if (bruto === null || bruto === undefined) return null
  if (typeof bruto !== "object" || Array.isArray(bruto)) return null
  const saida: Partial<Record<ChaveAreaHotel, NivelHotel>> = {}
  for (const a of AREAS_HOTEL) {
    const v = (bruto as Record<string, unknown>)[a.chave]
    if (v === "ver" || v === "editar") saida[a.chave] = v
  }
  return saida
}

/** Atalhos do editor do painel — como os perfis da área administrativa. */
export const PERFIS_HOTEL: { nome: string; descricao: string; permissoes: Partial<Record<ChaveAreaHotel, NivelHotel>> }[] = [
  {
    nome: "Acesso completo",
    descricao: "Gerência: todas as áreas, com edição",
    permissoes: Object.fromEntries(AREAS_HOTEL.map((a) => [a.chave, a.temEdicao ? "editar" : "ver"])),
  },
  {
    nome: "Recepção",
    descricao: "Atende o hóspede: cupons, emergencial, reservas e recepção",
    permissoes: {
      cupons: "ver",
      emergencial: "editar",
      reservas: "editar",
      hospedes: "editar",
      recepcao: "editar",
      acordo: "ver",
    },
  },
  {
    nome: "Financeiro",
    descricao: "Faturas e dados bancários; consulta as reservas",
    permissoes: {
      reservas: "ver",
      hospedes: "ver",
      faturamento: "editar",
      contas: "editar",
      acordo: "ver",
    },
  },
]

/** "Acesso completo" ou "3 áreas" — resumo para a lista de usuários. */
export function resumoPermissoesHotel(p: PermissoesHotel): string {
  if (p === null) return "Acesso completo"
  const n = AREAS_HOTEL.filter((a) => podeVerArea(p, a.chave)).length
  if (n === AREAS_HOTEL.length && AREAS_HOTEL.every((a) => !a.temEdicao || podeEditarArea(p, a.chave))) {
    return "Acesso completo"
  }
  return n === 0 ? "Só Início e Ajuda" : `${n} área${n === 1 ? "" : "s"}`
}
