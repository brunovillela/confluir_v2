/**
 * Assembleias — constantes compartilhadas entre server e client.
 *
 * Hierarquia (confirmada com o usuário em 2026-07-19):
 * campanha (tema, fontes pagadoras) → rodada (período) → assembleias.
 * Perguntas e lista de aptos pertencem à RODADA — as assembleias "usam"
 * as perguntas da sua rodada.
 */

import { formatarData, formatarDataHora } from "@/lib/formato"

/**
 * Modalidade da assembleia — não é coluna: deriva das flags legadas
 * `online` e `urnas_de_votacao` de `voto_assembleias`. As quatro modalidades
 * (regra do usuário, 2026-08-29):
 * - online   — área do filiado / ambiente público (voto em `voto_online`);
 * - urna     — presencial com urnas (físicas ou digitais) no local;
 * - hibrida  — online E presencial com urnas ao mesmo tempo;
 * - reuniao  — reunião de colaboradores na base (resultado agregado em
 *   `voto_votacao_respostas`).
 * online e urna/híbrida gravam voto individual em `voto_online` (secreto).
 */
export const MODALIDADES = ["online", "urna", "hibrida", "reuniao"] as const

export type Modalidade = (typeof MODALIDADES)[number]

export const ROTULOS_MODALIDADE: Record<Modalidade, string> = {
  online: "Online",
  urna: "Presencial com urnas",
  hibrida: "Híbrida (online + urnas)",
  reuniao: "Reunião de colaboradores",
}

export function derivarModalidade(a: {
  online?: unknown
  urnas_de_votacao?: unknown
}): Modalidade {
  const temOnline = a.online === true
  const temUrna = a.urnas_de_votacao === true
  if (temOnline && temUrna) return "hibrida"
  if (temOnline) return "online"
  if (temUrna) return "urna"
  return "reuniao"
}

export function flagsDaModalidade(m: Modalidade): {
  online: boolean
  urnas_de_votacao: boolean
} {
  return {
    online: m === "online" || m === "hibrida",
    urnas_de_votacao: m === "urna" || m === "hibrida",
  }
}

/** A modalidade aceita voto online (área do filiado / público)? */
export function temVotoOnline(m: Modalidade): boolean {
  return m === "online" || m === "hibrida"
}

/** A modalidade usa urnas presenciais (com mesário)? */
export function temUrna(m: Modalidade): boolean {
  return m === "urna" || m === "hibrida"
}

// ── Estado da votação para quem está apto (portal do associado) ────────────

export type ChaveEstadoVotacao =
  | "ja_votou"
  | "nao_abriu"
  | "carencia"
  | "votar"
  | "presencial"

export type EstadoVotacao = {
  chave: ChaveEstadoVotacao
  /** Frase de cabeçalho (banner do Início). */
  titulo: string
  /** Rótulo curto do selo. */
  rotulo: string
  /** Variante do <Badge> do selo. */
  variante: "success" | "outline" | "warning" | "default"
  /** Frase de apoio: quando abre, por que ainda não pode, como votar. */
  detalhe: string | null
  /** Também há urna presencial — vale oferecer as datas. */
  comUrna: boolean
}

/**
 * O que a pessoa pode fazer AGORA numa votação em que está apta. Uma regra só
 * para o banner do Início, a lista de /portal/votacao e a cédula: antes cada
 * tela decidia por conta própria, e o Início chamava para "Votar" (com "encerra
 * em") uma votação que ainda nem tinha aberto ou que a carência bloqueava
 * (achados A3 e A89 da avaliação do portal, 11/10/2026).
 *
 * A ordem importa: quem já votou na rodada não vota de novo, mesmo numa
 * assembleia que ainda vai abrir (voto único por rodada) — por isso "já votou"
 * vem antes de "ainda não abriu". As travas de verdade continuam no servidor
 * (registrarVotoFiliado/registrarVotoEleitorEmail); isto só explica.
 */
