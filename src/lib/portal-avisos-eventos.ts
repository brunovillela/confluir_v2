import type { ChaveParte } from "@/lib/portal-partes-constantes"

/**
 * Tipos de aviso que o portal do associado entrega (onda 4, F4). Cada um
 * pode ser desligado pelo próprio filiado — a mesma chave vale para o e-mail
 * e para o celular (A52); o sino sempre recebe. `semEmail`: o tipo nunca vai
 * por e-mail, e o interruptor só vale para o celular.
 * Sem imports de servidor: a lista alimenta o formulário de preferências.
 */
export const EVENTOS_PORTAL = [
  {
    chave: "contribuicao",
    rotulo: "Contribuição",
    descricao: "Contribuição não localizada na remessa da sua fonte pagadora; cobrança Pix disponível, perto de vencer e paga",
  },
  {
    chave: "atendimento",
    rotulo: "Atendimento",
    descricao: "Recebimento da sua solicitação, resposta da entidade e mudança de situação",
  },
  {
    chave: "hospedagem",
    rotulo: "Hospedagem",
    descricao: "Reserva feita, confirmada ou cancelada; vaga liberada na lista de espera; registro de não comparecimento",
  },
  {
    chave: "votacao",
    rotulo: "Votações",
    descricao: "Votação aberta em que você está apto a votar, último dia para votar e resultado publicado",
  },
  {
    chave: "eventos",
    rotulo: "Eventos",
    descricao: "Inscrição recebida, confirmada, recusada ou em lista de espera; lembrete na véspera; evento adiado ou cancelado",
  },
  {
    chave: "filiacao",
    rotulo: "Filiação e oposição",
    descricao: "Filiação ativada, desfiliação concluída e oposição à contribuição registrada ou avaliada",
  },
  {
    // A123 e A80: só no sino (nunca por e-mail — por e-mail a entidade tem a
    // mala direta, com descadastro próprio). Desligado por padrão: o
    // interruptor só decide se também chega no celular.
    chave: "noticias",
    rotulo: "Notícias e convênios",
    descricao: "Notícia publicada e convênio novo para associados. Já aparecem no sino; ligado, chegam também no celular",
    padrao: false,
    semEmail: true,
  },
] as const

export type EventoPortal = (typeof EVENTOS_PORTAL)[number]["chave"]

/**
 * Preferência por evento: ausência = ligado; `false` desliga. Nos de
 * `padrao: false` é o contrário: só `true` liga.
 */
export type PreferenciasPortal = Record<EventoPortal, boolean>

export function normalizarPreferenciasPortal(bruto: unknown): PreferenciasPortal {
  const obj = bruto && typeof bruto === "object" ? (bruto as Record<string, unknown>) : {}
  const prefs = {} as PreferenciasPortal
  for (const e of EVENTOS_PORTAL) {
    prefs[e.chave] = "padrao" in e && e.padrao === false ? obj[e.chave] === true : obj[e.chave] !== false
  }
  return prefs
}

/**
 * De que partes do portal (Filiados › Área do associado) cada tipo de aviso
 * fala. "noticias" junta Notícias e Convênios; "filiacao" (boas-vindas,
 * desfiliação e oposição) não é de parte que se desliga. No aviso em si quem
 * decide é o link; o tipo só vale quando o link não diz a parte, e só nos
 * tipos de uma parte só (`parteDoAviso`, lib/db/portal-avisos.ts).
 */
export const PARTES_DO_EVENTO: Record<EventoPortal, readonly ChaveParte[]> = {
  contribuicao: ["contribuicao"],
  atendimento: ["atendimento"],
  hospedagem: ["hospedagem"],
  votacao: ["votacao"],
  eventos: ["eventos"],
  filiacao: [],
  noticias: ["noticias", "convenios"],
}

/**
 * O tipo sai das Preferências e dos filtros da lista de avisos: todas as
 * partes dele estão desabilitadas (Notícias e convênios, só com as duas).
 */
export function eventoDesabilitado(evento: EventoPortal, desabilitadas: readonly string[]): boolean {
  const partes = PARTES_DO_EVENTO[evento]
  return partes.length > 0 && partes.every((p) => desabilitadas.includes(p))
}