export function estadoVotacao(a: {
  modalidade: Modalidade
  jaVotou: boolean
  abreEm: string | null
  carencia: { motivo: string; liberaEm: string | null } | null
  /** Fim da votação (ISO) — para não prometer um voto depois do encerramento. */
  termino?: string | null
}): EstadoVotacao {
  const comUrna = temUrna(a.modalidade)
  if (a.jaVotou) {
    return {
      chave: "ja_votou",
      titulo: "Você já votou nesta assembleia",
      rotulo: "Você já votou",
      variante: "success",
      detalhe: null,
      comUrna,
    }
  }
  if (!temVotoOnline(a.modalidade)) {
    return {
      chave: "presencial",
      titulo: "Assembleia presencial — confira as datas",
      rotulo: ROTULOS_MODALIDADE[a.modalidade],
      variante: "outline",
      detalhe: null,
      comUrna,
    }
  }
  if (a.abreEm) {
    const quando = formatarDataHora(a.abreEm)
    return {
      chave: "nao_abriu",
      titulo: `Votação abre em ${quando}`,
      rotulo: "Ainda não abriu",
      variante: "outline",
      detalhe: `A votação abre em ${quando}.`,
      comUrna,
    }
  }
  if (a.carencia) {
    const libera = a.carencia.liberaEm
    // Carência que só acaba depois do encerramento: "poderá votar a partir
    // de…" prometeria um voto que esta assembleia não vai mais receber.
    const depoisDoFim =
      libera && a.termino ? Date.parse(libera) > Date.parse(a.termino) : false
    return {
      chave: "carencia",
      titulo: "Votação aberta — você ainda está em carência",
      rotulo: "Ainda em carência",
      variante: "warning",
      detalhe:
        a.carencia.motivo +
        (!libera
          ? ""
          : depoisDoFim
            ? ` Sua carência termina em ${formatarData(libera)}, depois do encerramento desta votação.`
            : ` Você poderá votar a partir de ${formatarData(libera)}.`),
      comUrna,
    }
  }
  return {
    chave: "votar",
    titulo: "Assembleia aberta para votação",
    rotulo: "Votação aberta",
    variante: "default",
    // Híbrida: o voto único por rodada vale entre as portas — presença na urna
    // trava o online e o voto online trava a urna (votacao-portal.ts e
    // votacao-mesarios.ts conferem hora_voto/presenca_em do apto).
    detalhe: comUrna
      ? "Vote online ou compareça a uma urna — vale um só voto."
      : null,
    comUrna,
  }
}

const FUSO_BRASILIA = "America/Sao_Paulo"

/**
 * 'AAAA-MM-DD' de hoje no horário de Brasília. O servidor roda em UTC: depois
 * das 21h, o "hoje" dele já é amanhã (hojeLocalISO lê o relógio da máquina).
 */
export function hojeEmBrasilia(agora = new Date()): string {
  return agora.toLocaleDateString("sv-SE", { timeZone: FUSO_BRASILIA })
}

/**
 * ISO → '12/10 às 18:00' no horário de Brasília (com o ano quando não é o
 * corrente). É como o associado fala do prazo: "até quando dá para votar",
 * sem fazer conta em cima de "encerra em 1d 2h" (achado A93).
 */
export function quandoCurto(iso: string | null | undefined, agora = new Date()): string {
  if (!iso) return "—"
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return "—"
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("pt-BR", {
      timeZone: FUSO_BRASILIA,
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  )
  const dia =
    p.year === hojeEmBrasilia(agora).slice(0, 4)
      ? `${p.day}/${p.month}`
      : `${p.day}/${p.month}/${p.year}`
  return `${dia} às ${p.hour}:${p.minute}`
}

/** 'AAAA-MM-DD' → '12/10' (com o ano quando não é o corrente). */
export function diaCurto(data: string | null | undefined, agora = new Date()): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(data ?? "")
  if (!m) return "—"
  return m[1] === hojeEmBrasilia(agora).slice(0, 4) ? `${m[3]}/${m[2]}` : `${m[3]}/${m[2]}/${m[1]}`
}

/** Sala da assembleia virtual (reunião online), como o portal a mostra. */
export type SalaVirtual = {
  link: string
  /** 'AAAA-MM-DD' */
  data: string | null
  /** 'HH:MM' */
  hora: string | null
}

export function hojeLocalISO(): string {
  const d = new Date()
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-")
}

/**
 * Travas de edição da rodada (regras do usuário, 2026-07-20):
 * - Perguntas e opções: só enquanto a rodada NÃO tem assembleias cadastradas
 *   e o período NÃO começou.
 * - Assembleias: só com pelo menos uma pergunta com opções e enquanto o
 *   período NÃO terminou.
 */
/** Sem data de início, um término já alcançado também prova que iniciou. */
export function periodoIniciado(
  inicio: string | null,
  termino: string | null
): boolean {
  const hoje = hojeLocalISO()
  return (
    (inicio !== null && inicio <= hoje) ||
    (termino !== null && termino <= hoje)
  )
}

export function periodoTerminado(termino: string | null): boolean {
  return termino !== null && termino < hojeLocalISO()
}

/**
 * Perguntas e opções ficam abertas até a PRIMEIRA assembleia da rodada começar
 * (regra do usuário, 23/09/2026). Antes disso a equipe ainda ajusta o texto;
 * depois, mexer mudaria a cédula de quem já está votando.
 */
export const MOTIVO_PERGUNTAS_BLOQUEADAS = {
  assembleiaIniciada:
    "A primeira assembleia da rodada já começou — perguntas e opções não podem mais ser alteradas.",
  votos:
    "Já há voto registrado nesta rodada — perguntas e opções não podem mais ser alteradas.",
} as const

export const MOTIVO_ASSEMBLEIAS_BLOQUEADAS = {
  foraDaRodada:
    "O período da assembleia precisa caber no período da rodada.",
  semPerguntas:
    "Cadastre pelo menos uma pergunta com opções de resposta antes de criar assembleias.",
  periodo:
    "O período da rodada já terminou — assembleias não podem mais ser alteradas.",
} as const

// ── Janela de votação da assembleia (data + hora) ──────────────────────────

/**
 * A assembleia tem hora de início e de término (colunas hora_inicio /
 * hora_termino). Sem hora, vale o dia inteiro: começa 00:00 e termina 23:59.
 * O fuso é fixo em -03:00 (America/Sao_Paulo não tem mais horário de verão) —
 * assim a conta não muda com o relógio de quem abre a tela.
 */
export type JanelaFonte = {
  data_inicio?: string | null
  hora_inicio?: string | null
  data_termino?: string | null
  hora_termino?: string | null
}

export type Janela = { inicio: number | null; termino: number | null }

const FUSO = "-03:00"

/** 'HH:MM' ou 'HH:MM:SS' → 'HH:MM:SS'. */
function horaCompleta(hora: string | null | undefined, padrao: string): string {
  const h = (hora ?? "").trim()
  if (/^\d{2}:\d{2}$/.test(h)) return `${h}:00`
  if (/^\d{2}:\d{2}:\d{2}/.test(h)) return h.slice(0, 8)
  return padrao
}

/** Momento (ms) de uma data com hora no fuso de São Paulo. */
export function momentoLocal(
  data: string | null | undefined,
  hora: string | null | undefined,
  fimDoDia = false
): number | null {
  const dia = (data ?? "").slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dia)) return null
  const t = new Date(
    `${dia}T${horaCompleta(hora, fimDoDia ? "23:59:59" : "00:00:00")}${FUSO}`
  ).getTime()
  return Number.isNaN(t) ? null : t
}

export function janelaAssembleia(a: JanelaFonte): Janela {
  return {
    inicio: momentoLocal(a.data_inicio, a.hora_inicio),
    termino: momentoLocal(a.data_termino, a.hora_termino, true),
  }
}

export type SituacaoJanela = "antes" | "aberta" | "encerrada"

export function situacaoJanela(j: Janela, agora = Date.now()): SituacaoJanela {
  if (j.termino !== null && agora > j.termino) return "encerrada"
  if (j.inicio !== null && agora < j.inicio) return "antes"
  return "aberta"
}

/**
 * "Em breve" na lista de campanhas: uma assembleia que abre dentro deste prazo.
 * Sete dias é o horizonte de quem prepara a votação (avisar aptos, montar
 * urnas, conferir a lista) — mais que isso não é "breve", é agenda.
 */
export const DIAS_EM_BREVE = 7
export const PRAZO_EM_BREVE_MS = DIAS_EM_BREVE * 24 * 60 * 60 * 1000

/** 'HH:MM:SS' → '14:30'; vazio vira null. */
export function horaCurta(hora: string | null | undefined): string | null {
  const h = (hora ?? "").trim()
  return /^\d{2}:\d{2}/.test(h) ? h.slice(0, 5) : null
}

/**
 * Hora gravada junto do voto SECRETO (`voto_online.created_at`): truncada na
 * hora cheia. O horário exato fica só na participação do apto (`hora_voto`)
 * e no comprovante. Com o mesmo instante nos dois lados, quem lesse o banco
 * cruzava voto e eleitor pelo timestamp (achado S4 da avaliação de 03/10).
 * A hora cheia ainda serve para gráficos de "votos por período".
 */
export function horaDoVotoSecreto(iso: string): string {
  const d = new Date(iso)
  d.setUTCMinutes(0, 0, 0)
  return d.toISOString()
}
